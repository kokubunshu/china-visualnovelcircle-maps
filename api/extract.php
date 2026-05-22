<?php
// api/extract.php - read-only aggregation API for public and signed-in user data.

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'GET only']);
    exit();
}

require_once __DIR__ . '/../includes/auth.php';

const EXTRACT_MAX_LIMIT = 100;
const EXTRACT_DEFAULT_LIMIT = 20;

function extractRespond(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit();
}

function extractReadJsonRows(string $path, string $listKey): array {
    if (!file_exists($path)) {
        return [];
    }
    $decoded = json_decode((string)file_get_contents($path), true);
    if (!is_array($decoded)) {
        return [];
    }
    $rows = $decoded[$listKey] ?? [];
    return is_array($rows) ? $rows : [];
}

function extractLimit(): int {
    $limit = (int)($_GET['limit'] ?? EXTRACT_DEFAULT_LIMIT);
    if ($limit < 1) {
        return EXTRACT_DEFAULT_LIMIT;
    }
    return min(EXTRACT_MAX_LIMIT, $limit);
}

function extractCountry(): string {
    $country = strtolower(trim((string)($_GET['country'] ?? 'all')));
    return in_array($country, ['china', 'japan', 'all'], true) ? $country : 'all';
}

function extractQuery(): string {
    return trim((string)($_GET['q'] ?? $_GET['query'] ?? ''));
}

function extractId(): int {
    return (int)($_GET['id'] ?? 0);
}

function extractString(array $row, string $key): string {
    return trim((string)($row[$key] ?? ''));
}

function extractTextMatches(array $row, string $query, array $fields): bool {
    if ($query === '') {
        return true;
    }
    foreach ($fields as $field) {
        $value = $row[$field] ?? '';
        if (is_array($value)) {
            $value = implode(' ', array_map('strval', $value));
        }
        if ($value !== '' && stripos((string)$value, $query) !== false) {
            return true;
        }
    }
    return false;
}

function extractToBool($value): bool {
    return $value === true || $value === 1 || $value === '1' || $value === 'true';
}

function extractCurrentUserContext(): array {
    $user = getCurrentUser();
    $context = [
        'user' => $user,
        'effective_level' => -1,
        'active_memberships' => [],
    ];
    if (!$user) {
        return $context;
    }

    $context['effective_level'] = ROLE_HIERARCHY[$user['role'] ?? 'visitor'] ?? 0;

    try {
        $db = getDB();
        $stmt = $db->prepare(
            "SELECT club_id, country, role, status
             FROM club_memberships
             WHERE user_id = ?"
        );
        $stmt->execute([(int)$user['id']]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $membership) {
            if (($membership['status'] ?? '') !== 'active') {
                continue;
            }
            $country = $membership['country'] ?? 'china';
            $clubId = (int)($membership['club_id'] ?? 0);
            if ($clubId > 0) {
                $context['active_memberships'][$country . ':' . $clubId] = true;
            }
            $level = ROLE_HIERARCHY[$membership['role'] ?? 'visitor'] ?? 0;
            if ($level > $context['effective_level']) {
                $context['effective_level'] = $level;
            }
        }
    } catch (Throwable $e) {
        // Keep public extraction available even if optional membership columns are missing.
    }

    return $context;
}

function extractCanSeeClubContact(array $club, string $country, array $context): bool {
    if (extractString($club, 'info') === '') {
        return false;
    }
    if (extractToBool($club['visible_by_default'] ?? false)) {
        return true;
    }

    $user = $context['user'];
    $clubId = (int)($club['id'] ?? 0);
    $isSuperAdmin = $user && (($user['role'] ?? '') === 'super_admin');
    $isMember = $clubId > 0 && !empty($context['active_memberships'][$country . ':' . $clubId]);

    if (extractToBool($club['protected'] ?? false)) {
        return $isMember || $isSuperAdmin;
    }

    return $isMember || $isSuperAdmin || ($context['effective_level'] >= (ROLE_HIERARCHY['member'] ?? 1));
}

function extractClubRow(array $club, string $country, array $context, bool $includeContact): array {
    $region = extractString($club, $country === 'japan' ? 'prefecture' : 'province');
    if ($region === '') {
        $region = extractString($club, 'province') ?: extractString($club, 'prefecture');
    }

    $provinces = $club['provinces'] ?? [];
    if (!is_array($provinces) || !$provinces) {
        $provinces = $region !== '' ? [$region] : [];
    }

    $row = [
        'id' => (int)($club['id'] ?? 0),
        'country' => $country,
        'name' => extractString($club, 'display_name') ?: extractString($club, 'name'),
        'short_name' => extractString($club, 'name'),
        'school' => extractString($club, 'school'),
        'region' => $region,
        'regions' => array_values($provinces),
        'type' => extractString($club, 'type') ?: 'school',
        'verified' => (int)($club['verified'] ?? 0),
        'project' => extractString($club, 'project') ?: 'galgame',
        'created_at' => extractString($club, 'created_at'),
        'logo_url' => extractString($club, 'logo_url'),
        'external_links' => extractString($club, 'external_links'),
    ];

    if ($includeContact) {
        if (extractCanSeeClubContact($club, $country, $context)) {
            $row['contact'] = extractString($club, 'info');
            $row['contact_hidden'] = false;
        } else {
            $row['contact_hidden'] = extractString($club, 'info') !== '';
        }
    }

    return $row;
}

function extractClubs(bool $withItems = true): array {
    $country = extractCountry();
    $query = extractQuery();
    $id = extractId();
    $limit = extractLimit();
    $includeContact = !empty($_GET['include_contact']);
    $context = $includeContact ? extractCurrentUserContext() : ['user' => null, 'effective_level' => -1, 'active_memberships' => []];

    $sources = [];
    if ($country === 'all' || $country === 'china') {
        $sources[] = ['country' => 'china', 'rows' => extractReadJsonRows(__DIR__ . '/../data/clubs.json', 'data')];
    }
    if ($country === 'all' || $country === 'japan') {
        $sources[] = ['country' => 'japan', 'rows' => extractReadJsonRows(__DIR__ . '/../data/clubs_japan.json', 'data')];
    }

    $items = [];
    $chinaTotal = 0;
    $japanTotal = 0;
    foreach ($sources as $source) {
        $sourceCountry = $source['country'];
        if ($sourceCountry === 'china') {
            $chinaTotal = count($source['rows']);
        } elseif ($sourceCountry === 'japan') {
            $japanTotal = count($source['rows']);
        }

        if (!$withItems) {
            continue;
        }

        foreach ($source['rows'] as $club) {
            if ($id > 0 && (int)($club['id'] ?? 0) !== $id) {
                continue;
            }
            if (!extractTextMatches($club, $query, ['name', 'display_name', 'school', 'province', 'prefecture', 'type', 'project'])) {
                continue;
            }
            $items[] = extractClubRow($club, $sourceCountry, $context, $includeContact);
        }
    }

    return [
        'total' => count($items),
        'available' => [
            'china' => $chinaTotal,
            'japan' => $japanTotal,
            'all' => $chinaTotal + $japanTotal,
        ],
        'items' => array_slice($items, 0, $limit),
    ];
}

function extractEventRow(array $event): array {
    return [
        'id' => (int)($event['id'] ?? 0),
        'title' => extractString($event, 'event'),
        'date' => extractString($event, 'date'),
        'description' => extractString($event, 'description'),
        'image_url' => extractString($event, 'image'),
        'link' => extractString($event, 'link'),
        'official' => (int)($event['offical'] ?? $event['official'] ?? 0),
        'created_at' => extractString($event, 'created_at'),
    ];
}

function extractEvents(bool $withItems = true): array {
    $rows = extractReadJsonRows(__DIR__ . '/../data/events.json', 'events');
    if (!$withItems) {
        return ['total' => count($rows), 'items' => []];
    }
    $query = extractQuery();
    $id = extractId();
    $items = [];
    foreach ($rows as $event) {
        if ($id > 0 && (int)($event['id'] ?? 0) !== $id) {
            continue;
        }
        if (!extractTextMatches($event, $query, ['event', 'date', 'description', 'link'])) {
            continue;
        }
        $items[] = extractEventRow($event);
    }
    return ['total' => count($items), 'items' => array_slice($items, 0, extractLimit())];
}

function extractPublicationRow(array $publication): array {
    return [
        'id' => (int)($publication['id'] ?? 0),
        'title' => extractString($publication, 'publicationName'),
        'club_name' => extractString($publication, 'clubName'),
        'club_ids' => is_array($publication['club_ids'] ?? null) ? $publication['club_ids'] : [],
        'status' => extractString($publication, 'status'),
        'deadline' => extractString($publication, 'deadline'),
        'description' => extractString($publication, 'description'),
        'submit_contact' => extractString($publication, 'submitContact'),
        'submit_link' => extractString($publication, 'submitLink'),
        'image_url' => extractString($publication, 'image_url'),
        'created_at' => extractString($publication, 'created_at'),
        'updated_at' => extractString($publication, 'updated_at'),
    ];
}

function extractPublications(bool $withItems = true): array {
    $rows = extractReadJsonRows(__DIR__ . '/../data/publications.json', 'publications');
    if (!$withItems) {
        return ['total' => count($rows), 'items' => []];
    }
    $query = extractQuery();
    $id = extractId();
    $items = [];
    foreach ($rows as $publication) {
        if ($id > 0 && (int)($publication['id'] ?? 0) !== $id) {
            continue;
        }
        if (!extractTextMatches($publication, $query, ['publicationName', 'clubName', 'status', 'deadline', 'description'])) {
            continue;
        }
        $items[] = extractPublicationRow($publication);
    }
    return ['total' => count($items), 'items' => array_slice($items, 0, extractLimit())];
}

function extractMoeContestRow(array $contest): array {
    return [
        'id' => (int)($contest['id'] ?? 0),
        'club_id' => (int)($contest['club_id'] ?? 0),
        'country' => $contest['country'] ?? 'china',
        'title' => $contest['title'] ?? '',
        'description' => $contest['description'] ?? '',
        'cover_url' => $contest['cover_url'] ?? '',
        'candidate_mode' => $contest['candidate_mode'] ?? 'character_custom',
        'status' => $contest['status'] ?? '',
        'visibility' => $contest['visibility'] ?? '',
        'eligibility_mode' => $contest['eligibility_mode'] ?? '',
        'result_visibility' => $contest['result_visibility'] ?? '',
        'published_at' => $contest['published_at'] ?? '',
        'ended_at' => $contest['ended_at'] ?? '',
        'updated_at' => $contest['updated_at'] ?? '',
    ];
}

function extractMoeContests(bool $withItems = true): array {
    try {
        $db = getDB();
        $country = extractCountry();
        $query = extractQuery();
        $id = extractId();
        $where = ["visibility = 'public'", "status <> 'draft'"];
        $params = [];

        if ($id > 0) {
            $where[] = 'id = ?';
            $params[] = $id;
        }
        if ($country !== 'all') {
            $where[] = 'country = ?';
            $params[] = $country;
        }
        if ($query !== '') {
            $where[] = '(title LIKE ? OR description LIKE ?)';
            $params[] = '%' . $query . '%';
            $params[] = '%' . $query . '%';
        }

        $countStmt = $db->prepare('SELECT COUNT(*) FROM moe_contests WHERE ' . implode(' AND ', $where));
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        if (!$withItems) {
            return ['total' => $total, 'items' => []];
        }

        $limit = extractLimit();
        $stmt = $db->prepare(
            'SELECT id, club_id, country, title, description, cover_url, candidate_mode, status, visibility, eligibility_mode, result_visibility, published_at, ended_at, updated_at
             FROM moe_contests
             WHERE ' . implode(' AND ', $where) . '
             ORDER BY updated_at DESC, id DESC
             LIMIT ' . $limit
        );
        $stmt->execute($params);
        return [
            'total' => $total,
            'items' => array_map('extractMoeContestRow', $stmt->fetchAll(PDO::FETCH_ASSOC)),
        ];
    } catch (Throwable $e) {
        return ['total' => 0, 'items' => []];
    }
}

function extractPublicUser(array $user): array {
    return [
        'id' => (int)($user['id'] ?? 0),
        'username' => $user['username'] ?? '',
        'nickname' => $user['nickname'] ?? ($user['username'] ?? ''),
        'avatar_url' => $user['avatar_url'] ?? '',
        'role' => $user['role'] ?? 'visitor',
        'email' => $user['email'] ?? '',
        'email_verified' => !empty($user['email_verified_at']),
        'qq_bound' => !empty($user['qq_openid']),
        'discord_bound' => !empty($user['discord_id']),
        'profile_bio' => $user['profile_bio'] ?? '',
        'is_audit' => (int)($user['is_audit'] ?? 0),
    ];
}

function extractClubNameById(int $clubId, string $country): string {
    $file = $country === 'japan'
        ? __DIR__ . '/../data/clubs_japan.json'
        : __DIR__ . '/../data/clubs.json';
    foreach (extractReadJsonRows($file, 'data') as $club) {
        if ((int)($club['id'] ?? 0) === $clubId) {
            return extractString($club, 'display_name') ?: extractString($club, 'name');
        }
    }
    return '';
}

function extractUserMemberships(int $userId): array {
    try {
        $db = getDB();
        try {
            $stmt = $db->prepare(
                "SELECT id, club_id, country, role, status, joined_at
                 FROM club_memberships
                 WHERE user_id = ?
                 ORDER BY joined_at DESC"
            );
            $stmt->execute([$userId]);
        } catch (Throwable $e) {
            $stmt = $db->prepare(
                "SELECT id, club_id, role, status, joined_at
                 FROM club_memberships
                 WHERE user_id = ?
                 ORDER BY joined_at DESC"
            );
            $stmt->execute([$userId]);
        }

        $items = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $membership) {
            $country = $membership['country'] ?? 'china';
            $clubId = (int)($membership['club_id'] ?? 0);
            $items[] = [
                'id' => (int)($membership['id'] ?? 0),
                'club_id' => $clubId,
                'country' => $country,
                'club_name' => $clubId > 0 ? extractClubNameById($clubId, $country) : '',
                'role' => $membership['role'] ?? 'member',
                'status' => $membership['status'] ?? '',
                'joined_at' => $membership['joined_at'] ?? '',
            ];
        }
        return $items;
    } catch (Throwable $e) {
        return [];
    }
}

function extractUserNotifications(int $userId): array {
    try {
        $db = getDB();
        $totalStmt = $db->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ?');
        $totalStmt->execute([$userId]);
        $unreadStmt = $db->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0');
        $unreadStmt->execute([$userId]);
        $listStmt = $db->prepare(
            'SELECT id, type, title, link, related_type, related_id, is_read, created_at
             FROM notifications
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT 5'
        );
        $listStmt->execute([$userId]);
        $items = [];
        foreach ($listStmt->fetchAll(PDO::FETCH_ASSOC) as $notification) {
            $items[] = [
                'id' => (int)($notification['id'] ?? 0),
                'type' => $notification['type'] ?? '',
                'title' => $notification['title'] ?? '',
                'link' => $notification['link'] ?? '',
                'related_type' => $notification['related_type'] ?? '',
                'related_id' => (int)($notification['related_id'] ?? 0),
                'is_read' => (int)($notification['is_read'] ?? 0),
                'created_at' => $notification['created_at'] ?? '',
            ];
        }
        return [
            'total' => (int)$totalStmt->fetchColumn(),
            'unread' => (int)$unreadStmt->fetchColumn(),
            'items' => $items,
        ];
    } catch (Throwable $e) {
        return ['total' => 0, 'unread' => 0, 'items' => []];
    }
}

function extractPendingMembershipCount(array $user): int {
    try {
        $db = getDB();
        if (($user['role'] ?? '') === 'super_admin') {
            $stmt = $db->query("SELECT COUNT(*) FROM club_memberships WHERE status = 'pending'");
            return (int)$stmt->fetchColumn();
        }
        $stmt = $db->prepare(
            "SELECT COUNT(*)
             FROM club_memberships cm
             WHERE cm.status = 'pending'
               AND EXISTS (
                   SELECT 1
                   FROM club_memberships mgr
                   WHERE mgr.user_id = ?
                     AND mgr.club_id = cm.club_id
                     AND mgr.status = 'active'
                     AND mgr.role IN ('representative', 'manager')
                     AND (mgr.country = cm.country OR mgr.country IS NULL OR mgr.country = '')
               )"
        );
        $stmt->execute([(int)$user['id']]);
        return (int)$stmt->fetchColumn();
    } catch (Throwable $e) {
        return 0;
    }
}

function extractUserData(): array {
    $user = getCurrentUser();
    if (!$user) {
        extractRespond(['success' => false, 'message' => 'Login required', 'logged_in' => false], 401);
    }

    $userId = (int)$user['id'];
    return [
        'user' => extractPublicUser($user),
        'memberships' => extractUserMemberships($userId),
        'notifications' => extractUserNotifications($userId),
        'pending_membership_count' => extractPendingMembershipCount($user),
    ];
}

function extractSummary(): array {
    $clubs = extractClubs(true);
    $events = extractEvents(true);
    $publications = extractPublications(true);
    $moeContests = extractMoeContests(true);
    $user = getCurrentUser();

    return [
        'viewer' => [
            'logged_in' => (bool)$user,
            'user' => $user ? extractPublicUser($user) : null,
        ],
        'clubs' => $clubs,
        'events' => $events,
        'publications' => $publications,
        'moe_contests' => $moeContests,
    ];
}

function extractHelp(): array {
    return [
        'resources' => ['summary', 'clubs', 'events', 'publications', 'moe_contests', 'user'],
        'params' => [
            'resource' => 'summary|clubs|events|publications|moe_contests|user',
            'country' => 'all|china|japan, used by clubs and moe_contests',
            'q' => 'text search',
            'id' => 'resource id',
            'limit' => '1-100, default 20',
            'include_contact' => '1 to include club contact only when current viewer can see it',
        ],
        'examples' => [
            '/api/extract.php',
            '/api/extract.php?resource=clubs&country=china&limit=10',
            '/api/extract.php?resource=events&q=GalOnly',
            '/api/extract.php?resource=user',
        ],
    ];
}

$resource = strtolower(trim((string)($_GET['resource'] ?? $_GET['type'] ?? 'summary')));
if ($resource === '' || $resource === 'all') {
    $resource = 'summary';
}

switch ($resource) {
    case 'help':
        $data = extractHelp();
        break;
    case 'summary':
        $data = extractSummary();
        break;
    case 'clubs':
        $data = extractClubs(true);
        break;
    case 'events':
        $data = extractEvents(true);
        break;
    case 'publications':
        $data = extractPublications(true);
        break;
    case 'moe_contests':
    case 'moe':
        $resource = 'moe_contests';
        $data = extractMoeContests(true);
        break;
    case 'user':
    case 'me':
        $resource = 'user';
        $data = extractUserData();
        break;
    default:
        extractRespond(['success' => false, 'message' => 'Unknown resource', 'resource' => $resource], 400);
}

extractRespond([
    'success' => true,
    'resource' => $resource,
    'generated_at' => gmdate('c'),
    'data' => $data,
]);
