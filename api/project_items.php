<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/../includes/project_hub.php';

$itemsFile = projectHubDataPath('project_items.json');
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $includeDeleted = isset($_GET['include_deleted']) && $_GET['include_deleted'] === '1';
    $items = projectHubLoadItems($includeDeleted, true);
    $projectId = (int)($_GET['project_id'] ?? 0);
    if ($projectId > 0) {
        $items = array_values(array_filter($items, fn($item) => (int)($item['project_id'] ?? 0) === $projectId));
    }
    projectHubRespond(['success' => true, 'items' => $items]);
}

$authUser = requireLogin();
$input = projectHubInput();
$projects = projectHubLoadProjects(true, false);

$findProject = function (int $projectId) use ($projects): ?array {
    foreach ($projects as $project) {
        if ((int)($project['id'] ?? 0) === $projectId) {
            return $project;
        }
    }
    return null;
};

if ($method === 'POST') {
    $projectId = (int)($input['project_id'] ?? 0);
    $project = $findProject($projectId);
    if (!$project || !empty($project['deleted_at'])) {
        projectHubRespond(['success' => false, 'message' => '企划不存在'], 404);
    }
    if (!projectHubCanManageProject($authUser, $project)) {
        projectHubRespond(['success' => false, 'message' => '权限不足'], 403);
    }
    $label = projectHubCleanString($input['label'] ?? '', 80);
    if ($label === '') {
        projectHubRespond(['success' => false, 'message' => '请填写参与项名称'], 400);
    }
    $allowedTypes = ['submission', 'registration', 'collaboration', 'survey', 'voting', 'other'];
    $type = in_array($input['type'] ?? '', $allowedTypes, true) ? $input['type'] : 'submission';

    $data = projectHubJsonRead($itemsFile, ['items' => []]);
    $items = $data['items'] ?? [];
    $item = [
        'id' => projectHubNextItemId($items),
        'project_id' => $projectId,
        'type' => $type,
        'label' => $label,
        'description' => projectHubCleanString($input['description'] ?? '', 1000),
        'deadline' => projectHubCleanDate($input['deadline'] ?? ''),
        'status' => ($input['status'] ?? 'open') === 'closed' ? 'closed' : 'open',
        'max_slots' => isset($input['max_slots']) && $input['max_slots'] !== '' ? max(1, (int)$input['max_slots']) : null,
        'form_schema' => is_array($input['form_schema'] ?? null) ? $input['form_schema'] : null,
        'deleted_at' => null,
        'created_at' => projectHubNow(),
        'updated_at' => projectHubNow(),
    ];
    $items[] = $item;
    $data['items'] = $items;
    if (!projectHubJsonWrite($itemsFile, $data)) {
        projectHubRespond(['success' => false, 'message' => '保存失败'], 500);
    }
    projectHubRespond(['success' => true, 'message' => '参与项已创建', 'item' => $item]);
}

if ($method === 'PUT') {
    $id = projectHubCleanString($input['id'] ?? '', 60);
    if ($id === '') {
        projectHubRespond(['success' => false, 'message' => '无效参与项 ID'], 400);
    }
    $data = projectHubJsonRead($itemsFile, ['items' => []]);
    $items = $data['items'] ?? [];
    $idx = null;
    foreach ($items as $i => $item) {
        if (($item['id'] ?? '') === $id) {
            $idx = $i;
            break;
        }
    }
    if ($idx === null) {
        projectHubRespond(['success' => false, 'message' => '参与项不存在'], 404);
    }
    $project = $findProject((int)$items[$idx]['project_id']);
    if (!$project || !projectHubCanManageProject($authUser, $project)) {
        projectHubRespond(['success' => false, 'message' => '权限不足'], 403);
    }
    foreach (['type', 'label', 'description', 'deadline', 'status', 'max_slots', 'form_schema'] as $field) {
        if (!array_key_exists($field, $input)) {
            continue;
        }
        if ($field === 'deadline') {
            $items[$idx][$field] = projectHubCleanDate($input[$field]);
        } elseif ($field === 'status') {
            $items[$idx][$field] = $input[$field] === 'closed' ? 'closed' : 'open';
        } elseif ($field === 'max_slots') {
            $items[$idx][$field] = $input[$field] === '' || $input[$field] === null ? null : max(1, (int)$input[$field]);
        } elseif ($field === 'form_schema') {
            $items[$idx][$field] = is_array($input[$field]) ? $input[$field] : null;
        } else {
            $items[$idx][$field] = projectHubCleanString($input[$field], $field === 'description' ? 1000 : 80);
        }
    }
    $items[$idx]['updated_at'] = projectHubNow();
    $data['items'] = $items;
    if (!projectHubJsonWrite($itemsFile, $data)) {
        projectHubRespond(['success' => false, 'message' => '保存失败'], 500);
    }
    projectHubRespond(['success' => true, 'message' => '参与项已更新', 'item' => $items[$idx]]);
}

if ($method === 'DELETE') {
    $id = projectHubCleanString($input['id'] ?? $_GET['id'] ?? '', 60);
    $data = projectHubJsonRead($itemsFile, ['items' => []]);
    $items = $data['items'] ?? [];
    $idx = null;
    foreach ($items as $i => $item) {
        if (($item['id'] ?? '') === $id) {
            $idx = $i;
            break;
        }
    }
    if ($idx === null) {
        projectHubRespond(['success' => false, 'message' => '参与项不存在'], 404);
    }
    $project = $findProject((int)$items[$idx]['project_id']);
    if (!$project || !projectHubCanManageProject($authUser, $project)) {
        projectHubRespond(['success' => false, 'message' => '权限不足'], 403);
    }
    $items[$idx]['deleted_at'] = projectHubNow();
    $items[$idx]['updated_at'] = projectHubNow();
    $data['items'] = $items;
    if (!projectHubJsonWrite($itemsFile, $data)) {
        projectHubRespond(['success' => false, 'message' => '删除失败'], 500);
    }
    projectHubRespond(['success' => true, 'message' => '参与项已删除']);
}

projectHubRespond(['success' => false, 'message' => '不支持的请求方法'], 405);
