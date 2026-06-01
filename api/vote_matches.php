<?php
// api/vote_matches.php - shared 1v1 bracket API.

require_once __DIR__ . '/../includes/vote_projects.php';
require_once __DIR__ . '/../includes/audit.php';
require_once __DIR__ . '/../includes/image_proxy_helper.php';

voteBootstrap();
voteEnsureSchema();
$action = trim((string)($_GET['action'] ?? ''));
$db = getDB();

function voteMatchRows(PDO $db, int $stageId): array {
    $flowPool = voteFlowPoolForStage($db, $stageId);
    if ($flowPool) {
        $flowRows = voteFlowMatchRows($db, $stageId);
        foreach ($flowRows as &$row) {
            $row['slot_a_image'] = proxyImageUrl($row['slot_a_image'] ?? '');
            $row['slot_b_image'] = proxyImageUrl($row['slot_b_image'] ?? '');
        }
        return $flowRows;
    }
    $stmt = $db->prepare(
        "SELECT m.*,
                a.title AS slot_a_title, a.title_cn AS slot_a_title_cn, a.image_url AS slot_a_image,
                b.title AS slot_b_title, b.title_cn AS slot_b_title_cn, b.image_url AS slot_b_image,
                w.title AS winner_title, w.title_cn AS winner_title_cn
         FROM vote_matches m
         LEFT JOIN vote_entries a ON a.id = m.slot_a_entry_id
         LEFT JOIN vote_entries b ON b.id = m.slot_b_entry_id
         LEFT JOIN vote_entries w ON w.id = m.winner_entry_id
         WHERE m.stage_id = ?
         ORDER BY m.round_no ASC, m.match_no ASC"
    );
    $stmt->execute([$stageId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$row) {
        $row['slot_a_image'] = proxyImageUrl($row['slot_a_image'] ?? '');
        $row['slot_b_image'] = proxyImageUrl($row['slot_b_image'] ?? '');
    }
    return $rows;
}

function voteBracketEntryIds(PDO $db, array $stage, array $input): array {
    $entryIds = array_values(array_filter(array_map('intval', $input['entry_ids'] ?? [])));
    if ($entryIds) {
        return array_values(array_unique($entryIds));
    }
    voteEnsureStageEntries($db, $stage);
    $limit = max(2, (int)($input['size'] ?? voteStageConfig($stage)['bracket_size'] ?? $stage['advance_count'] ?? 32));
    $stmt = $db->prepare(
        "SELECT se.entry_id
         FROM vote_stage_entries se
         JOIN vote_entries e ON e.id = se.entry_id
         WHERE se.project_id = ? AND se.stage_id = ? AND se.status = 'active' AND e.entry_status = 'approved'
         ORDER BY se.seed_no ASC, se.entry_id ASC
         LIMIT $limit"
    );
    $stmt->execute([(int)$stage['project_id'], (int)$stage['id']]);
    return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

function voteMatchVoteCounts(PDO $db, array $match): array {
    $stmt = $db->prepare(
        "SELECT entry_id, COALESCE(SUM(vote_value), 0) AS votes
         FROM vote_votes
         WHERE stage_id = ? AND match_id = ?
         GROUP BY entry_id"
    );
    $stmt->execute([(int)$match['stage_id'], (int)$match['id']]);
    $counts = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $counts[(int)$row['entry_id']] = (int)$row['votes'];
    }
    return $counts;
}

function voteMatchWinnerFromVotes(array $match, array $counts): array {
    $slotA = (int)($match['slot_a_entry_id'] ?? 0);
    $slotB = (int)($match['slot_b_entry_id'] ?? 0);
    $votesA = $slotA ? (int)($counts[$slotA] ?? 0) : 0;
    $votesB = $slotB ? (int)($counts[$slotB] ?? 0) : 0;
    if (!$slotA || !$slotB) return ['winner' => 0, 'reason' => 'missing_slot', 'slot_a_votes' => $votesA, 'slot_b_votes' => $votesB];
    if ($votesA === $votesB) return ['winner' => 0, 'reason' => 'tie', 'slot_a_votes' => $votesA, 'slot_b_votes' => $votesB];
    return ['winner' => $votesA > $votesB ? $slotA : $slotB, 'reason' => '', 'slot_a_votes' => $votesA, 'slot_b_votes' => $votesB];
}

switch ($action) {
    case 'list':
    case 'contest_bracket':
        $stageId = (int)($_GET['stage_id'] ?? 0);
        if ($stageId <= 0 && isset($_GET['project_id'])) {
            $stmt = $db->prepare("SELECT id FROM vote_stages WHERE project_id = ? AND stage_type IN ('bracket', 'final') ORDER BY sort_order ASC LIMIT 1");
            $stmt->execute([(int)$_GET['project_id']]);
            $stageId = (int)$stmt->fetchColumn();
        }
        voteRespond(['success' => true, 'data' => $stageId > 0 ? voteMatchRows($db, $stageId) : []]);

    case 'generate':
        $input = voteReadJson();
        $stage = voteFetchStage((int)($input['stage_id'] ?? 0));
        if (!$stage) voteRespond(['success' => false, 'message' => '阶段不存在'], 404);
        [$user, $project] = voteRequireProjectManager((int)$stage['project_id']);
        if (($project['project_type'] ?? '') !== 'moe' || !in_array(($stage['stage_type'] ?? ''), ['bracket', 'final'], true)) {
            voteRespond(['success' => false, 'message' => '只有萌战 1v1 阶段可以生成对阵'], 400);
        }
        $flowPool = voteFlowPoolForStage($db, (int)$stage['id']);
        if ($flowPool) {
            try {
                $rows = voteFlowGenerateMatches($db, $flowPool);
                foreach ($rows as &$row) {
                    $row['slot_a_image'] = proxyImageUrl($row['slot_a_image'] ?? '');
                    $row['slot_b_image'] = proxyImageUrl($row['slot_b_image'] ?? '');
                }
                voteRespond(['success' => true, 'data' => $rows, 'pool_id' => (int)$flowPool['id']]);
            } catch (Throwable $e) {
                voteRespond(['success' => false, 'message' => $e->getMessage()], 400);
            }
        }
        $entryIds = voteBracketEntryIds($db, $stage, $input);
        if (!voteIsPowerOfTwo(count($entryIds))) {
            voteRespond(['success' => false, 'message' => '萌战 1v1 晋级人数必须是 2 的幂'], 400);
        }
        $explicitEntries = !empty($input['entry_ids']);
        if ($explicitEntries) {
            $placeholders = implode(',', array_fill(0, count($entryIds), '?'));
            $stmt = $db->prepare("SELECT COUNT(*) FROM vote_entries WHERE project_id = ? AND entry_status = 'approved' AND id IN ($placeholders)");
            $stmt->execute(array_merge([(int)$project['id']], $entryIds));
            if ((int)$stmt->fetchColumn() !== count($entryIds)) {
                voteRespond(['success' => false, 'message' => '对阵条目必须属于本企划且已审核通过'], 400);
            }
        }

        $db->beginTransaction();
        if ($explicitEntries) {
            voteSeedStageEntries($db, $stage, $entryIds, (int)($input['source_stage_id'] ?? 0) ?: null);
        }
        $db->prepare('DELETE FROM vote_matches WHERE stage_id = ?')->execute([(int)$stage['id']]);
        $ins = $db->prepare(
            "INSERT INTO vote_matches (project_id, stage_id, round_no, match_no, slot_a_entry_id, slot_b_entry_id, status)
             VALUES (?, ?, ?, ?, ?, ?, 'pending')"
        );
        $matchIdsByRound = [];
        $round = 1;
        $roundSize = count($entryIds);
        while ($roundSize >= 2) {
            $matchIdsByRound[$round] = [];
            for ($i = 0, $matchNo = 1; $i < $roundSize; $i += 2, $matchNo++) {
                $a = $round === 1 ? ($entryIds[$i] ?? null) : null;
                $b = $round === 1 ? ($entryIds[$i + 1] ?? null) : null;
                $ins->execute([(int)$project['id'], (int)$stage['id'], $round, $matchNo, $a, $b]);
                $matchIdsByRound[$round][$matchNo] = (int)$db->lastInsertId();
            }
            $round++;
            $roundSize = (int)($roundSize / 2);
        }
        foreach ($matchIdsByRound as $roundNo => $matches) {
            if (!isset($matchIdsByRound[$roundNo + 1])) continue;
            foreach ($matches as $matchNo => $matchId) {
                $nextMatchNo = (int)ceil($matchNo / 2);
                $nextSlot = $matchNo % 2 === 1 ? 'A' : 'B';
                $nextMatchId = $matchIdsByRound[$roundNo + 1][$nextMatchNo] ?? null;
                if ($nextMatchId) {
                    $db->prepare("UPDATE vote_matches SET next_match_id = ?, next_slot = ? WHERE id = ?")->execute([$nextMatchId, $nextSlot, $matchId]);
                }
            }
        }
        $db->commit();
        logAction('vote_match.generate', 'vote_stages', (int)$stage['id'], ['count' => count($entryIds)]);
        voteRespond(['success' => true, 'data' => voteMatchRows($db, (int)$stage['id'])]);

    case 'update':
    case 'open':
    case 'lock':
    case 'settle':
        $input = voteReadJson();
        $matchId = (int)($_GET['id'] ?? $input['id'] ?? 0);
        $stmt = $db->prepare('SELECT * FROM vote_flow_matches WHERE id = ?');
        $stmt->execute([$matchId]);
        $flowMatch = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($flowMatch) {
            [$user, $project] = voteRequireProjectManager((int)$flowMatch['project_id']);
            $winner = (int)($input['winner_entry_id'] ?? $flowMatch['winner_entry_id'] ?? 0);
            if ($action === 'settle') {
                try {
                    $rows = voteFlowSettleMatch($db, $flowMatch, $winner);
                    foreach ($rows as &$row) {
                        $row['slot_a_image'] = proxyImageUrl($row['slot_a_image'] ?? '');
                        $row['slot_b_image'] = proxyImageUrl($row['slot_b_image'] ?? '');
                    }
                    voteRespond(['success' => true, 'status' => 'settled', 'data' => $rows]);
                } catch (Throwable $e) {
                    voteRespond(['success' => false, 'message' => $e->getMessage()], 400);
                }
            }
            $status = $action === 'open' ? 'open' : ($action === 'lock' ? 'pending' : voteNormalize((string)($input['status'] ?? $flowMatch['status']), ['pending', 'open', 'settled'], 'pending'));
            $now = voteNowExpr();
            $db->prepare("UPDATE vote_flow_matches SET status = ?, updated_at = $now WHERE id = ?")->execute([$status, $matchId]);
            voteRespond(['success' => true, 'status' => $status, 'data' => voteMatchRows($db, (int)$flowMatch['stage_id'])]);
        }
        $stmt = $db->prepare('SELECT * FROM vote_matches WHERE id = ?');
        $stmt->execute([$matchId]);
        $match = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$match) voteRespond(['success' => false, 'message' => '对阵不存在'], 404);
        [$user, $project] = voteRequireProjectManager((int)$match['project_id']);
        $winner = (int)($input['winner_entry_id'] ?? $match['winner_entry_id'] ?? 0);
        $slotA = (int)($input['slot_a_entry_id'] ?? $match['slot_a_entry_id'] ?? 0) ?: null;
        $slotB = (int)($input['slot_b_entry_id'] ?? $match['slot_b_entry_id'] ?? 0) ?: null;
        $status = $action === 'settle' ? 'settled' : ($action === 'open' ? 'open' : ($action === 'lock' ? 'pending' : voteNormalize((string)($input['status'] ?? $match['status']), ['pending', 'open', 'settled'], 'pending')));
        if ($action === 'settle' && (!$winner || !in_array($winner, array_filter([$slotA, $slotB]), true))) {
            voteRespond(['success' => false, 'message' => '胜者必须来自当前对阵 A/B 槽位'], 400);
        }

        $now = voteNowExpr();
        $db->beginTransaction();
        $db->prepare("UPDATE vote_matches SET slot_a_entry_id = ?, slot_b_entry_id = ?, winner_entry_id = ?, status = ?, updated_at = $now WHERE id = ?")
            ->execute([$slotA, $slotB, $winner ?: null, $status, $matchId]);
        if ($action === 'settle' && !empty($match['next_match_id'])) {
            $field = ($match['next_slot'] ?? '') === 'B' ? 'slot_b_entry_id' : 'slot_a_entry_id';
            $db->prepare("UPDATE vote_matches SET $field = ?, updated_at = $now WHERE id = ?")->execute([$winner, (int)$match['next_match_id']]);
        } elseif ($action === 'settle') {
            $stage = voteFetchStage((int)$match['stage_id']);
            if ($stage) {
                $db->prepare('DELETE FROM vote_results WHERE stage_id = ? AND entry_id = ?')->execute([(int)$stage['id'], $winner]);
                $db->prepare(
                    "INSERT INTO vote_results (project_id, stage_id, entry_id, rank_no, votes, score_avg, advanced, snapshot_json)
                     VALUES (?, ?, ?, 1, 0, NULL, 1, ?)"
                )->execute([(int)$match['project_id'], (int)$match['stage_id'], $winner, voteJson(['winner_entry_id' => $winner, 'match_id' => $matchId])]);
                $db->prepare("UPDATE vote_stages SET status = 'settled', updated_at = $now WHERE id = ?")->execute([(int)$match['stage_id']]);
                $db->prepare("UPDATE vote_projects SET status = 'ended', ended_at = COALESCE(ended_at, $now), updated_at = $now WHERE id = ?")->execute([(int)$match['project_id']]);
            }
        }
        $db->commit();
        voteRespond(['success' => true, 'status' => $status, 'data' => voteMatchRows($db, (int)$match['stage_id'])]);

    case 'settle_by_votes':
        $input = voteReadJson();
        $stage = voteFetchStage((int)($input['stage_id'] ?? $_GET['stage_id'] ?? 0));
        if (!$stage) voteRespond(['success' => false, 'message' => 'stage not found'], 404);
        [$user, $project] = voteRequireProjectManager((int)$stage['project_id']);
        $settled = [];
        $unresolved = [];
        $flowPool = voteFlowPoolForStage($db, (int)$stage['id']);
        if ($flowPool) {
            $stmt = $db->prepare("SELECT * FROM vote_flow_matches WHERE pool_id = ? AND status = 'open' ORDER BY round_no ASC, match_no ASC");
            $stmt->execute([(int)$flowPool['id']]);
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $match) {
                $decision = voteMatchWinnerFromVotes($match, voteMatchVoteCounts($db, $match));
                if (empty($decision['winner'])) {
                    $unresolved[] = array_merge(['match_id' => (int)$match['id']], $decision);
                    continue;
                }
                voteFlowSettleMatch($db, $match, (int)$decision['winner']);
                $settled[] = array_merge(['match_id' => (int)$match['id'], 'winner_entry_id' => (int)$decision['winner']], $decision);
            }
            voteRespond([
                'success' => true,
                'settled_count' => count($settled),
                'unresolved_count' => count($unresolved),
                'settled' => $settled,
                'unresolved' => $unresolved,
                'data' => voteMatchRows($db, (int)$stage['id']),
            ]);
        }
        $stmt = $db->prepare("SELECT * FROM vote_matches WHERE stage_id = ? AND status = 'open' ORDER BY round_no ASC, match_no ASC");
        $stmt->execute([(int)$stage['id']]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $match) {
            $decision = voteMatchWinnerFromVotes($match, voteMatchVoteCounts($db, $match));
            if (empty($decision['winner'])) {
                $unresolved[] = array_merge(['match_id' => (int)$match['id']], $decision);
                continue;
            }
            $now = voteNowExpr();
            $db->prepare("UPDATE vote_matches SET winner_entry_id = ?, status = 'settled', updated_at = $now WHERE id = ?")
                ->execute([(int)$decision['winner'], (int)$match['id']]);
            if (!empty($match['next_match_id'])) {
                $field = ($match['next_slot'] ?? '') === 'B' ? 'slot_b_entry_id' : 'slot_a_entry_id';
                $db->prepare("UPDATE vote_matches SET $field = ?, updated_at = $now WHERE id = ?")->execute([(int)$decision['winner'], (int)$match['next_match_id']]);
            }
            $settled[] = array_merge(['match_id' => (int)$match['id'], 'winner_entry_id' => (int)$decision['winner']], $decision);
        }
        voteRespond([
            'success' => true,
            'settled_count' => count($settled),
            'unresolved_count' => count($unresolved),
            'settled' => $settled,
            'unresolved' => $unresolved,
            'data' => voteMatchRows($db, (int)$stage['id']),
        ]);

    default:
        voteRespond(['success' => false, 'message' => '未知 action=' . $action], 400);
}
