<?php
// api/vote_projects.php - shared annual voting project API.

require_once __DIR__ . '/../includes/vote_projects.php';
require_once __DIR__ . '/../includes/audit.php';

voteBootstrap();
voteEnsureSchema();

$action = trim((string)($_GET['action'] ?? ''));
$typeFilter = isset($_GET['project_type']) ? voteNormalize((string)$_GET['project_type'], VOTE_PROJECT_TYPES, '') : '';
$db = getDB();

switch ($action) {
    case 'list':
        $country = strtolower(trim((string)($_GET['country'] ?? 'all')));
        $status = trim((string)($_GET['status'] ?? ''));
        $clubId = (int)($_GET['club_id'] ?? 0);
        $where = ["visibility = 'public'", "status <> 'draft'"];
        $params = [];
        if ($typeFilter !== '') {
            $where[] = 'project_type = ?';
            $params[] = $typeFilter;
        }
        if ($country !== '' && $country !== 'all') {
            $where[] = 'country = ?';
            $params[] = voteNormalizeCountry($country);
        }
        if ($clubId > 0) {
            $where[] = 'club_id = ?';
            $params[] = $clubId;
        }
        if ($status !== '' && in_array($status, VOTE_PROJECT_STATUSES, true)) {
            $where[] = 'status = ?';
            $params[] = $status;
        }
        $stmt = $db->prepare('SELECT * FROM vote_projects WHERE ' . implode(' AND ', $where) . ' ORDER BY updated_at DESC, id DESC LIMIT 100');
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $result = array_map('voteProjectRow', $rows);

        // Enrich with current_stage (first non-settled stage)
        if (!empty($result)) {
            $ids = array_map(function ($r) { return $r['id']; }, $result);
            $idPlaceholders = implode(',', array_fill(0, count($ids), '?'));
            $stageStmt = $db->prepare(
                "SELECT project_id, stage_type, title, status
                 FROM vote_stages
                 WHERE project_id IN ($idPlaceholders) AND status IN ('open', 'locked', 'pending')
                 ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'pending' THEN 1 WHEN 'locked' THEN 2 ELSE 3 END, sort_order ASC"
            );
            $stageStmt->execute(array_map('intval', $ids));
            $stageRows = $stageStmt->fetchAll(PDO::FETCH_ASSOC);
            $stageIndex = [];
            foreach ($stageRows as $sr) {
                $pid = (int)$sr['project_id'];
                if (!isset($stageIndex[$pid])) $stageIndex[$pid] = $sr;
            }
            foreach ($result as &$r) {
                $pid = $r['id'];
                $r['current_stage'] = $stageIndex[$pid] ?? null;
            }
        }

        voteRespond(['success' => true, 'data' => $result]);

    case 'my_manageable':
        $user = requireLogin();
        if (($user['role'] ?? '') === 'super_admin') {
            $where = [];
            $params = [];
            if ($typeFilter !== '') {
                $where[] = 'project_type = ?';
                $params[] = $typeFilter;
            }
            $sql = 'SELECT * FROM vote_projects';
            if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
            $sql .= ' ORDER BY updated_at DESC, id DESC LIMIT 200';
            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            voteRespond(['success' => true, 'data' => array_map('voteProjectRow', $stmt->fetchAll(PDO::FETCH_ASSOC))]);
        }
        $params = [(int)$user['id']];
        $typeSql = '';
        if ($typeFilter !== '') {
            $typeSql = ' AND p.project_type = ?';
            $params[] = $typeFilter;
        }
        $stmt = $db->prepare(
            "SELECT DISTINCT p.*
             FROM vote_projects p
             JOIN club_memberships m ON m.club_id = p.club_id AND m.country = p.country
             WHERE m.user_id = ? AND m.status = 'active' AND m.role IN ('representative', 'manager') $typeSql
             ORDER BY p.updated_at DESC, p.id DESC"
        );
        $stmt->execute($params);
        voteRespond(['success' => true, 'data' => array_map('voteProjectRow', $stmt->fetchAll(PDO::FETCH_ASSOC))]);

    case 'get':
        $project = voteGetProject((int)($_GET['id'] ?? $_GET['project_id'] ?? 0));
        if (!$project) voteRespond(['success' => false, 'message' => '企划不存在'], 404);
        if ($typeFilter !== '' && $project['project_type'] !== $typeFilter) voteRespond(['success' => false, 'message' => '企划不存在'], 404);
        $user = getCurrentUser();
        if (!voteCanReadProject($user, $project)) voteRespond(['success' => false, 'message' => '无权查看该企划'], 403);
        if (($project['status'] ?? '') === 'draft' && (!$user || !voteCanManageProject($user, $project))) {
            voteRespond(['success' => false, 'message' => '企划不存在'], 404);
        }
        $stmt = $db->prepare('SELECT * FROM vote_stages WHERE project_id = ? ORDER BY sort_order ASC, id ASC');
        $stmt->execute([(int)$project['id']]);
        voteRespond([
            'success' => true,
            'data' => voteProjectRow($project),
            'stages' => $stmt->fetchAll(PDO::FETCH_ASSOC),
            'can_manage' => $user ? voteCanManageProject($user, $project) : false,
            'can_participate' => voteCanParticipateProject($user, $project),
        ]);

    case 'create':
        $user = requireLogin();
        $input = voteReadJson();
        $projectType = voteNormalize((string)($input['project_type'] ?? $typeFilter), VOTE_PROJECT_TYPES, 'twelve');
        $clubId = (int)($input['club_id'] ?? 0);
        $country = voteNormalizeCountry($input['country'] ?? 'china');
        $title = trim((string)($input['title'] ?? ''));
        if ($clubId <= 0 || $title === '') voteRespond(['success' => false, 'message' => '请填写同好会和企划标题'], 400);
        if (!canManageClubInCountry($user, $clubId, $country)) voteRespond(['success' => false, 'message' => '只有负责人/管理员可创建本会企划'], 403);
        $visibility = voteNormalize((string)($input['visibility'] ?? 'public'), VOTE_VISIBILITIES, 'public');
        $eligibility = voteNormalize((string)($input['eligibility_mode'] ?? 'club_member'), VOTE_ELIGIBILITY_MODES, 'club_member');
        $resultVisibility = voteNormalize((string)($input['result_visibility'] ?? 'live_rank_only'), VOTE_RESULT_VISIBILITIES, 'live_rank_only');
        $stmt = $db->prepare(
            "INSERT INTO vote_projects
             (project_type, club_id, country, title, year_label, description, cover_url, status, visibility, eligibility_mode, result_visibility, config_json, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)"
        );
        $stmt->execute([
            $projectType,
            $clubId,
            $country,
            $title,
            trim((string)($input['year_label'] ?? date('Y'))),
            trim((string)($input['description'] ?? '')),
            trim((string)($input['cover_url'] ?? '')),
            $visibility,
            $eligibility,
            $resultVisibility,
            voteJson($input['config'] ?? []),
            (int)$user['id'],
        ]);
        $id = (int)$db->lastInsertId();
        voteDefaultStages($db, $id, $projectType);
        logAction('vote_project.create', 'vote_projects', $id, ['project_type' => $projectType, 'club_id' => $clubId, 'country' => $country]);
        voteRespond(['success' => true, 'id' => $id, 'project_type' => $projectType]);

    case 'update':
        [$user, $project] = voteRequireProjectManager((int)($_GET['id'] ?? 0));
        $input = voteReadJson();
        $now = voteNowExpr();
        $stmt = $db->prepare(
            "UPDATE vote_projects
             SET title = ?, year_label = ?, description = ?, cover_url = ?, visibility = ?, eligibility_mode = ?, result_visibility = ?, config_json = ?, updated_at = $now
             WHERE id = ?"
        );
        $stmt->execute([
            trim((string)($input['title'] ?? $project['title'])),
            trim((string)($input['year_label'] ?? ($project['year_label'] ?? ''))),
            trim((string)($input['description'] ?? ($project['description'] ?? ''))),
            trim((string)($input['cover_url'] ?? ($project['cover_url'] ?? ''))),
            voteNormalize((string)($input['visibility'] ?? ($project['visibility'] ?? 'public')), VOTE_VISIBILITIES, 'public'),
            voteNormalize((string)($input['eligibility_mode'] ?? ($project['eligibility_mode'] ?? 'club_member')), VOTE_ELIGIBILITY_MODES, 'club_member'),
            voteNormalize((string)($input['result_visibility'] ?? ($project['result_visibility'] ?? 'live_rank_only')), VOTE_RESULT_VISIBILITIES, 'live_rank_only'),
            voteJson($input['config'] ?? voteDecode($project['config_json'] ?? '{}')),
            (int)$project['id'],
        ]);
        logAction('vote_project.update', 'vote_projects', (int)$project['id'], null);
        voteRespond(['success' => true]);

    case 'publish':
    case 'suspend':
    case 'archive':
    case 'delete':
        [$user, $project] = voteRequireProjectManager((int)($_GET['id'] ?? 0));
        if ($action === 'delete') {
            $projectId = (int)$project['id'];
            $db->beginTransaction();
            $db->prepare('DELETE FROM vote_results WHERE project_id = ?')->execute([$projectId]);
            $db->prepare('DELETE FROM vote_votes WHERE project_id = ?')->execute([$projectId]);
            $db->prepare('DELETE FROM vote_matches WHERE project_id = ?')->execute([$projectId]);
            $db->prepare('DELETE FROM vote_stage_entries WHERE project_id = ?')->execute([$projectId]);
            $db->prepare('DELETE FROM vote_nominations WHERE project_id = ?')->execute([$projectId]);
            $db->prepare('DELETE FROM vote_entries WHERE project_id = ?')->execute([$projectId]);
            $db->prepare('DELETE FROM vote_stages WHERE project_id = ?')->execute([$projectId]);
            $db->prepare('DELETE FROM vote_projects WHERE id = ?')->execute([$projectId]);
            $db->commit();
            logAction('vote_project.delete', 'vote_projects', $projectId, ['title' => $project['title'] ?? '']);
            voteRespond(['success' => true, 'deleted_id' => $projectId]);
        }
        $target = $action === 'publish' ? 'running' : ($action === 'suspend' ? 'suspended' : 'archived');
        $now = voteNowExpr();
        $publishedSql = $action === 'publish' ? ", published_at = COALESCE(published_at, $now)" : '';
        $db->prepare("UPDATE vote_projects SET status = ?, updated_at = $now $publishedSql WHERE id = ?")->execute([$target, (int)$project['id']]);
        logAction('vote_project.' . $action, 'vote_projects', (int)$project['id'], null);
        voteRespond(['success' => true, 'status' => $target]);

    default:
        voteRespond(['success' => false, 'message' => '未知 action=' . $action], 400);
}
