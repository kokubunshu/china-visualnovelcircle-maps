<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../includes/project_hub.php';

$authUser = requireRole('super_admin');
$projectsFile = projectHubDataPath('projects.json');
$itemsFile = projectHubDataPath('project_items.json');

$projectsData = projectHubJsonRead($projectsFile, ['projects' => [], 'migrated_at' => null]);
if (!empty($projectsData['migrated_at'])) {
    projectHubRespond(['success' => true, 'message' => '已迁移，无需重复执行', 'stats' => ['projects_migrated' => 0, 'items_created' => 0]]);
}

$fallback = projectHubFallbackFromPublications();
$existingProjects = $projectsData['projects'] ?? [];
$existingIds = [];
foreach ($existingProjects as $project) {
    if (isset($project['legacy_publication_id'])) {
        $existingIds[(int)$project['legacy_publication_id']] = true;
    }
}

$newProjects = [];
foreach ($fallback['projects'] as $project) {
    if (empty($existingIds[(int)($project['legacy_publication_id'] ?? 0)])) {
        $newProjects[] = $project;
    }
}

$itemsData = projectHubJsonRead($itemsFile, ['items' => []]);
$existingItemIds = array_fill_keys(array_map(fn($item) => (string)($item['id'] ?? ''), $itemsData['items'] ?? []), true);
$newItems = [];
foreach ($fallback['items'] as $item) {
    if (empty($existingItemIds[(string)$item['id']])) {
        $newItems[] = $item;
    }
}

$projectsData['projects'] = array_values(array_merge($existingProjects, $newProjects));
$projectsData['migrated_at'] = projectHubNow();
$itemsData['items'] = array_values(array_merge($itemsData['items'] ?? [], $newItems));

if (!projectHubJsonWrite($projectsFile, $projectsData) || !projectHubJsonWrite($itemsFile, $itemsData)) {
    projectHubRespond(['success' => false, 'message' => '迁移写入失败'], 500);
}

projectHubRespond([
    'success' => true,
    'message' => '迁移完成',
    'stats' => [
        'projects_migrated' => count($newProjects),
        'items_created' => count($newItems),
    ],
]);
