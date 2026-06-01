<?php
// api/growth.php - public share summaries, aggregate growth analytics, owner dashboard.

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/growth.php';

function growthRespond(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit();
}

function growthRequestBody(): array {
    $raw = file_get_contents('php://input');
    $data = $raw ? json_decode($raw, true) : [];
    return is_array($data) ? $data : [];
}

function growthBoolParam(string $key): bool {
    $value = strtolower(trim((string)($_GET[$key] ?? '')));
    return in_array($value, ['1', 'true', 'yes'], true);
}

function growthManagedMemberships(array $user): array {
    $db = getDB();
    if (($user['role'] ?? '') === 'super_admin') {
        return array_map(function ($club) {
            return [
                'club_id' => (int)($club['id'] ?? 0),
                'country' => $club['country'] ?? 'china',
                'role' => 'super_admin',
            ];
        }, array_slice(growthLoadClubs('all'), 0, 30));
    }
    try {
        $stmt = $db->prepare(
            "SELECT club_id, country, role
             FROM club_memberships
             WHERE user_id = ?
               AND status = 'active'
               AND role IN ('representative', 'manager')
             ORDER BY joined_at DESC"
        );
        $stmt->execute([(int)$user['id']]);
    } catch (Throwable $e) {
        $stmt = $db->prepare(
            "SELECT club_id, role
             FROM club_memberships
             WHERE user_id = ?
               AND status = 'active'
               AND role IN ('representative', 'manager')
             ORDER BY joined_at DESC"
        );
        $stmt->execute([(int)$user['id']]);
    }
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$row) {
        $row['club_id'] = (int)($row['club_id'] ?? 0);
        $row['country'] = $row['country'] ?? 'china';
    }
    return $rows;
}

function growthPendingCounts(array $clubKeys): array {
    if (!$clubKeys) return [];
    $db = getDB();
    $counts = [];
    try {
        $stmt = $db->query(
            "SELECT club_id, country, COUNT(*) AS cnt
             FROM club_memberships
             WHERE status = 'pending'
             GROUP BY club_id, country"
        );
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $key = growthClubKey($row['country'] ?? 'china', (int)$row['club_id']);
            if (in_array($key, $clubKeys, true)) $counts[$key] = (int)$row['cnt'];
        }
    } catch (Throwable $e) {
        try {
            $stmt = $db->query(
                "SELECT club_id, COUNT(*) AS cnt
                 FROM club_memberships
                 WHERE status = 'pending'
                 GROUP BY club_id"
            );
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $key = growthClubKey('china', (int)$row['club_id']);
                if (in_array($key, $clubKeys, true)) $counts[$key] = (int)$row['cnt'];
            }
        } catch (Throwable $ignored) {
            return [];
        }
    }
    return $counts;
}

function growthMemberCounts(array $clubKeys): array {
    if (!$clubKeys) return [];
    $db = getDB();
    $counts = [];
    try {
        $stmt = $db->query(
            "SELECT club_id, country, COUNT(*) AS cnt
             FROM club_memberships
             WHERE status = 'active'
             GROUP BY club_id, country"
        );
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $key = growthClubKey($row['country'] ?? 'china', (int)$row['club_id']);
            if (in_array($key, $clubKeys, true)) $counts[$key] = (int)$row['cnt'];
        }
    } catch (Throwable $e) {
        try {
            $stmt = $db->query(
                "SELECT club_id, COUNT(*) AS cnt
                 FROM club_memberships
                 WHERE status = 'active'
                 GROUP BY club_id"
            );
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $key = growthClubKey('china', (int)$row['club_id']);
                if (in_array($key, $clubKeys, true)) $counts[$key] = (int)$row['cnt'];
            }
        } catch (Throwable $ignored) {
            return [];
        }
    }
    return $counts;
}

$action = strtolower(growthString($_GET['action'] ?? 'club_summary'));

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if ($action !== 'record') {
        growthRespond(['success' => false, 'message' => 'POST action not supported'], 405);
    }
    $body = growthRequestBody();
    $event = growthString($body['event'] ?? '');
    $clubKey = growthString($body['club_key'] ?? $body['club'] ?? '');
    $source = growthString($body['source'] ?? 'web');
    $ok = growthRecordAnalytics($event, $clubKey, $source);
    growthRespond(['success' => $ok]);
}

switch ($action) {
    case 'club_summary':
        $key = growthString($_GET['club'] ?? $_GET['key'] ?? '');
        $club = $key !== '' ? growthFindClubByKey($key) : null;
        if (!$club) {
            $country = strtolower(growthString($_GET['country'] ?? 'china'));
            $club = growthFindClub(in_array($country, ['china', 'japan'], true) ? $country : 'china', (int)($_GET['id'] ?? 0));
        }
        if (!$club) {
            growthRespond(['success' => false, 'message' => 'club not found'], 404);
        }
        $summary = growthBuildClubSummary($club);
        if (growthBoolParam('track')) {
            growthRecordAnalytics('club_share_view', $summary['key'], growthString($_GET['source'] ?? 'web'));
        }
        growthRespond(['success' => true, 'club' => $summary]);

    case 'owner_dashboard':
        $user = requireLogin();
        $memberships = growthManagedMemberships($user);
        $clubs = [];
        $clubKeys = [];
        foreach ($memberships as $membership) {
            $club = growthFindClub($membership['country'] ?? 'china', (int)($membership['club_id'] ?? 0));
            if (!$club) continue;
            $summary = growthBuildClubSummary($club);
            $summary['owner_role'] = $membership['role'] ?? 'manager';
            $clubs[] = $summary;
            $clubKeys[] = $summary['key'];
        }
        $pendingCounts = growthPendingCounts($clubKeys);
        $memberCounts = growthMemberCounts($clubKeys);
        $analytics = growthAnalyticsSummary($clubKeys, 30);
        foreach ($clubs as &$club) {
            $key = $club['key'];
            $club['pending_members'] = $pendingCounts[$key] ?? 0;
            $club['member_count'] = $memberCounts[$key] ?? 0;
            $club['analytics'] = $analytics['by_club'][$key] ?? [
                'club_share_view' => 0,
                'club_share_copy' => 0,
                'club_apply_click' => 0,
                'bot_share_query' => 0,
            ];
        }
        growthRespond([
            'success' => true,
            'clubs' => $clubs,
            'analytics' => $analytics,
            'templates' => [
                ['key' => 'event', 'label' => '发布活动', 'url' => './submit_event.html'],
                ['key' => 'publication', 'label' => '发布刊物征稿', 'url' => './submit_publication.html'],
                ['key' => 'club', 'label' => '维护社团资料', 'url' => './admin/club_manager.html'],
            ],
        ]);

    case 'analytics_summary':
        $user = requireLogin();
        $memberships = growthManagedMemberships($user);
        $clubKeys = [];
        foreach ($memberships as $membership) {
            $clubKeys[] = growthClubKey($membership['country'] ?? 'china', (int)($membership['club_id'] ?? 0));
        }
        growthRespond(['success' => true, 'analytics' => growthAnalyticsSummary($clubKeys, 30)]);

    default:
        growthRespond(['success' => false, 'message' => 'unknown action', 'action' => $action], 400);
}
