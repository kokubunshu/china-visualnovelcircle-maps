<?php
// api/club_codes.php - 同好会绑定码管理 API
// 动作: list, generate, revoke, redeem

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
if (file_exists(__DIR__ . '/../includes/notifications.php')) {
    require_once __DIR__ . '/../includes/notifications.php';
}

$action = $_GET['action'] ?? '';

/**
 * 从 JSON 文件中查找同好会名称
 */
function getClubName($clubId, $country = 'china') {
    $file = $country === 'japan'
        ? __DIR__ . '/../data/clubs_japan.json'
        : __DIR__ . '/../data/clubs.json';
    if (!file_exists($file)) return '同好会#' . $clubId;
    $json = json_decode(file_get_contents($file), true);
    if (!is_array($json)) return '同好会#' . $clubId;
    foreach (($json['data'] ?? []) as $club) {
        if (($club['id'] ?? 0) == $clubId) {
            return $club['name'] ?? $club['display_name'] ?? '同好会#' . $clubId;
        }
    }
    return '同好会#' . $clubId;
}

/**
 * 检查用户是否有权限管理指定俱乐部的绑定码
 */
function canManageCodes(array $user, int $clubId, string $country): bool {
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

/**
 * 生成随机绑定码（大写字母 + 数字，8 位）
 */
function generateCode(): string {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉了易混淆的 I/O/0/1
    $code = '';
    for ($i = 0; $i < 8; $i++) {
        $code .= $chars[random_int(0, strlen($chars) - 1)];
    }
    return $code;
}

function ensureMembershipRedeemColumns(PDO $db): void {
    $columns = [
        'country' => "VARCHAR(20) DEFAULT 'china'",
        'left_at' => 'DATETIME NULL',
        'join_method' => "VARCHAR(50) DEFAULT 'school_no_code'",
        'contact_account' => "VARCHAR(255) DEFAULT ''",
    ];

    foreach ($columns as $column => $definition) {
        $exists = false;
        try {
            $stmt = $db->query('PRAGMA table_info(club_memberships)');
            $cols = $stmt->fetchAll(PDO::FETCH_COLUMN, 1);
            $exists = in_array($column, $cols, true);
        } catch (Exception $e) {
            try {
                $stmt = $db->query("SHOW COLUMNS FROM `club_memberships` LIKE '$column'");
                $exists = (bool)$stmt->fetch();
            } catch (Exception $e2) {}
        }

        if (!$exists) {
            try {
                $db->exec("ALTER TABLE `club_memberships` ADD COLUMN `$column` $definition");
            } catch (Exception $e) {}
        }
    }
}

switch ($action) {
    // ===== 列出绑定码 =====
    case 'list':
        $user = requireLogin();
        $clubId = (int)($_GET['club_id'] ?? 0);
        $country = $_GET['country'] ?? 'china';

        if ($clubId <= 0) {
            echo json_encode(['success' => false, 'message' => '无效的同好会 ID']);
            exit();
        }
        if (!canManageCodes($user, $clubId, $country)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => '无权查看绑定码']);
            exit();
        }

        $db = getDB();
        ensureMembershipRedeemColumns($db);
        $stmt = $db->prepare(
            "SELECT id, club_id, code, created_by, max_uses, use_count, expires_at, is_active, created_at
             FROM club_verification_codes WHERE club_id = ? AND (country = ? OR country = '' OR country IS NULL)
             ORDER BY created_at DESC"
        );
        $stmt->execute([$clubId, $country]);
        $codes = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // 计算每个码的有效状态
        $now = date('Y-m-d H:i:s');
        foreach ($codes as &$c) {
            $c['is_expired'] = !empty($c['expires_at']) && $c['expires_at'] < $now;
            $c['is_full'] = $c['use_count'] >= $c['max_uses'];
            $c['is_valid'] = $c['is_active'] && !$c['is_expired'] && !$c['is_full'];
        }
        unset($c);

        echo json_encode(['success' => true, 'codes' => $codes]);
        exit();

    // ===== 生成绑定码 =====
    case 'generate':
        $user = requireLogin();
        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input)) {
            echo json_encode(['success' => false, 'message' => '请求数据格式错误']);
            exit();
        }

        $clubId = (int)($input['club_id'] ?? 0);
        $country = $input['country'] ?? 'china';
        $maxUses = (int)($input['max_uses'] ?? 50);
        $expiresAt = $input['expires_at'] ?? null; // 可选，YYYY-MM-DD HH:MM:SS

        if ($clubId <= 0) {
            echo json_encode(['success' => false, 'message' => '无效的同好会 ID']);
            exit();
        }
        if (!canManageCodes($user, $clubId, $country)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => '无权生成绑定码']);
            exit();
        }
        if ($maxUses < 1 || $maxUses > 999) {
            echo json_encode(['success' => false, 'message' => '使用次数需在 1-999 之间']);
            exit();
        }

        $db = getDB();
        $code = generateCode();

        // 确保不重复
        $maxAttempts = 10;
        while ($maxAttempts > 0) {
            $check = $db->prepare("SELECT id FROM club_verification_codes WHERE code = ?");
            $check->execute([$code]);
            if (!$check->fetch()) break;
            $code = generateCode();
            $maxAttempts--;
        }

        $stmt = $db->prepare(
            "INSERT INTO club_verification_codes (club_id, code, created_by, max_uses, expires_at, country)
             VALUES (?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([$clubId, $code, $user['id'], $maxUses, $expiresAt, $country]);

        $newId = $db->lastInsertId();

        logAction('generate_club_code', 'club_verification_codes', $newId,
            ['club_id' => $clubId, 'code' => $code, 'max_uses' => $maxUses]);

        echo json_encode([
            'success' => true,
            'message' => '绑定码生成成功',
            'code' => [
                'id' => (int)$newId,
                'club_id' => $clubId,
                'code' => $code,
                'max_uses' => $maxUses,
                'use_count' => 0,
                'expires_at' => $expiresAt,
                'is_active' => 1,
                'created_at' => date('Y-m-d H:i:s'),
            ],
        ]);
        exit();

    // ===== 禁用绑定码 =====
    case 'revoke':
        $user = requireLogin();
        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input) || !isset($input['code_id'])) {
            echo json_encode(['success' => false, 'message' => '无效数据']);
            exit();
        }

        $codeId = (int)$input['code_id'];
        $db = getDB();

        // 获取码信息以验证权限
        $stmt = $db->prepare("SELECT id, club_id, country, code FROM club_verification_codes WHERE id = ?");
        $stmt->execute([$codeId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            echo json_encode(['success' => false, 'message' => '绑定码不存在']);
            exit();
        }

        if (!canManageCodes($user, (int)$row['club_id'], $row['country'] ?: 'china')) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => '无权禁用此绑定码']);
            exit();
        }

        $stmt = $db->prepare("UPDATE club_verification_codes SET is_active = 0 WHERE id = ?");
        $stmt->execute([$codeId]);

        logAction('revoke_club_code', 'club_verification_codes', $codeId,
            ['code' => $row['code']]);

        echo json_encode(['success' => true, 'message' => '绑定码已禁用']);
        exit();

    // ===== 使用绑定码加入同好会 =====
    case 'redeem':
        $user = requireLogin();
        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input)) {
            echo json_encode(['success' => false, 'message' => '请求数据格式错误']);
            exit();
        }

        $code = trim(strtoupper($input['code'] ?? ''));
        $clubId = (int)($input['club_id'] ?? 0);
        $country = $input['country'] ?? 'china';

        if ($code === '') {
            echo json_encode(['success' => false, 'message' => '请填写绑定码']);
            exit();
        }

        $db = getDB();
        ensureMembershipRedeemColumns($db);

        // 查找绑定码（仅凭 code 即可，不要求 club_id）
        $stmt = $db->prepare(
            "SELECT id, club_id, code, created_by, max_uses, use_count, expires_at, is_active, country
             FROM club_verification_codes WHERE code = ?"
        );
        $stmt->execute([$code]);
        $vc = $stmt->fetch(PDO::FETCH_ASSOC);

        // 如果找到码，使用其 club_id 和 country（除非客户端指定了更具体的值）
        if ($vc) {
            if ($clubId <= 0) $clubId = (int)$vc['club_id'];
            if ($country === 'china' && !empty($vc['country'])) $country = $vc['country'];
        }

        if (!$vc) {
            echo json_encode(['success' => false, 'message' => '绑定码无效']);
            exit();
        }

        // 检查是否 active
        if (!$vc['is_active']) {
            echo json_encode(['success' => false, 'message' => '绑定码已被禁用']);
            exit();
        }

        // 检查过期
        if (!empty($vc['expires_at']) && $vc['expires_at'] < date('Y-m-d H:i:s')) {
            echo json_encode(['success' => false, 'message' => '绑定码已过期']);
            exit();
        }

        // 检查使用次数
        if ($vc['use_count'] >= $vc['max_uses']) {
            echo json_encode(['success' => false, 'message' => '绑定码已达使用上限']);
            exit();
        }

        // 检查是否已经是该同好会的成员
        try {
            $stmt = $db->prepare(
                "SELECT id, status FROM club_memberships WHERE user_id = ? AND club_id = ? AND country = ?"
            );
            $stmt->execute([$user['id'], $clubId, $country]);
        } catch (Exception $e) {
            $stmt = $db->prepare(
                "SELECT id, status FROM club_memberships WHERE user_id = ? AND club_id = ?"
            );
            $stmt->execute([$user['id'], $clubId]);
        }
        $existing = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($existing) {
            if ($existing['status'] === 'active') {
                echo json_encode(['success' => false, 'message' => '你已经是该同好会的成员']);
                exit();
            }
            // 之前申请过但被拒绝/离开/踢出 — 重新激活
            $stmt = $db->prepare(
                "UPDATE club_memberships SET status = 'active', role = 'member', join_method = 'school_code', joined_at = ?, left_at = NULL WHERE id = ?"
            );
            $stmt->execute([date('Y-m-d H:i:s'), $existing['id']]);
        } else {
            // 新增绑定
            $stmt = $db->prepare(
                "INSERT INTO club_memberships (user_id, club_id, country, role, status, join_method, joined_at)
                 VALUES (?, ?, ?, 'member', 'active', 'school_code', ?)"
            );
            $stmt->execute([$user['id'], $clubId, $country, date('Y-m-d H:i:s')]);
        }

        // 增加使用次数
        $stmt = $db->prepare("UPDATE club_verification_codes SET use_count = use_count + 1 WHERE id = ?");
        $stmt->execute([$vc['id']]);

        // 发送通知（可选，notifications.php 可能未部署）
        $clubName = getClubName($clubId, $country);
        if (function_exists('createNotification')) {
            createNotification(
                $user['id'],
                'join_approved',
                '同好会加入成功',
                '你已通过绑定码加入同好会「' . $clubName . '」',
                '',
                'club',
                $clubId
            );
        }

        logAction('redeem_club_code', 'club_verification_codes', $vc['id'],
            ['club_id' => $clubId, 'code' => $code]);

        echo json_encode([
            'success' => true,
            'message' => '已通过绑定码加入同好会「' . $clubName . '」',
            'club_name' => $clubName,
        ]);
        exit();

    default:
        echo json_encode(['success' => false, 'message' => '未知操作 action=' . $action]);
        exit();
}
