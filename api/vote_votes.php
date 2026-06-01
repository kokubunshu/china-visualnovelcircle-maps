<?php
// api/vote_votes.php - shared voting and results API.

require_once __DIR__ . '/../includes/vote_projects.php';
require_once __DIR__ . '/../includes/audit.php';
require_once __DIR__ . '/../includes/image_proxy_helper.php';

voteBootstrap();
voteEnsureSchema();
$action = trim((string)($_GET['action'] ?? ''));
$db = getDB();

function voteResultsMatchRows(PDO $db, int $stageId, ?int $poolId = null): array {
    $table = $poolId ? 'vote_flow_matches' : 'vote_matches';
    $where = $poolId ? 'm.pool_id = ?' : 'm.stage_id = ?';
    $params = [$poolId ?: $stageId];
    $stmt = $db->prepare(
        "SELECT m.*,
                a.title AS slot_a_title, a.title_cn AS slot_a_title_cn, a.image_url AS slot_a_image,
                b.title AS slot_b_title, b.title_cn AS slot_b_title_cn, b.image_url AS slot_b_image,
                w.title AS winner_title, w.title_cn AS winner_title_cn,
                COALESCE(SUM(CASE WHEN v.entry_id = m.slot_a_entry_id THEN v.vote_value ELSE 0 END), 0) AS slot_a_votes,
                COALESCE(SUM(CASE WHEN v.entry_id = m.slot_b_entry_id THEN v.vote_value ELSE 0 END), 0) AS slot_b_votes,
                COALESCE(SUM(v.vote_value), 0) AS total_votes
         FROM $table m
         LEFT JOIN vote_entries a ON a.id = m.slot_a_entry_id
         LEFT JOIN vote_entries b ON b.id = m.slot_b_entry_id
         LEFT JOIN vote_entries w ON w.id = m.winner_entry_id
         LEFT JOIN vote_votes v ON v.match_id = m.id AND v.stage_id = m.stage_id
         WHERE $where
         GROUP BY m.id
         ORDER BY m.round_no ASC, m.match_no ASC"
    );
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$row) {
        $row['slot_a_image'] = proxyImageUrl($row['slot_a_image'] ?? '');
        $row['slot_b_image'] = proxyImageUrl($row['slot_b_image'] ?? '');
        $row['slot_a_votes'] = (int)($row['slot_a_votes'] ?? 0);
        $row['slot_b_votes'] = (int)($row['slot_b_votes'] ?? 0);
        $row['total_votes'] = (int)($row['total_votes'] ?? 0);
    }
    return $rows;
}

switch ($action) {
    case 'eligibility':
        $user = getCurrentUser();
        $project = voteGetProject((int)($_GET['project_id'] ?? $_GET['contest_id'] ?? 0));
        if (!$project) voteRespond(['success' => true, 'eligible' => false, 'reason' => 'project_not_found']);
        voteRespond(['success' => true, 'eligible' => voteCanParticipateProject($user, $project), 'reason' => $user ? '' : 'login_required']);

    case 'cast':
        $user = requireLogin();
        $input = voteReadJson();
        $stage = voteFetchStage((int)($input['stage_id'] ?? 0));
        if (!$stage) voteRespond(['success' => false, 'message' => '阶段不存在'], 404);
        $project = voteGetProject((int)$stage['project_id']);
        if (!$project) voteRespond(['success' => false, 'message' => '企划不存在'], 404);
        if (!voteCanParticipateProject($user, $project)) voteRespond(['success' => false, 'message' => '当前账号不符合投票资格'], 403);

        $flowPool = voteFlowPoolForStage($db, (int)$stage['id']);
        if ($flowPool) {
            if (($flowPool['status'] ?? '') !== 'open') voteRespond(['success' => false, 'message' => '当前阶段池未开放投票'], 400);
            $entryIds = $input['entry_ids'] ?? (isset($input['entry_id']) ? [$input['entry_id']] : []);
            if (!is_array($entryIds)) $entryIds = [];
            $entryIds = array_values(array_unique(array_map('intval', $entryIds)));
            $maxSelect = max(1, (int)($flowPool['max_select'] ?? $stage['max_select'] ?? 1));
            if (($flowPool['vote_mode'] ?? '') === 'match_single') $maxSelect = 1;
            if (!$entryIds || count($entryIds) > $maxSelect) voteRespond(['success' => false, 'message' => '投票数量不符合当前阶段设置'], 400);

            $placeholders = implode(',', array_fill(0, count($entryIds), '?'));
            $stmt = $db->prepare(
                "SELECT fpe.entry_id
                 FROM vote_flow_pool_entries fpe
                 JOIN vote_entries e ON e.id = fpe.entry_id
                 WHERE fpe.pool_id = ? AND fpe.status = 'active'
                   AND e.entry_status = 'approved' AND fpe.entry_id IN ($placeholders)"
            );
            $stmt->execute(array_merge([(int)$flowPool['id']], $entryIds));
            if (count($stmt->fetchAll(PDO::FETCH_COLUMN)) !== count($entryIds)) {
                voteRespond(['success' => false, 'message' => '投票条目不属于当前阶段池'], 400);
            }

            $matchId = (int)($input['match_id'] ?? 0);
            if (($flowPool['vote_mode'] ?? '') === 'match_single') {
                if ($matchId <= 0) voteRespond(['success' => false, 'message' => '1v1 投票必须指定对阵'], 400);
                $stmt = $db->prepare('SELECT * FROM vote_flow_matches WHERE id = ? AND project_id = ? AND pool_id = ?');
                $stmt->execute([$matchId, (int)$project['id'], (int)$flowPool['id']]);
                $match = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$match || ($match['status'] ?? '') !== 'open') voteRespond(['success' => false, 'message' => '对阵不存在或不可投票'], 400);
                $slots = array_filter([(int)($match['slot_a_entry_id'] ?? 0), (int)($match['slot_b_entry_id'] ?? 0)]);
                if (count($entryIds) !== 1 || !in_array($entryIds[0], $slots, true)) voteRespond(['success' => false, 'message' => '投票条目不属于当前对阵'], 400);
            }

            $scoreMap = is_array($input['scores'] ?? null) ? $input['scores'] : [];
            $db->beginTransaction();
            if (!empty($stage['allow_vote_change'])) {
                $deleteSql = 'DELETE FROM vote_votes WHERE stage_id = ? AND user_id = ?';
                $deleteParams = [(int)$stage['id'], (int)$user['id']];
                if ($matchId > 0) {
                    $deleteSql .= ' AND match_id = ?';
                    $deleteParams[] = $matchId;
                }
                $db->prepare($deleteSql)->execute($deleteParams);
            } else {
                $existsSql = 'SELECT COUNT(*) FROM vote_votes WHERE stage_id = ? AND user_id = ?';
                $existsParams = [(int)$stage['id'], (int)$user['id']];
                if ($matchId > 0) {
                    $existsSql .= ' AND match_id = ?';
                    $existsParams[] = $matchId;
                }
                $stmt = $db->prepare($existsSql);
                $stmt->execute($existsParams);
                if ((int)$stmt->fetchColumn() > 0) {
                    $db->rollBack();
                    voteRespond(['success' => false, 'message' => '本阶段已投票'], 400);
                }
            }
            $ins = $db->prepare('INSERT INTO vote_votes (project_id, stage_id, entry_id, match_id, user_id, vote_value, score_value) VALUES (?, ?, ?, ?, ?, ?, ?)');
            foreach ($entryIds as $entryId) {
                $score = null;
                if (($flowPool['vote_mode'] ?? '') === 'score') {
                    $score = (int)($scoreMap[$entryId] ?? $input['score_value'] ?? 0);
                    if ($score < (int)$stage['score_min'] || $score > (int)$stage['score_max']) {
                        $db->rollBack();
                        voteRespond(['success' => false, 'message' => '评分超出范围'], 400);
                    }
                }
                $ins->execute([(int)$project['id'], (int)$stage['id'], $entryId, $matchId ?: null, (int)$user['id'], 1, $score]);
            }
            $db->commit();
            logAction('vote.cast.flow', 'vote_stages', (int)$stage['id'], ['project_id' => (int)$project['id'], 'pool_id' => (int)$flowPool['id'], 'count' => count($entryIds), 'match_id' => $matchId ?: null]);
            voteRespond(['success' => true, 'count' => count($entryIds), 'pool_id' => (int)$flowPool['id']]);
        }

        if (($stage['status'] ?? '') !== 'open') voteRespond(['success' => false, 'message' => '当前阶段未开放投票'], 400);

        $entryIds = $input['entry_ids'] ?? (isset($input['entry_id']) ? [$input['entry_id']] : []);
        if (!is_array($entryIds)) $entryIds = [];
        $entryIds = array_values(array_unique(array_map('intval', $entryIds)));
        $maxSelect = max(1, (int)($stage['max_select'] ?? 1));
        if (($stage['vote_mode'] ?? '') === 'match_single') $maxSelect = 1;
        if (!$entryIds || count($entryIds) > $maxSelect) {
            voteRespond(['success' => false, 'message' => '投票数量不符合当前阶段设置'], 400);
        }

        voteEnsureStageEntries($db, $stage);
        $placeholders = implode(',', array_fill(0, count($entryIds), '?'));
        $stmt = $db->prepare(
            "SELECT se.entry_id
             FROM vote_stage_entries se
             JOIN vote_entries e ON e.id = se.entry_id
             WHERE se.project_id = ? AND se.stage_id = ? AND se.status = 'active'
               AND e.entry_status = 'approved' AND se.entry_id IN ($placeholders)"
        );
        $stmt->execute(array_merge([(int)$project['id'], (int)$stage['id']], $entryIds));
        $allowedEntryIds = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
        if (count($allowedEntryIds) !== count($entryIds)) {
            voteRespond(['success' => false, 'message' => '投票条目不属于当前阶段候选池'], 400);
        }

        $matchId = (int)($input['match_id'] ?? 0);
        if (($stage['vote_mode'] ?? '') === 'match_single') {
            if ($matchId <= 0) voteRespond(['success' => false, 'message' => '1v1 投票必须指定对阵'], 400);
            $stmt = $db->prepare('SELECT * FROM vote_matches WHERE id = ? AND project_id = ? AND stage_id = ?');
            $stmt->execute([$matchId, (int)$project['id'], (int)$stage['id']]);
            $match = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$match || ($match['status'] ?? '') !== 'open') {
                voteRespond(['success' => false, 'message' => '对阵不存在或不可投票'], 400);
            }
            $slots = array_filter([(int)($match['slot_a_entry_id'] ?? 0), (int)($match['slot_b_entry_id'] ?? 0)]);
            if (count($entryIds) !== 1 || !in_array($entryIds[0], $slots, true)) {
                voteRespond(['success' => false, 'message' => '投票条目不属于当前对阵'], 400);
            }
        }

        $scoreMap = is_array($input['scores'] ?? null) ? $input['scores'] : [];
        $db->beginTransaction();
        if (!empty($stage['allow_vote_change'])) {
            $deleteSql = 'DELETE FROM vote_votes WHERE stage_id = ? AND user_id = ?';
            $deleteParams = [(int)$stage['id'], (int)$user['id']];
            if ($matchId > 0) {
                $deleteSql .= ' AND match_id = ?';
                $deleteParams[] = $matchId;
            }
            $db->prepare($deleteSql)->execute($deleteParams);
        } else {
            $existsSql = 'SELECT COUNT(*) FROM vote_votes WHERE stage_id = ? AND user_id = ?';
            $existsParams = [(int)$stage['id'], (int)$user['id']];
            if ($matchId > 0) {
                $existsSql .= ' AND match_id = ?';
                $existsParams[] = $matchId;
            }
            $stmt = $db->prepare($existsSql);
            $stmt->execute($existsParams);
            if ((int)$stmt->fetchColumn() > 0) {
                $db->rollBack();
                voteRespond(['success' => false, 'message' => '本阶段已投票'], 400);
            }
        }

        $ins = $db->prepare('INSERT INTO vote_votes (project_id, stage_id, entry_id, match_id, user_id, vote_value, score_value) VALUES (?, ?, ?, ?, ?, ?, ?)');
        foreach ($entryIds as $entryId) {
            $score = null;
            if (($stage['vote_mode'] ?? '') === 'score') {
                $score = (int)($scoreMap[$entryId] ?? $input['score_value'] ?? 0);
                if ($score < (int)$stage['score_min'] || $score > (int)$stage['score_max']) {
                    $db->rollBack();
                    voteRespond(['success' => false, 'message' => '评分超出范围'], 400);
                }
            }
            $ins->execute([(int)$project['id'], (int)$stage['id'], $entryId, $matchId ?: null, (int)$user['id'], 1, $score]);
        }
        $db->commit();
        logAction('vote.cast', 'vote_stages', (int)$stage['id'], ['project_id' => (int)$project['id'], 'count' => count($entryIds), 'match_id' => $matchId ?: null]);
        voteRespond(['success' => true, 'count' => count($entryIds)]);

    case 'my_votes':
        $user = requireLogin();
        $projectId = (int)($_GET['project_id'] ?? $_GET['contest_id'] ?? 0);
        $stmt = $db->prepare(
            "SELECT v.*, e.title, e.title_cn, s.title AS stage_title
             FROM vote_votes v
             JOIN vote_entries e ON e.id = v.entry_id
             JOIN vote_stages s ON s.id = v.stage_id
             WHERE v.user_id = ? AND (? = 0 OR v.project_id = ?)
             ORDER BY v.created_at DESC"
        );
        $stmt->execute([(int)$user['id'], $projectId, $projectId]);
        voteRespond(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);

    case 'results':
    case 'stage_results':
    case 'round_results':
    case 'final_results':
    case 'match_results':
        $stageId = (int)($_GET['stage_id'] ?? $_GET['round_id'] ?? 0);
        if ($stageId <= 0 && isset($_GET['project_id'])) {
            $stmt = $db->prepare('SELECT id FROM vote_stages WHERE project_id = ? ORDER BY sort_order DESC LIMIT 1');
            $stmt->execute([(int)$_GET['project_id']]);
            $stageId = (int)$stmt->fetchColumn();
        }
        $stage = voteFetchStage($stageId);
        if (!$stage) voteRespond(['success' => false, 'message' => '阶段不存在'], 404);
        $flowPool = voteFlowPoolForStage($db, $stageId);
        if ($flowPool) {
            $stmt = $db->prepare(
                "SELECT r.*, e.title, e.title_cn, e.subtitle, e.image_url, e.source_type, e.source_id, e.summary
                 FROM vote_flow_results r JOIN vote_entries e ON e.id = r.entry_id
                 WHERE r.pool_id = ?
                 ORDER BY r.rank_no ASC, r.votes DESC"
            );
            $stmt->execute([(int)$flowPool['id']]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            if (!$rows) {
                $aggregate = ($flowPool['vote_mode'] ?? '') === 'score'
                    ? 'COALESCE(SUM(v.vote_value), 0) AS votes, AVG(v.score_value) AS score_avg'
                    : 'COALESCE(SUM(v.vote_value), 0) AS votes, NULL AS score_avg';
                $order = ($flowPool['vote_mode'] ?? '') === 'score'
                    ? 'score_avg DESC, votes DESC, fpe.seed_no ASC'
                    : 'votes DESC, score_avg DESC, fpe.seed_no ASC';
                $stmt = $db->prepare(
                    "SELECT e.id AS entry_id, e.title, e.title_cn, e.subtitle, e.image_url, e.source_type, e.source_id, e.summary, fpe.group_key, fpe.seed_no, $aggregate
                     FROM vote_flow_pool_entries fpe
                     JOIN vote_entries e ON e.id = fpe.entry_id
                     LEFT JOIN vote_votes v ON v.entry_id = e.id AND v.stage_id = ?
                     WHERE fpe.pool_id = ? AND fpe.status = 'active' AND e.entry_status = 'approved'
                     GROUP BY e.id, fpe.group_key, fpe.seed_no
                     ORDER BY $order"
                );
                $stmt->execute([$stageId, (int)$flowPool['id']]);
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            }
            foreach ($rows as &$row) {
                $snapshot = voteDecode($row['snapshot_json'] ?? '{}');
                if (!isset($row['group_key']) && isset($snapshot['group_key'])) $row['group_key'] = $snapshot['group_key'];
                if (isset($snapshot['group_rank'])) $row['group_rank'] = (int)$snapshot['group_rank'];
                if (isset($snapshot['role'])) $row['role'] = $snapshot['role'];
                $row['image_url'] = proxyImageUrl($row['image_url'] ?? '');
            }
            voteRespond([
                'success' => true,
                'data' => $rows,
                'match_results' => voteResultsMatchRows($db, $stageId, (int)$flowPool['id']),
                'stage_status' => $flowPool['status'] ?? '',
                'pool_id' => (int)$flowPool['id'],
                'result_visibility' => $stage['result_visibility'] ?? 'live_rank_only',
            ]);
        }
        $stmt = $db->prepare(
            "SELECT r.*, e.title, e.title_cn, e.subtitle, e.image_url, e.source_type, e.source_id, e.summary
             FROM vote_results r JOIN vote_entries e ON e.id = r.entry_id
             WHERE r.stage_id = ?
             ORDER BY r.rank_no ASC, r.votes DESC"
        );
        $stmt->execute([$stageId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if (!$rows) {
            voteEnsureStageEntries($db, $stage);
            $order = ($stage['vote_mode'] ?? '') === 'score'
                ? 'score_avg DESC, votes DESC, e.id ASC'
                : 'votes DESC, score_avg DESC, e.id ASC';
            $stmt = $db->prepare(
                "SELECT e.id AS entry_id, e.title, e.title_cn, e.subtitle, e.image_url, e.source_type, e.source_id, e.summary, COALESCE(SUM(v.vote_value), 0) AS votes, AVG(v.score_value) AS score_avg
                 FROM vote_stage_entries se
                 JOIN vote_entries e ON e.id = se.entry_id
                 LEFT JOIN vote_votes v ON v.entry_id = e.id AND v.stage_id = se.stage_id
                 WHERE se.stage_id = ? AND se.project_id = ? AND se.status = 'active' AND e.entry_status = 'approved'
                 GROUP BY e.id
                 ORDER BY $order"
            );
            $stmt->execute([$stageId, (int)$stage['project_id']]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }
        foreach ($rows as &$row) {
            $snapshot = voteDecode($row['snapshot_json'] ?? '{}');
            if (!isset($row['group_key']) && isset($snapshot['group_key'])) $row['group_key'] = $snapshot['group_key'];
            if (isset($snapshot['group_rank'])) $row['group_rank'] = (int)$snapshot['group_rank'];
            if (isset($snapshot['role'])) $row['role'] = $snapshot['role'];
            $row['image_url'] = proxyImageUrl($row['image_url'] ?? '');
        }
        voteRespond([
            'success' => true,
            'data' => $rows,
            'match_results' => voteResultsMatchRows($db, $stageId, null),
            'stage_status' => $stage['status'] ?? '',
            'result_visibility' => $stage['result_visibility'] ?? 'live_rank_only',
        ]);

    default:
        voteRespond(['success' => false, 'message' => '未知 action=' . $action], 400);
}
