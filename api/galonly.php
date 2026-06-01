<?php
// api/galonly.php - GalOnly 同好会出展申请 API
// 动作: list_events, check_eligibility, submit, get_application, update_application, upload_image, list_applications, vote

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
 * 解码 galonly_applications 表中的 image_path 字段为数组
 * 兼容旧数据（单路径字符串）和新数据（JSON 数组字符串）
 */
function decodeImagePaths($row): array {
    if (!$row || empty($row['image_path'])) {
        return [];
    }
    $decoded = json_decode($row['image_path'], true);
    return is_array($decoded) ? $decoded : [trim($row['image_path'])];
}

switch ($action) {
    case 'list_events':
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            echo json_encode(['success' => false, 'message' => '仅支持 GET 请求'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $db = getDB();
        $stmt = $db->query("SELECT * FROM galonly_events WHERE registration_open = 1 ORDER BY date ASC");
        $events = $stmt->fetchAll();

        // 如果用户已登录，查询其在每个活动的申请状态
        $currentUser = getCurrentUser();
        if ($currentUser) {
            $stmt = $db->prepare("SELECT id, event_id, status FROM galonly_applications WHERE user_id = ? ORDER BY updated_at ASC, id ASC");
            $stmt->execute([$currentUser['id']]);
            $userApps = $stmt->fetchAll();
            $appMap = [];
            $appIdMap = [];
            foreach ($userApps as $app) {
                $appMap[$app['event_id']] = $app['status'];
                $appIdMap[$app['event_id']] = $app['id'];
            }
            foreach ($events as &$event) {
                $event['user_application_status'] = $appMap[$event['id']] ?? null;
                $event['user_application_id'] = $appIdMap[$event['id']] ?? null;
            }
            unset($event);
        } else {
            foreach ($events as &$event) {
                $event['user_application_status'] = null;
            }
            unset($event);
        }

        echo json_encode(['success' => true, 'events' => $events], JSON_UNESCAPED_UNICODE);
        exit();

    case 'check_eligibility':
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            echo json_encode(['success' => false, 'message' => '仅支持 GET 请求'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $user = requireLogin();
        $db = getDB();

        $stmt = $db->prepare("SELECT club_id, country FROM club_memberships WHERE user_id = ? AND status = 'active'");
        $stmt->execute([$user['id']]);
        $clubs = $stmt->fetchAll();

        if (empty($clubs)) {
            echo json_encode([
                'success' => true,
                'eligible' => false,
                'clubs' => [],
                'reason' => '请先加入或创建一个同好会',
            ], JSON_UNESCAPED_UNICODE);
            exit();
        }

        echo json_encode([
            'success' => true,
            'eligible' => true,
            'clubs' => $clubs,
            'reason' => null,
        ], JSON_UNESCAPED_UNICODE);
        exit();

    case 'submit':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['success' => false, 'message' => '仅支持 POST 请求'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $user = requireLogin();
        $input = json_decode(file_get_contents('php://input'), true);

        $eventId = (int)($input['event_id'] ?? 0);
        $clubIds = $input['club_ids'] ?? [];
        $clubCountries = $input['club_countries'] ?? [];
        $isJoint = (int)($input['is_joint'] ?? 0);
        $jointName = trim($input['joint_name'] ?? '');
        $wantsUpgrade = (int)($input['wants_upgrade'] ?? 0);
        $contact = trim($input['contact'] ?? '');
        $notes = trim($input['notes'] ?? '');
        $boothName = trim($input['booth_name'] ?? '');
        $imagePaths = isset($input['image_paths']) && is_array($input['image_paths']) ? $input['image_paths'] : [];

        // 验证必填字段
        if (!$eventId) {
            echo json_encode(['success' => false, 'message' => '请选择活动'], JSON_UNESCAPED_UNICODE);
            exit();
        }
        if (!is_array($clubIds) || empty($clubIds)) {
            echo json_encode(['success' => false, 'message' => '请选择至少一个同好会'], JSON_UNESCAPED_UNICODE);
            exit();
        }
        if (!$contact) {
            echo json_encode(['success' => false, 'message' => '请输入联系方式'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $db = getDB();

        // 检查每个同好会是否已提交申请（禁止重复）
        foreach ($clubIds as $clubId) {
            $stmt = $db->prepare(
                "SELECT COUNT(*) FROM galonly_application_clubs ac
                 JOIN galonly_applications a ON ac.application_id = a.id
                 WHERE a.event_id = ? AND ac.club_id = ? AND a.status IN ('pending','approved')"
            );
            $stmt->execute([$eventId, (int)$clubId]);
            if ((int)$stmt->fetchColumn() > 0) {
                echo json_encode([
                    'success' => false,
                    'message' => "同好会 ID {$clubId} 已提交过申请",
                ], JSON_UNESCAPED_UNICODE);
                exit();
            }
        }

        $now = date('Y-m-d H:i:s');
        $db->beginTransaction();
        try {
            $stmt = $db->prepare(
                "INSERT INTO galonly_applications (event_id, user_id, is_joint, joint_name, wants_upgrade, contact, notes, image_path, booth_name, status, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)"
            );
            $stmt->execute([$eventId, $user['id'], $isJoint, $jointName, $wantsUpgrade, $contact, $notes, json_encode($imagePaths, JSON_UNESCAPED_UNICODE), $boothName, $now, $now]);
            $appId = (int)$db->lastInsertId();

            foreach ($clubIds as $i => $clubId) {
                $country = $clubCountries[$i] ?? '';
                $stmt = $db->prepare(
                    "INSERT INTO galonly_application_clubs (application_id, club_id, club_country) VALUES (?, ?, ?)"
                );
                $stmt->execute([$appId, (int)$clubId, $country]);
            }

            $db->commit();
            logAction('galonly.submit', 'galonly_application', $appId);

            echo json_encode(['success' => true, 'application_id' => $appId], JSON_UNESCAPED_UNICODE);
        } catch (Exception $e) {
            $db->rollBack();
            echo json_encode(['success' => false, 'message' => '提交失败：' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
        }
        exit();

    case 'get_application':
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            echo json_encode(['success' => false, 'message' => '仅支持 GET 请求'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $user = requireLogin();
        $eventId = (int)($_GET['event_id'] ?? 0);
        $applicationId = (int)($_GET['application_id'] ?? 0);

        $db = getDB();

        if ($applicationId) {
            $stmt = $db->prepare("SELECT * FROM galonly_applications WHERE id = ? AND user_id = ?");
            $stmt->execute([$applicationId, $user['id']]);
        } elseif ($eventId) {
            $stmt = $db->prepare("SELECT * FROM galonly_applications WHERE user_id = ? AND event_id = ? ORDER BY updated_at DESC, id DESC LIMIT 1");
            $stmt->execute([$user['id'], $eventId]);
        } else {
            echo json_encode(['success' => false, 'message' => '缺少 event_id 或 application_id 参数'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $application = $stmt->fetch();

        if ($application) {
            $stmt = $db->prepare("SELECT club_id, club_country FROM galonly_application_clubs WHERE application_id = ?");
            $stmt->execute([$application['id']]);
            $application['clubs'] = $stmt->fetchAll();
            $application['image_paths'] = decodeImagePaths($application);
        }

        echo json_encode(['success' => true, 'application' => $application ?: null], JSON_UNESCAPED_UNICODE);
        exit();

    case 'update_application':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['success' => false, 'message' => '仅支持 POST 请求'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $user = requireLogin();
        $input = json_decode(file_get_contents('php://input'), true);

        $applicationId = (int)($input['application_id'] ?? 0);
        if (!$applicationId) {
            echo json_encode(['success' => false, 'message' => '缺少 application_id'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $db = getDB();

        // 验证申请存在且属于当前用户
        $stmt = $db->prepare("SELECT status, event_id FROM galonly_applications WHERE id = ? AND user_id = ?");
        $stmt->execute([$applicationId, $user['id']]);
        $app = $stmt->fetch();

        if (!$app) {
            echo json_encode(['success' => false, 'message' => '申请不存在'], JSON_UNESCAPED_UNICODE);
            exit();
        }
        // 收集要更新的字段
        $fields = [];
        $params = [];

        if (isset($input['booth_name'])) {
            $fields[] = 'booth_name = ?';
            $params[] = trim($input['booth_name']);
        }
        if (isset($input['is_joint'])) {
            $fields[] = 'is_joint = ?';
            $params[] = (int)$input['is_joint'];
        }
        if (isset($input['joint_name'])) {
            $fields[] = 'joint_name = ?';
            $params[] = trim($input['joint_name']);
        }
        if (isset($input['wants_upgrade'])) {
            $fields[] = 'wants_upgrade = ?';
            $params[] = (int)$input['wants_upgrade'];
        }
        if (isset($input['contact'])) {
            $fields[] = 'contact = ?';
            $params[] = trim($input['contact']);
        }
        if (isset($input['notes'])) {
            $fields[] = 'notes = ?';
            $params[] = trim($input['notes']);
        }
        if (isset($input['image_paths']) && is_array($input['image_paths'])) {
            $fields[] = 'image_path = ?';
            $params[] = json_encode($input['image_paths'], JSON_UNESCAPED_UNICODE);
        }

        // 如果提供了同好会列表，检查唯一性约束
        $clubIdsChanged = isset($input['club_ids']) && is_array($input['club_ids']);
        if ($clubIdsChanged) {
            $newClubIds = $input['club_ids'];
            $newClubCountries = $input['club_countries'] ?? [];

            if (empty($newClubIds)) {
                echo json_encode(['success' => false, 'message' => '请选择至少一个同好会'], JSON_UNESCAPED_UNICODE);
                exit();
            }

            foreach ($newClubIds as $clubId) {
                $stmt = $db->prepare(
                    "SELECT COUNT(*) FROM galonly_application_clubs ac
                     JOIN galonly_applications a ON ac.application_id = a.id
                     WHERE a.event_id = ? AND ac.club_id = ? AND a.status IN ('pending','approved') AND a.id != ?"
                );
                $stmt->execute([$app['event_id'], (int)$clubId, $applicationId]);
                if ((int)$stmt->fetchColumn() > 0) {
                    echo json_encode([
                        'success' => false,
                        'message' => "同好会 ID {$clubId} 已提交过申请",
                    ], JSON_UNESCAPED_UNICODE);
                    exit();
                }
            }
        }

        // 只有在被驳回时才重置状态为 pending，清除旧投票，标记重审
        $now = date('Y-m-d H:i:s');
        $isResubmit = ($app['status'] === 'rejected');
        if ($isResubmit) {
            $fields[] = 'status = ?';
            $params[] = 'pending';
            $fields[] = 'resubmitted = 1';
        }
        // 已通过的申请被编辑时，标记更新但不改变状态
        if ($app['status'] === 'approved') {
            $fields[] = 'has_update = 1';
        }
        $fields[] = 'updated_at = ?';
        $params[] = $now;
        $params[] = $applicationId;

        $db->beginTransaction();
        try {
            // 重审时清除旧投票
            if ($isResubmit) {
                $db->prepare("DELETE FROM galonly_votes WHERE application_id = ?")->execute([$applicationId]);
            }

            $sql = "UPDATE galonly_applications SET " . implode(', ', $fields) . " WHERE id = ?";
            $stmt = $db->prepare($sql);
            $stmt->execute($params);

            if ($clubIdsChanged) {
                $db->prepare("DELETE FROM galonly_application_clubs WHERE application_id = ?")
                    ->execute([$applicationId]);

                foreach ($newClubIds as $i => $clubId) {
                    $country = $newClubCountries[$i] ?? '';
                    $stmt = $db->prepare(
                        "INSERT INTO galonly_application_clubs (application_id, club_id, club_country) VALUES (?, ?, ?)"
                    );
                    $stmt->execute([$applicationId, (int)$clubId, $country]);
                }
            }

            $db->commit();
            logAction('galonly.update_application', 'galonly_application', $applicationId);

            echo json_encode(['success' => true, 'message' => '申请已更新'], JSON_UNESCAPED_UNICODE);
        } catch (Exception $e) {
            $db->rollBack();
            echo json_encode(['success' => false, 'message' => '更新失败：' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
        }
        exit();

    case 'delete_application':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['success' => false, 'message' => '仅支持 POST 请求'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $user = requireLogin();
        $input = json_decode(file_get_contents('php://input'), true);
        $applicationId = (int)($input['application_id'] ?? 0);

        if (!$applicationId) {
            echo json_encode(['success' => false, 'message' => '缺少 application_id'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $db = getDB();

        // 验证申请存在且属于当前用户
        $stmt = $db->prepare("SELECT id, status, image_path FROM galonly_applications WHERE id = ? AND user_id = ?");
        $stmt->execute([$applicationId, $user['id']]);
        $app = $stmt->fetch();

        if (!$app) {
            echo json_encode(['success' => false, 'message' => '申请不存在'], JSON_UNESCAPED_UNICODE);
            exit();
        }
        if ($app['status'] === 'approved') {
            echo json_encode(['success' => false, 'message' => '已通过的申请无法删除'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $db->beginTransaction();
        try {
            $db->prepare("DELETE FROM galonly_votes WHERE application_id = ?")->execute([$applicationId]);
            $db->prepare("DELETE FROM galonly_application_clubs WHERE application_id = ?")->execute([$applicationId]);
            $db->prepare("DELETE FROM galonly_applications WHERE id = ?")->execute([$applicationId]);
            $db->commit();

            logAction('galonly.delete_application', 'galonly_application', $applicationId);
            echo json_encode(['success' => true, 'message' => '申请已删除'], JSON_UNESCAPED_UNICODE);
        } catch (Exception $e) {
            $db->rollBack();
            echo json_encode(['success' => false, 'message' => '删除失败：' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
        }
        exit();

    case 'upload_image':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['success' => false, 'message' => '仅支持 POST 请求'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $user = requireLogin();

        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            echo json_encode(['success' => false, 'message' => '文件上传失败'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $file = $_FILES['file'];
        $allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        $maxSize = 10485760; // 10MB

        if (!in_array($file['type'], $allowedTypes)) {
            echo json_encode(['success' => false, 'message' => '仅支持 JPG、PNG、WebP 格式'], JSON_UNESCAPED_UNICODE);
            exit();
        }
        if ($file['size'] > $maxSize) {
            echo json_encode(['success' => false, 'message' => '文件大小不能超过 10MB'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $eventId = (int)($_POST['event_id'] ?? 0);
        if (!$eventId) {
            echo json_encode(['success' => false, 'message' => '缺少 event_id 参数'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        // 根据 MIME 类型确定扩展名
        $extMap = [
            'image/jpeg' => 'jpg',
            'image/png'  => 'png',
            'image/webp' => 'webp',
        ];
        $ext = $extMap[$file['type']];

        $filename = $user['id'] . '_' . time() . '_' . uniqid() . '.' . $ext;
        $uploadDir = __DIR__ . '/../uploads/galonly/' . $eventId;

        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }

        $destPath = $uploadDir . '/' . $filename;
        if (!move_uploaded_file($file['tmp_name'], $destPath)) {
            echo json_encode(['success' => false, 'message' => '文件保存失败'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $relativePath = 'uploads/galonly/' . $eventId . '/' . $filename;

        echo json_encode(['success' => true, 'path' => $relativePath], JSON_UNESCAPED_UNICODE);
        exit();

    case 'list_applications':
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            echo json_encode(['success' => false, 'message' => '仅支持 GET 请求'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $user = requireLogin();
        if (!hasAuditPermission($user)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => '权限不足'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $db = getDB();
        $eventId = isset($_GET['event_id']) ? (int)$_GET['event_id'] : null;
        $status = $_GET['status'] ?? '';

        $sql = "SELECT a.*, u.nickname, u.username, u.avatar_url
                FROM galonly_applications a
                JOIN users u ON a.user_id = u.id
                WHERE 1=1";
        $params = [];

        if ($eventId) {
            $sql .= " AND a.event_id = ?";
            $params[] = $eventId;
        }
        if ($status && $status !== 'all') {
            $sql .= " AND a.status = ?";
            $params[] = $status;
        }
        $sql .= " ORDER BY a.created_at DESC";

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $applications = $stmt->fetchAll();

        foreach ($applications as &$app) {
            // 查询关联的同好会
            $stmt = $db->prepare("SELECT club_id, club_country FROM galonly_application_clubs WHERE application_id = ?");
            $stmt->execute([$app['id']]);
            $app['clubs'] = $stmt->fetchAll();

            // 查询投票统计
            $stmt = $db->prepare("SELECT vote, COUNT(*) as cnt FROM galonly_votes WHERE application_id = ? GROUP BY vote");
            $stmt->execute([$app['id']]);
            $voteRows = $stmt->fetchAll();
            $voteCounts = ['approve' => 0, 'reject' => 0];
            foreach ($voteRows as $row) {
                $voteCounts[$row['vote']] = (int)$row['cnt'];
            }
            $app['vote_counts'] = $voteCounts;

            // 查询当前用户的投票
            $stmt = $db->prepare("SELECT vote FROM galonly_votes WHERE application_id = ? AND auditer_id = ?");
            $stmt->execute([$app['id'], $user['id']]);
            $myVote = $stmt->fetchColumn();
            $app['my_vote'] = $myVote ?: null;

            // 解码图片路径为数组
            $app['image_paths'] = decodeImagePaths($app);
        }
        unset($app);

        echo json_encode(['success' => true, 'applications' => $applications], JSON_UNESCAPED_UNICODE);
        exit();

    case 'vote':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['success' => false, 'message' => '仅支持 POST 请求'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $user = requireLogin();
        if (!hasAuditPermission($user)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => '权限不足'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $input = json_decode(file_get_contents('php://input'), true);
        $applicationId = (int)($input['application_id'] ?? 0);
        $vote = $input['vote'] ?? '';

        if (!$applicationId) {
            echo json_encode(['success' => false, 'message' => '缺少 application_id'], JSON_UNESCAPED_UNICODE);
            exit();
        }
        if (!in_array($vote, ['approve', 'reject'])) {
            echo json_encode(['success' => false, 'message' => '投票值必须为 approve 或 reject'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $db = getDB();

        // 获取申请信息（用于通知）
        $appStmt = $db->prepare("SELECT ga.user_id, ga.booth_name, ge.name AS event_name FROM galonly_applications ga LEFT JOIN galonly_events ge ON ga.event_id = ge.id WHERE ga.id = ?");
        $appStmt->execute([$applicationId]);
        $appInfo = $appStmt->fetch();

        // 检查是否已投票
        $stmt = $db->prepare("SELECT id FROM galonly_votes WHERE application_id = ? AND auditer_id = ?");
        $stmt->execute([$applicationId, $user['id']]);
        if ($stmt->fetch()) {
            echo json_encode(['success' => false, 'message' => '您已对该申请投过票'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $now = date('Y-m-d H:i:s');
        $db->beginTransaction();
        try {
            // 插入投票
            $stmt = $db->prepare("INSERT INTO galonly_votes (application_id, auditer_id, vote) VALUES (?, ?, ?)");
            $stmt->execute([$applicationId, $user['id'], $vote]);

            // 统计投票结果
            $stmt = $db->prepare("SELECT vote, COUNT(*) as cnt FROM galonly_votes WHERE application_id = ? GROUP BY vote");
            $stmt->execute([$applicationId]);
            $voteRows = $stmt->fetchAll();
            $voteCounts = ['approve' => 0, 'reject' => 0];
            foreach ($voteRows as $row) {
                $voteCounts[$row['vote']] = (int)$row['cnt'];
            }

            // 判断是否达到审核阈值
            $result = 'pending';
            if ($voteCounts['approve'] >= 4) {
                $result = 'approved';
                $stmt = $db->prepare("UPDATE galonly_applications SET status = ?, updated_at = ? WHERE id = ?");
                $stmt->execute([$result, $now, $applicationId]);
            } elseif ($voteCounts['reject'] >= 4) {
                $result = 'rejected';
                $stmt = $db->prepare("UPDATE galonly_applications SET status = ?, updated_at = ? WHERE id = ?");
                $stmt->execute([$result, $now, $applicationId]);
            }

            // 审核通过/拒绝时发送通知
            if (in_array($result, ['approved', 'rejected']) && $appInfo) {
                require_once __DIR__ . '/../includes/notifications.php';
                $notifType = ($result === 'approved') ? 'galonly_approved' : 'galonly_rejected';
                $notifTitle = ($result === 'approved') ? '摊位申请已通过' : '摊位申请未通过';
                $notifMsg = ($result === 'approved')
                    ? '你在「' . ($appInfo['event_name'] ?? '') . '」的摊位「' . ($appInfo['booth_name'] ?? '') . '」已通过审核'
                    : '你在「' . ($appInfo['event_name'] ?? '') . '」的摊位申请未通过审核';
                createNotification(
                    $appInfo['user_id'],
                    $notifType,
                    $notifTitle,
                    $notifMsg,
                    'Galgame_events/galgameonly_list.html',
                    'galonly_application',
                    $applicationId
                );
            }

            $db->commit();

            echo json_encode([
                'success' => true,
                'result' => $result,
                'votes' => $voteCounts,
            ], JSON_UNESCAPED_UNICODE);
        } catch (Exception $e) {
            $db->rollBack();
            echo json_encode(['success' => false, 'message' => '投票失败：' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
        }
        exit();

    case 'withdraw_vote':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['success' => false, 'message' => '仅支持 POST 请求'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $user = requireLogin();
        if (!hasAuditPermission($user)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => '权限不足'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $input = json_decode(file_get_contents('php://input'), true);
        $applicationId = (int)($input['application_id'] ?? 0);

        if (!$applicationId) {
            echo json_encode(['success' => false, 'message' => '缺少 application_id'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $db = getDB();

        // 检查是否存在投票
        $stmt = $db->prepare("SELECT id, vote FROM galonly_votes WHERE application_id = ? AND auditer_id = ?");
        $stmt->execute([$applicationId, $user['id']]);
        $existingVote = $stmt->fetch();

        if (!$existingVote) {
            echo json_encode(['success' => false, 'message' => '你尚未对该申请投票'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $now = date('Y-m-d H:i:s');
        $db->beginTransaction();
        try {
            // 删除投票
            $stmt = $db->prepare("DELETE FROM galonly_votes WHERE id = ?");
            $stmt->execute([$existingVote['id']]);

            // 获取当前申请状态
            $stmt = $db->prepare("SELECT status FROM galonly_applications WHERE id = ?");
            $stmt->execute([$applicationId]);
            $currentStatus = $stmt->fetchColumn();

            // 重新统计投票
            $stmt = $db->prepare("SELECT vote, COUNT(*) as cnt FROM galonly_votes WHERE application_id = ? GROUP BY vote");
            $stmt->execute([$applicationId]);
            $voteRows = $stmt->fetchAll();
            $voteCounts = ['approve' => 0, 'reject' => 0];
            foreach ($voteRows as $row) {
                $voteCounts[$row['vote']] = (int)$row['cnt'];
            }

            // 重新判断审核状态
            $newStatus = 'pending';
            if ($voteCounts['approve'] >= 4) {
                $newStatus = 'approved';
            } elseif ($voteCounts['reject'] >= 4) {
                $newStatus = 'rejected';
            }

            // 仅在状态变化时更新
            if ($newStatus !== $currentStatus) {
                $db->prepare("UPDATE galonly_applications SET status = ?, updated_at = ? WHERE id = ?")
                    ->execute([$newStatus, $now, $applicationId]);
            }

            $db->commit();
            logAction('galonly.withdraw_vote', 'galonly_application', $applicationId);

            echo json_encode([
                'success' => true,
                'result' => $newStatus,
                'votes' => $voteCounts,
            ], JSON_UNESCAPED_UNICODE);
        } catch (Exception $e) {
            $db->rollBack();
            echo json_encode(['success' => false, 'message' => '撤回投票失败：' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
        }
        exit();

    case 'add_event':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['success' => false, 'message' => '仅支持 POST 请求'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $user = requireLogin();
        if (!hasAuditPermission($user)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => '权限不足'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $input = json_decode(file_get_contents('php://input'), true);
        $name = trim($input['name'] ?? '');
        $location = trim($input['location'] ?? '');
        $date = trim($input['date'] ?? '');
        $description = trim($input['description'] ?? '');

        if (!$name || !$date) {
            echo json_encode(['success' => false, 'message' => '活动名称和日期为必填项'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $db = getDB();
        $stmt = $db->prepare(
            "INSERT INTO galonly_events (name, location, date, registration_open, description, created_at)
             VALUES (?, ?, ?, 1, ?, ?)"
        );
        $now = date('Y-m-d H:i:s');
        $stmt->execute([$name, $location, $date, $description, $now]);
        $eventId = (int)$db->lastInsertId();

        logAction('galonly.add_event', 'galonly_event', $eventId, ['name' => $name]);

        echo json_encode(['success' => true, 'event_id' => $eventId], JSON_UNESCAPED_UNICODE);
        exit();

    case 'delete_event':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['success' => false, 'message' => '仅支持 POST 请求'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $user = requireLogin();
        if (!hasAuditPermission($user)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => '权限不足'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $input = json_decode(file_get_contents('php://input'), true);
        $eventId = (int)($input['event_id'] ?? 0);

        if (!$eventId) {
            echo json_encode(['success' => false, 'message' => '缺少 event_id'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $db = getDB();
        $stmt = $db->prepare("SELECT id FROM galonly_events WHERE id = ?");
        $stmt->execute([$eventId]);
        if (!$stmt->fetch()) {
            echo json_encode(['success' => false, 'message' => '活动不存在'], JSON_UNESCAPED_UNICODE);
            exit();
        }

        // 删除关联数据（投票、申请同好会、申请）
        $db->beginTransaction();
        try {
            $appIds = $db->prepare("SELECT id FROM galonly_applications WHERE event_id = ?");
            $appIds->execute([$eventId]);
            $ids = $appIds->fetchAll(PDO::FETCH_COLUMN);

            if ($ids) {
                $placeholders = implode(',', array_fill(0, count($ids), '?'));
                $db->prepare("DELETE FROM galonly_votes WHERE application_id IN ($placeholders)")->execute($ids);
                $db->prepare("DELETE FROM galonly_application_clubs WHERE application_id IN ($placeholders)")->execute($ids);
                $db->prepare("DELETE FROM galonly_applications WHERE id IN ($placeholders)")->execute($ids);
            }

            $db->prepare("DELETE FROM galonly_events WHERE id = ?")->execute([$eventId]);
            $db->commit();

            logAction('galonly.delete_event', 'galonly_event', $eventId);
            echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
        } catch (Exception $e) {
            $db->rollBack();
            echo json_encode(['success' => false, 'message' => '删除失败：' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
        }
        exit();

    default:
        echo json_encode(['success' => false, 'message' => '未知动作', 'available_actions' => [
            'list_events', 'check_eligibility', 'submit', 'get_application',
            'update_application', 'delete_application', 'upload_image',
            'list_applications', 'vote', 'withdraw_vote',
            'add_event', 'delete_event',
        ]], JSON_UNESCAPED_UNICODE);
        exit();
}
