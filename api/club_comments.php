<?php
// api/club_comments.php - 同好会留言板 API
// 动作: list, add, delete

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/audit.php';

$action = $_GET['action'] ?? '';

/**
 * 检查用户是否为同好会活跃成员
 */
function isClubActiveMember(int $userId, int $clubId, string $country): bool {
    $db = getDB();
    try {
        $stmt = $db->prepare(
            "SELECT id FROM club_memberships WHERE user_id = ? AND club_id = ? AND country = ? AND status = 'active' AND role <> 'external'"
        );
        $stmt->execute([$userId, $clubId, $country]);
        return (bool)$stmt->fetch();
    } catch (Exception $e) {
        $stmt = $db->prepare(
            "SELECT id FROM club_memberships WHERE user_id = ? AND club_id = ? AND status = 'active' AND role <> 'external'"
        );
        $stmt->execute([$userId, $clubId]);
        return (bool)$stmt->fetch();
    }
}

/**
 * 检查用户是否有管理留言权限（负责人/管理员）
 */
function canManageComments(array $user, int $clubId, string $country): bool {
    if ($user['role'] === 'super_admin') return true;
    $db = getDB();
    try {
        $stmt = $db->prepare(
            "SELECT id FROM club_memberships WHERE user_id = ? AND club_id = ? AND country = ? AND role IN ('representative', 'manager') AND status = 'active'"
        );
        $stmt->execute([$user['id'], $clubId, $country]);
        return (bool)$stmt->fetch();
    } catch (Exception $e) {
        return false;
    }
}

switch ($action) {
    // ===== 获取留言列表（公开可读） =====
    case 'list':
        $clubId = (int)($_GET['club_id'] ?? 0);
        $country = $_GET['country'] ?? 'china';
        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = min(50, max(1, (int)($_GET['limit'] ?? 20)));
        $offset = ($page - 1) * $limit;

        if ($clubId <= 0) {
            echo json_encode(['success' => false, 'message' => '无效的同好会 ID']);
            exit();
        }

        $db = getDB();

        // 总数
        $countStmt = $db->prepare(
            "SELECT COUNT(*) FROM club_comments WHERE club_id = ? AND country = ? AND is_deleted = 0"
        );
        $countStmt->execute([$clubId, $country]);
        $total = (int)$countStmt->fetchColumn();

        // 留言列表（含用户信息）
        $stmt = $db->prepare(
            "SELECT c.id, c.club_id, c.user_id, c.content, c.created_at, c.updated_at,
                    u.username, u.avatar_url, u.nickname
             FROM club_comments c
             JOIN users u ON u.id = c.user_id
             WHERE c.club_id = ? AND c.country = ? AND c.is_deleted = 0
             ORDER BY c.created_at DESC
             LIMIT ? OFFSET ?"
        );
        $stmt->bindValue(1, $clubId, PDO::PARAM_INT);
        $stmt->bindValue(2, $country, PDO::PARAM_STR);
        $stmt->bindValue(3, $limit, PDO::PARAM_INT);
        $stmt->bindValue(4, $offset, PDO::PARAM_INT);
        $stmt->execute();
        $comments = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // 类型转换
        foreach ($comments as &$cmt) {
            $cmt['id'] = (int)$cmt['id'];
            $cmt['club_id'] = (int)$cmt['club_id'];
            $cmt['user_id'] = (int)$cmt['user_id'];
        }
        unset($cmt);

        echo json_encode([
            'success' => true,
            'data' => $comments,
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
        ], JSON_UNESCAPED_UNICODE);
        exit();

    // ===== 添加留言（仅成员） =====
    case 'add':
        $user = requireLogin();
        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input)) {
            echo json_encode(['success' => false, 'message' => '请求数据格式错误']);
            exit();
        }

        $clubId = (int)($input['club_id'] ?? 0);
        $country = $input['country'] ?? 'china';
        $content = trim($input['content'] ?? '');

        if ($clubId <= 0) {
            echo json_encode(['success' => false, 'message' => '无效的同好会 ID']);
            exit();
        }
        if ($content === '') {
            echo json_encode(['success' => false, 'message' => '请输入留言内容']);
            exit();
        }
        if (mb_strlen($content) > 1000) {
            echo json_encode(['success' => false, 'message' => '留言内容不能超过 1000 字']);
            exit();
        }

        // 仅成员可留言
        if (!isClubActiveMember((int)$user['id'], $clubId, $country)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => '仅同好会成员可留言']);
            exit();
        }

        $db = getDB();
        $stmt = $db->prepare(
            "INSERT INTO club_comments (club_id, country, user_id, content, created_at)
             VALUES (?, ?, ?, ?, ?)"
        );
        $stmt->execute([$clubId, $country, $user['id'], $content, date('Y-m-d H:i:s')]);

        $newId = $db->lastInsertId();

        echo json_encode([
            'success' => true,
            'message' => '留言成功',
            'id' => (int)$newId,
        ]);
        exit();

    // ===== 删除留言（管理员或本人） =====
    case 'delete':
        $user = requireLogin();
        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input) || !isset($input['id'])) {
            echo json_encode(['success' => false, 'message' => '无效数据']);
            exit();
        }

        $id = (int)$input['id'];
        $db = getDB();

        $stmt = $db->prepare("SELECT id, club_id, country, user_id, content FROM club_comments WHERE id = ? AND is_deleted = 0");
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            echo json_encode(['success' => false, 'message' => '留言不存在']);
            exit();
        }

        // 权限：本人、管理员、super_admin
        $isOwner = (int)$row['user_id'] === (int)$user['id'];
        $isManager = canManageComments($user, (int)$row['club_id'], $row['country'] ?: 'china');
        $isSuperAdmin = $user['role'] === 'super_admin';

        if (!$isOwner && !$isManager && !$isSuperAdmin) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => '无权删除此留言']);
            exit();
        }

        $delStmt = $db->prepare("UPDATE club_comments SET is_deleted = 1 WHERE id = ?");
        $delStmt->execute([$id]);

        logAction('delete_club_comment', 'club_comments', $id,
            ['club_id' => $row['club_id']]);

        echo json_encode(['success' => true, 'message' => '留言已删除']);
        exit();

    default:
        echo json_encode(['success' => false, 'message' => '未知操作 action=' . $action]);
        exit();
}
