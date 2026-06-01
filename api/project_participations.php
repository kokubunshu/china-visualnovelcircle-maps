<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/../includes/project_hub.php';

$partsFile = projectHubDataPath('project_participations.json');
$method = $_SERVER['REQUEST_METHOD'];

$findProject = function (int $projectId): ?array {
    foreach (projectHubLoadProjects(true, true) as $project) {
        if ((int)($project['id'] ?? 0) === $projectId) {
            return $project;
        }
    }
    return null;
};

$findItem = function (string $itemId, int $projectId = 0): ?array {
    foreach (projectHubLoadItems(true, true) as $item) {
        if (($item['id'] ?? '') === $itemId && ($projectId <= 0 || (int)($item['project_id'] ?? 0) === $projectId)) {
            return $item;
        }
    }
    return null;
};

if ($method === 'GET') {
    $includeWithdrawn = isset($_GET['include_withdrawn']) && $_GET['include_withdrawn'] === '1';
    $data = projectHubJsonRead($partsFile, ['participations' => []]);
    $rows = $data['participations'] ?? [];
    if (!$includeWithdrawn) {
        $rows = array_values(array_filter($rows, fn($p) => ($p['status'] ?? '') !== 'withdrawn'));
    }
    $projectId = (int)($_GET['project_id'] ?? 0);
    $itemId = projectHubCleanString($_GET['item_id'] ?? '', 60);
    if ($projectId > 0) {
        $rows = array_values(array_filter($rows, fn($p) => (int)($p['project_id'] ?? 0) === $projectId));
    }
    if ($itemId !== '') {
        $rows = array_values(array_filter($rows, fn($p) => ($p['item_id'] ?? '') === $itemId));
    }
    projectHubRespond(['success' => true, 'participations' => $rows]);
}

$authUser = requireLogin();
$input = projectHubInput();

if ($method === 'POST') {
    $projectId = (int)($input['project_id'] ?? 0);
    $itemId = projectHubCleanString($input['item_id'] ?? '', 60);
    $project = $findProject($projectId);
    $item = $findItem($itemId, $projectId);
    if (!$project || !empty($project['deleted_at']) || !$item || !empty($item['deleted_at'])) {
        projectHubRespond(['success' => false, 'message' => '企划或参与项不存在'], 404);
    }
    if (($item['status'] ?? 'open') === 'closed') {
        projectHubRespond(['success' => false, 'message' => '该参与项已关闭'], 400);
    }
    $content = projectHubCleanString($input['content'] ?? '', 6000);
    if ($content === '') {
        projectHubRespond(['success' => false, 'message' => '请填写参与内容'], 400);
    }
    $participantType = ($input['participant_type'] ?? 'user') === 'club' ? 'club' : 'user';
    $club = projectHubNormalizeClub($input['club'] ?? $input['club_id'] ?? null);
    if ($participantType === 'club') {
        $club = projectHubNormalizeClub($input['club'] ?? null);
        if (!$club || !projectHubCanManageClub($authUser, $club['id'], $club['country'])) {
            projectHubRespond(['success' => false, 'message' => '无权代表该同好会参与'], 403);
        }
    }

    $data = projectHubJsonRead($partsFile, ['participations' => []]);
    $rows = $data['participations'] ?? [];
    $row = [
        'id' => projectHubNextIntId($rows),
        'project_id' => $projectId,
        'item_id' => $itemId,
        'participant_type' => $participantType,
        'user_id' => (int)$authUser['id'],
        'club_id' => $club['id'] ?? null,
        'club_country' => $club['country'] ?? null,
        'display_name' => projectHubCleanString($input['display_name'] ?? ($authUser['nickname'] ?? $authUser['username'] ?? '匿名用户'), 80),
        'contact' => projectHubCleanString($input['contact'] ?? '', 200),
        'content' => $content,
        'attachments' => is_array($input['attachments'] ?? null) ? $input['attachments'] : [],
        'status' => 'submitted',
        'created_at' => projectHubNow(),
        'updated_at' => projectHubNow(),
    ];
    $rows[] = $row;
    $data['participations'] = $rows;
    if (!projectHubJsonWrite($partsFile, $data)) {
        projectHubRespond(['success' => false, 'message' => '保存失败'], 500);
    }
    $oc = projectHubNormalizeClub($project['organizer_club'] ?? null);
    if ($oc) {
        projectHubNotifyClubAdmins(
            $oc,
            '新的企划参与提交',
            '「' . ($project['title'] ?? '未命名企划') . '」收到新的「' . ($item['label'] ?? '参与项') . '」提交。',
            $projectId
        );
    }
    projectHubRespond(['success' => true, 'message' => '已提交参与', 'participation' => $row]);
}

if ($method === 'PUT') {
    $id = (int)($input['id'] ?? 0);
    if ($id <= 0) {
        projectHubRespond(['success' => false, 'message' => '无效参与记录 ID'], 400);
    }
    $data = projectHubJsonRead($partsFile, ['participations' => []]);
    $rows = $data['participations'] ?? [];
    $idx = null;
    foreach ($rows as $i => $row) {
        if ((int)($row['id'] ?? 0) === $id) {
            $idx = $i;
            break;
        }
    }
    if ($idx === null) {
        projectHubRespond(['success' => false, 'message' => '参与记录不存在'], 404);
    }
    $project = $findProject((int)$rows[$idx]['project_id']);
    if (!$project || !projectHubCanManageProject($authUser, $project)) {
        projectHubRespond(['success' => false, 'message' => '权限不足'], 403);
    }
    $allowedStatuses = ['submitted', 'reviewing', 'accepted', 'rejected', 'withdrawn'];
    if (isset($input['status']) && in_array($input['status'], $allowedStatuses, true)) {
        $rows[$idx]['status'] = $input['status'];
    }
    if (array_key_exists('review_note', $input)) {
        $rows[$idx]['review_note'] = projectHubCleanString($input['review_note'], 1000);
    }
    $rows[$idx]['reviewed_by'] = (int)$authUser['id'];
    $rows[$idx]['updated_at'] = projectHubNow();
    $data['participations'] = $rows;
    if (!projectHubJsonWrite($partsFile, $data)) {
        projectHubRespond(['success' => false, 'message' => '保存失败'], 500);
    }
    if (in_array($rows[$idx]['status'], ['accepted', 'rejected'], true)) {
        projectHubNotify(
            (int)$rows[$idx]['user_id'],
            'project_review',
            '企划参与审核结果',
            '「' . ($project['title'] ?? '未命名企划') . '」的参与状态已更新为：' . $rows[$idx]['status'],
            './user.html#notifications',
            'project_participation',
            (int)$rows[$idx]['id']
        );
    }
    projectHubRespond(['success' => true, 'message' => '参与记录已更新', 'participation' => $rows[$idx]]);
}

projectHubRespond(['success' => false, 'message' => '不支持的请求方法'], 405);
