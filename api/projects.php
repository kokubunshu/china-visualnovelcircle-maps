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

$projectsFile = projectHubDataPath('projects.json');
$itemsFile = projectHubDataPath('project_items.json');
$participationsFile = projectHubDataPath('project_participations.json');
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $includeDeleted = isset($_GET['include_deleted']) && $_GET['include_deleted'] === '1';
    $projects = projectHubLoadProjects($includeDeleted, true);
    $type = projectHubCleanString($_GET['type'] ?? '', 30);
    $status = projectHubCleanString($_GET['status'] ?? '', 30);
    if ($type !== '' && $type !== 'all') {
        $projects = array_values(array_filter($projects, fn($p) => ($p['project_type'] ?? '') === $type));
    }
    if ($status !== '' && $status !== 'all') {
        $projects = array_values(array_filter($projects, fn($p) => ($p['status'] ?? '') === $status));
    }
    projectHubRespond(['success' => true, 'projects' => $projects]);
}

$authUser = requireLogin();
$input = projectHubInput();

if ($method === 'POST') {
    $title = projectHubCleanString($input['title'] ?? '', 120);
    if ($title === '') {
        projectHubRespond(['success' => false, 'message' => '请填写企划名称'], 400);
    }
    $allowedTypes = ['publication', 'activity', 'content', 'recruit', 'other'];
    $allowedStatuses = ['draft', 'collecting', 'ongoing', 'completed', 'archived'];
    $type = in_array($input['project_type'] ?? '', $allowedTypes, true) ? $input['project_type'] : 'publication';
    $status = in_array($input['status'] ?? '', $allowedStatuses, true) ? $input['status'] : 'collecting';

    $organizer = projectHubNormalizeClub($input['organizer_club'] ?? null);
    if (!$organizer && !empty($input['club_name'])) {
        $organizer = projectHubFindClubByName((string)$input['club_name']);
    }
    if (!$organizer) {
        $organizer = projectHubFirstManagedClub($authUser);
    }
    if (!$organizer && ($authUser['role'] ?? '') === 'super_admin') {
        $organizer = ['id' => (int)($input['club_id'] ?? 0), 'country' => projectHubCleanString($input['country'] ?? 'china', 20) ?: 'china'];
        if ((int)$organizer['id'] <= 0) {
            $clubs = projectHubJsonRead(projectHubDataPath('clubs.json'), ['data' => []]);
            $firstClub = $clubs['data'][0] ?? null;
            if ($firstClub && (int)($firstClub['id'] ?? 0) > 0) {
                $organizer = ['id' => (int)$firstClub['id'], 'country' => 'china'];
            }
        }
    }
    if (!$organizer || (int)$organizer['id'] <= 0) {
        projectHubRespond(['success' => false, 'message' => '请先绑定或选择可管理的同好会'], 403);
    }
    if (!projectHubCanManageClub($authUser, (int)$organizer['id'], $organizer['country'])) {
        projectHubRespond(['success' => false, 'message' => '无权以该同好会发起企划'], 403);
    }

    $data = projectHubJsonRead($projectsFile, ['projects' => [], 'migrated_at' => null]);
    $projects = $data['projects'] ?? [];
    $now = projectHubNow();
    $project = [
        'id' => projectHubNextIntId($projects),
        'title' => $title,
        'project_type' => $type,
        'is_joint' => !empty($input['is_joint']),
        'status' => $status,
        'organizer_club' => $organizer,
        'participant_clubs' => projectHubNormalizeClubs($input['participant_clubs'] ?? []),
        'summary' => projectHubCleanString($input['summary'] ?? '', 160),
        'description' => projectHubCleanString($input['description'] ?? '', 8000),
        'cover_image' => projectHubCleanString($input['cover_image'] ?? '', 500),
        'deadline' => projectHubCleanDate($input['deadline'] ?? ''),
        'event_date' => projectHubCleanDate($input['event_date'] ?? ''),
        'event_date_end' => projectHubCleanDate($input['event_date_end'] ?? ''),
        'results_description' => projectHubCleanString($input['results_description'] ?? '', 4000),
        'results_link' => projectHubCleanString($input['results_link'] ?? '', 500),
        'deleted_at' => null,
        'created_at' => $now,
        'updated_at' => $now,
    ];
    $project = projectHubSyncCalendarEvent($project);
    $projects[] = $project;
    $data['projects'] = $projects;
    if (!projectHubJsonWrite($projectsFile, $data)) {
        projectHubRespond(['success' => false, 'message' => '保存失败'], 500);
    }
    projectHubRespond(['success' => true, 'message' => '企划已创建', 'project' => $project]);
}

if ($method === 'PUT') {
    $id = (int)($input['id'] ?? 0);
    if ($id <= 0) {
        projectHubRespond(['success' => false, 'message' => '无效企划 ID'], 400);
    }
    $data = projectHubJsonRead($projectsFile, ['projects' => [], 'migrated_at' => null]);
    $projects = $data['projects'] ?? [];
    $idx = null;
    foreach ($projects as $i => $project) {
        if ((int)($project['id'] ?? 0) === $id) {
            $idx = $i;
            break;
        }
    }
    if ($idx === null) {
        projectHubRespond(['success' => false, 'message' => '企划不存在'], 404);
    }
    if (!projectHubCanManageProject($authUser, $projects[$idx])) {
        projectHubRespond(['success' => false, 'message' => '权限不足'], 403);
    }
    if (array_key_exists('organizer_club', $input)) {
        $nextOrganizer = projectHubNormalizeClub($input['organizer_club']);
        if (!$nextOrganizer) {
            projectHubRespond(['success' => false, 'message' => '请选择有效同好会'], 400);
        }
        if (!projectHubCanManageClub($authUser, (int)$nextOrganizer['id'], $nextOrganizer['country'])) {
            projectHubRespond(['success' => false, 'message' => '无权以该同好会发起企划'], 403);
        }
        $projects[$idx]['organizer_club'] = $nextOrganizer;
    }
    $allowedFields = ['title', 'project_type', 'is_joint', 'status', 'participant_clubs', 'summary', 'description', 'cover_image', 'deadline', 'event_date', 'event_date_end', 'results_description', 'results_link'];
    foreach ($allowedFields as $field) {
        if (!array_key_exists($field, $input)) {
            continue;
        }
        if ($field === 'is_joint') {
            $projects[$idx][$field] = (bool)$input[$field];
        } elseif ($field === 'participant_clubs') {
            $projects[$idx][$field] = projectHubNormalizeClubs($input[$field]);
        } elseif ($field === 'deadline') {
            $projects[$idx][$field] = projectHubCleanDate($input[$field]);
        } elseif ($field === 'event_date' || $field === 'event_date_end') {
            $projects[$idx][$field] = projectHubCleanDate($input[$field]);
        } else {
            $projects[$idx][$field] = projectHubCleanString($input[$field], in_array($field, ['description', 'results_description'], true) ? 8000 : 500);
        }
    }
    $projects[$idx]['updated_at'] = projectHubNow();
    $projects[$idx] = projectHubSyncCalendarEvent($projects[$idx]);
    $data['projects'] = $projects;
    if (!projectHubJsonWrite($projectsFile, $data)) {
        projectHubRespond(['success' => false, 'message' => '保存失败'], 500);
    }
    projectHubRespond(['success' => true, 'message' => '企划已更新', 'project' => $projects[$idx]]);
}

if ($method === 'DELETE') {
    $id = (int)($input['id'] ?? $_GET['id'] ?? 0);
    if ($id <= 0) {
        projectHubRespond(['success' => false, 'message' => '无效企划 ID'], 400);
    }
    $data = projectHubJsonRead($projectsFile, ['projects' => [], 'migrated_at' => null]);
    $projects = $data['projects'] ?? [];
    $idx = null;
    foreach ($projects as $i => $project) {
        if ((int)($project['id'] ?? 0) === $id) {
            $idx = $i;
            break;
        }
    }
    if ($idx === null) {
        projectHubRespond(['success' => false, 'message' => '企划不存在'], 404);
    }
    if (!projectHubCanManageProject($authUser, $projects[$idx])) {
        projectHubRespond(['success' => false, 'message' => '权限不足'], 403);
    }
    $now = projectHubNow();
    $projects[$idx]['deleted_at'] = $now;
    $projects[$idx]['updated_at'] = $now;
    projectHubDeleteCalendarEvent($projects[$idx]);
    $data['projects'] = $projects;

    $itemsData = projectHubJsonRead($itemsFile, ['items' => []]);
    foreach ($itemsData['items'] as &$item) {
        if ((int)($item['project_id'] ?? 0) === $id) {
            $item['deleted_at'] = $now;
        }
    }
    unset($item);

    $partsData = projectHubJsonRead($participationsFile, ['participations' => []]);
    foreach ($partsData['participations'] as &$part) {
        if ((int)($part['project_id'] ?? 0) === $id && ($part['status'] ?? '') !== 'withdrawn') {
            $part['status'] = 'withdrawn';
            $part['updated_at'] = $now;
        }
    }
    unset($part);

    if (!projectHubJsonWrite($projectsFile, $data) || !projectHubJsonWrite($itemsFile, $itemsData) || !projectHubJsonWrite($participationsFile, $partsData)) {
        projectHubRespond(['success' => false, 'message' => '删除失败'], 500);
    }
    projectHubRespond(['success' => true, 'message' => '企划已删除']);
}

projectHubRespond(['success' => false, 'message' => '不支持的请求方法'], 405);
