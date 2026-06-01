<?php
require_once __DIR__ . '/auth.php';

function projectHubDataPath(string $name): string {
    return __DIR__ . '/../data/' . $name;
}

function projectHubJsonRead(string $file, array $fallback): array {
    if (!file_exists($file)) {
        return $fallback;
    }
    if (!isset($GLOBALS['PROJECT_HUB_JSON_CACHE']) || !is_array($GLOBALS['PROJECT_HUB_JSON_CACHE'])) {
        $GLOBALS['PROJECT_HUB_JSON_CACHE'] = [];
    }
    $cache =& $GLOBALS['PROJECT_HUB_JSON_CACHE'];
    $mtime = filemtime($file) ?: 0;
    if (isset($cache[$file]) && ($cache[$file]['mtime'] ?? -1) === $mtime) {
        return $cache[$file]['data'];
    }
    $raw = file_get_contents($file);
    if ($raw === false || trim($raw) === '') {
        return $fallback;
    }
    $data = json_decode($raw, true);
    $result = is_array($data) ? $data : $fallback;
    $cache[$file] = ['mtime' => $mtime, 'data' => $result];
    return $result;
}

function projectHubJsonWrite(string $file, array $data): bool {
    $dir = dirname($file);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    $fh = fopen($file, 'c+');
    if (!$fh) {
        return false;
    }
    try {
        if (!flock($fh, LOCK_EX)) {
            fclose($fh);
            return false;
        }
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        fflush($fh);
        flock($fh, LOCK_UN);
        fclose($fh);
        clearstatcache(true, $file);
        if (!isset($GLOBALS['PROJECT_HUB_JSON_CACHE']) || !is_array($GLOBALS['PROJECT_HUB_JSON_CACHE'])) {
            $GLOBALS['PROJECT_HUB_JSON_CACHE'] = [];
        }
        $GLOBALS['PROJECT_HUB_JSON_CACHE'][$file] = ['mtime' => filemtime($file) ?: time(), 'data' => $data];
        return true;
    } catch (Throwable $e) {
        flock($fh, LOCK_UN);
        fclose($fh);
        error_log('projectHubJsonWrite failed: ' . $e->getMessage());
        return false;
    }
}

function projectHubRespond(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit();
}

function projectHubInput(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function projectHubNow(): string {
    return date('Y-m-d H:i:s');
}

function projectHubCleanString($value, int $max = 2000): string {
    $text = trim((string)($value ?? ''));
    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $max);
    }
    return substr($text, 0, $max);
}

function projectHubCleanDate($value): string {
    $text = trim((string)($value ?? ''));
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $text) ? $text : '';
}

function projectHubClubSources(): array {
    return [
        ['file' => projectHubDataPath('clubs.json'), 'country' => 'china'],
        ['file' => projectHubDataPath('clubs_japan.json'), 'country' => 'japan'],
    ];
}

function projectHubClubName(int $clubId, string $country = 'china'): string {
    if ($clubId <= 0) {
        return '';
    }
    static $nameMaps = [];
    if (!$nameMaps) {
        foreach (projectHubClubSources() as $source) {
            $json = projectHubJsonRead($source['file'], ['data' => []]);
            $nameMaps[$source['country']] = [];
            foreach (($json['data'] ?? []) as $row) {
                $id = (int)($row['id'] ?? 0);
                if ($id > 0) {
                    $nameMaps[$source['country']][$id] = (string)($row['name'] ?? $row['display_name'] ?? $row['school'] ?? '');
                }
            }
        }
    }
    if ($country !== '' && isset($nameMaps[$country][$clubId])) {
        return $nameMaps[$country][$clubId];
    }
    foreach ($nameMaps as $map) {
        if (isset($map[$clubId])) {
            return $map[$clubId];
        }
    }
    return '';
}

function projectHubHydrateClub(?array $club): ?array {
    $normalized = projectHubNormalizeClub($club);
    if (!$normalized) {
        return null;
    }
    if (empty($normalized['name'])) {
        $normalized['name'] = projectHubClubName((int)$normalized['id'], $normalized['country'] ?? 'china');
    }
    return $normalized;
}

function projectHubHydrateProjectClubs(array $project): array {
    $project['organizer_club'] = projectHubHydrateClub($project['organizer_club'] ?? null) ?? ($project['organizer_club'] ?? null);
    $participants = [];
    foreach (($project['participant_clubs'] ?? []) as $club) {
        $hydrated = projectHubHydrateClub($club);
        if ($hydrated) {
            $participants[] = $hydrated;
        }
    }
    $project['participant_clubs'] = $participants;
    return $project;
}

function projectHubNormalizeClub($value): ?array {
    if (!is_array($value)) {
        return null;
    }
    $id = (int)($value['id'] ?? $value['club_id'] ?? 0);
    if ($id <= 0) {
        return null;
    }
    $country = projectHubCleanString($value['country'] ?? 'china', 20);
    $name = projectHubCleanString($value['name'] ?? $value['club_name'] ?? '', 160);
    if ($name === '') {
        $name = projectHubClubName($id, $country ?: 'china');
    }
    return ['id' => $id, 'country' => $country ?: 'china', 'name' => $name];
}

function projectHubNormalizeClubs($value): array {
    if (!is_array($value)) {
        return [];
    }
    $out = [];
    foreach ($value as $club) {
        $normalized = projectHubNormalizeClub($club);
        if ($normalized) {
            $key = $normalized['country'] . ':' . $normalized['id'];
            $out[$key] = $normalized;
        }
    }
    return array_values($out);
}

function projectHubCanManageClub(array $user, int $clubId, string $country = 'china'): bool {
    if (($user['role'] ?? '') === 'super_admin') {
        return true;
    }
    if ($clubId <= 0) {
        return false;
    }
    try {
        $db = getDB();
        $stmt = $db->prepare(
            "SELECT id FROM club_memberships
             WHERE user_id = ?
               AND club_id = ?
               AND COALESCE(country, 'china') = ?
               AND role IN ('representative', 'manager')
               AND status = 'active'
             LIMIT 1"
        );
        $stmt->execute([(int)$user['id'], $clubId, $country ?: 'china']);
        return (bool)$stmt->fetch();
    } catch (Throwable $e) {
        error_log('projectHubCanManageClub failed: ' . $e->getMessage());
        return false;
    }
}

function projectHubFirstManagedClub(array $user): ?array {
    if (($user['role'] ?? '') === 'super_admin') {
        return null;
    }
    try {
        $db = getDB();
        $stmt = $db->prepare(
            "SELECT club_id, COALESCE(country, 'china') AS country
             FROM club_memberships
             WHERE user_id = ?
               AND role IN ('representative', 'manager')
               AND status = 'active'
             ORDER BY id ASC
             LIMIT 1"
        );
        $stmt->execute([(int)$user['id']]);
        $row = $stmt->fetch();
        if (!$row) {
            return null;
        }
        return ['id' => (int)$row['club_id'], 'country' => $row['country'] ?: 'china'];
    } catch (Throwable $e) {
        return null;
    }
}

function projectHubCanManageProject(array $user, array $project): bool {
    if (($user['role'] ?? '') === 'super_admin') {
        return true;
    }
    $club = projectHubNormalizeClub($project['organizer_club'] ?? null);
    return $club ? projectHubCanManageClub($user, $club['id'], $club['country']) : false;
}

function projectHubFindClubByName(string $clubName): ?array {
    $clubName = trim($clubName);
    if ($clubName === '') {
        return null;
    }
    foreach (projectHubClubSources() as $source) {
        $json = projectHubJsonRead($source['file'], ['data' => []]);
        $rows = $json['data'] ?? [];
        foreach ($rows as $row) {
            $names = [
                $row['name'] ?? '',
                $row['display_name'] ?? '',
                $row['school'] ?? '',
                $row['raw_text'] ?? '',
            ];
            foreach ($names as $name) {
                if ($name !== '' && trim((string)$name) === $clubName) {
                    return [
                        'id' => (int)($row['id'] ?? 0),
                        'country' => $source['country'],
                        'name' => (string)($row['name'] ?? $row['display_name'] ?? $row['school'] ?? $clubName),
                    ];
                }
            }
        }
    }
    return null;
}

function projectHubStatusFromPublication(string $status): string {
    $map = [
        'planning' => 'draft',
        'writing' => 'collecting',
        'editing' => 'collecting',
        'publishing' => 'completed',
        'completed' => 'completed',
        'suspended' => 'archived',
    ];
    return $map[$status] ?? 'collecting';
}

function projectHubFallbackFromPublications(): array {
    $data = projectHubJsonRead(projectHubDataPath('publications.json'), ['publications' => []]);
    $projects = [];
    $items = [];
    foreach (($data['publications'] ?? []) as $pub) {
        $id = (int)($pub['id'] ?? 0);
        if ($id <= 0) {
            continue;
        }
        $clubs = projectHubNormalizeClubs($pub['club_ids'] ?? []);
        if (!$clubs && !empty($pub['clubName'])) {
            $found = projectHubFindClubByName((string)$pub['clubName']);
            if ($found) {
                $clubs[] = $found;
            }
        }
        $organizer = $clubs[0] ?? ['id' => 0, 'country' => 'china'];
        $projects[] = [
            'id' => $id,
            'title' => $pub['publicationName'] ?? '未命名刊物',
            'project_type' => 'publication',
            'is_joint' => count($clubs) > 1,
            'status' => projectHubStatusFromPublication((string)($pub['status'] ?? 'writing')),
            'organizer_club' => $organizer,
            'participant_clubs' => $clubs,
            'summary' => projectHubCleanString($pub['description'] ?? '', 100),
            'description' => $pub['description'] ?? '',
            'cover_image' => $pub['image_url'] ?? '',
            'deadline' => $pub['deadline'] ?? '',
            'results_description' => '',
            'results_link' => '',
            'deleted_at' => null,
            'created_at' => $pub['created_at'] ?? projectHubNow(),
            'updated_at' => $pub['updated_at'] ?? projectHubNow(),
            'legacy_publication_id' => $id,
        ];
        $items[] = [
            'id' => 'migrated_' . $id,
            'project_id' => $id,
            'type' => 'submission',
            'label' => '稿件投稿',
            'description' => trim(($pub['submitContact'] ?? '') . (($pub['submitLink'] ?? '') ? "\n" . $pub['submitLink'] : '')),
            'deadline' => $pub['deadline'] ?? '',
            'status' => projectHubStatusFromPublication((string)($pub['status'] ?? 'writing')) === 'archived' ? 'closed' : 'open',
            'max_slots' => null,
            'form_schema' => null,
            'deleted_at' => null,
        ];
    }
    return ['projects' => $projects, 'items' => $items];
}

function projectHubNormalizeEventsPayload($payload): array {
    if (is_array($payload) && isset($payload['events']) && is_array($payload['events'])) {
        return array_values($payload['events']);
    }
    if (is_array($payload) && ($payload === [] || array_keys($payload) === range(0, count($payload) - 1))) {
        return array_values($payload);
    }
    return [];
}

function projectHubActivityProjectId(int $eventId): int {
    return 900000 + $eventId;
}

function projectHubFallbackFromEvents(): array {
    $events = projectHubNormalizeEventsPayload(projectHubJsonRead(projectHubDataPath('events.json'), ['events' => []]));
    $projects = [];
    $items = [];
    foreach ($events as $event) {
        $eventId = (int)($event['id'] ?? 0);
        $title = projectHubCleanString($event['event'] ?? '', 120);
        $date = projectHubCleanDate($event['date'] ?? '');
        if ($eventId <= 0 || $title === '' || $date === '') {
            continue;
        }
        $projectId = projectHubActivityProjectId($eventId);
        $organizer = projectHubNormalizeClub($event['organizer_club'] ?? null);
        if (!$organizer && !empty($event['clubName'])) {
            $organizer = projectHubFindClubByName((string)$event['clubName']);
        }
        $projects[] = [
            'id' => $projectId,
            'title' => $title,
            'project_type' => 'activity',
            'is_joint' => false,
            'status' => 'ongoing',
            'organizer_club' => $organizer ?: ['id' => 0, 'country' => 'china', 'name' => projectHubCleanString($event['clubName'] ?? '日历活动', 80)],
            'participant_clubs' => $organizer ? [$organizer] : [],
            'summary' => projectHubCleanString($event['raw_text'] ?? $event['description'] ?? '', 160),
            'description' => projectHubCleanString($event['description'] ?? $event['raw_text'] ?? '', 8000),
            'cover_image' => projectHubCleanString($event['image'] ?? '', 500),
            'deadline' => $date,
            'event_date' => $date,
            'event_date_end' => projectHubCleanDate($event['date_end'] ?? ''),
            'results_description' => '',
            'results_link' => projectHubCleanString($event['link'] ?? '', 500),
            'calendar_event_id' => $eventId,
            'calendar_source' => 'events',
            'deleted_at' => null,
            'created_at' => $event['created_at'] ?? projectHubNow(),
            'updated_at' => $event['updated_at'] ?? $event['created_at'] ?? projectHubNow(),
        ];
        $items[] = [
            'id' => 'event_registration_' . $eventId,
            'project_id' => $projectId,
            'type' => 'registration',
            'label' => '活动报名',
            'description' => projectHubCleanString($event['raw_text'] ?? $event['description'] ?? '', 1000),
            'deadline' => $date,
            'status' => 'open',
            'max_slots' => null,
            'form_schema' => null,
            'deleted_at' => null,
        ];
    }
    return ['projects' => $projects, 'items' => $items];
}

function projectHubLoadProjects(bool $includeDeleted = false, bool $withFallback = true): array {
    $data = projectHubJsonRead(projectHubDataPath('projects.json'), ['projects' => [], 'migrated_at' => null]);
    $projects = $data['projects'] ?? [];
    if ($withFallback) {
        $publicationFallback = projectHubFallbackFromPublications();
        $seenProjectIds = [];
        $seenLegacyPublicationIds = [];
        foreach ($projects as $project) {
            $seenProjectIds[(int)($project['id'] ?? 0)] = true;
            if (isset($project['legacy_publication_id'])) {
                $seenLegacyPublicationIds[(int)$project['legacy_publication_id']] = true;
            }
        }
        foreach ($publicationFallback['projects'] as $project) {
            $legacyId = (int)($project['legacy_publication_id'] ?? 0);
            $projectId = (int)($project['id'] ?? 0);
            if (empty($seenLegacyPublicationIds[$legacyId]) && empty($seenProjectIds[$projectId])) {
                $projects[] = $project;
                $seenProjectIds[$projectId] = true;
                $seenLegacyPublicationIds[$legacyId] = true;
            }
        }
        $eventFallback = projectHubFallbackFromEvents();
        $seen = [];
        foreach ($projects as $project) {
            if (isset($project['calendar_event_id'])) {
                $seen[(int)$project['calendar_event_id']] = true;
            }
        }
        foreach ($eventFallback['projects'] as $project) {
            if (!isset($seen[(int)($project['calendar_event_id'] ?? 0)])) {
                $projects[] = $project;
            }
        }
    }
    if (!$includeDeleted) {
        $projects = array_values(array_filter($projects, fn($p) => empty($p['deleted_at'])));
    }
    return array_map('projectHubHydrateProjectClubs', $projects);
}

function projectHubLoadItems(bool $includeDeleted = false, bool $withFallback = true): array {
    $data = projectHubJsonRead(projectHubDataPath('project_items.json'), ['items' => []]);
    $items = $data['items'] ?? [];
    if ($withFallback) {
        $publicationFallback = projectHubFallbackFromPublications();
        $seenItemIds = [];
        foreach ($items as $item) {
            $seenItemIds[(string)($item['id'] ?? '')] = true;
        }
        foreach ($publicationFallback['items'] as $item) {
            if (empty($seenItemIds[(string)($item['id'] ?? '')])) {
                $items[] = $item;
                $seenItemIds[(string)($item['id'] ?? '')] = true;
            }
        }
        $eventFallback = projectHubFallbackFromEvents();
        $seen = [];
        foreach ($items as $item) {
            $seen[(string)($item['id'] ?? '')] = true;
        }
        foreach ($eventFallback['items'] as $item) {
            if (empty($seen[(string)($item['id'] ?? '')])) {
                $items[] = $item;
            }
        }
    }
    if (!$includeDeleted) {
        $items = array_values(array_filter($items, fn($item) => empty($item['deleted_at'])));
    }
    return $items;
}

function projectHubNextIntId(array $rows): int {
    $max = 0;
    foreach ($rows as $row) {
        $id = (int)($row['id'] ?? 0);
        if ($id > $max) {
            $max = $id;
        }
    }
    return $max + 1;
}

function projectHubNextItemId(array $rows): string {
    $max = 0;
    foreach ($rows as $row) {
        if (preg_match('/^item_(\d+)$/', (string)($row['id'] ?? ''), $m)) {
            $max = max($max, (int)$m[1]);
        }
    }
    return 'item_' . ($max + 1);
}

function projectHubProjectToCalendarEvent(array $project, ?array $base = null): array {
    $event = $base ?: [];
    $event['event'] = projectHubCleanString($project['title'] ?? '', 120);
    $event['date'] = projectHubCleanDate($project['event_date'] ?? '') ?: projectHubCleanDate($project['deadline'] ?? '');
    $event['date_end'] = projectHubCleanDate($project['event_date_end'] ?? '') ?: null;
    $event['image'] = projectHubCleanString($project['cover_image'] ?? '', 500);
    $event['raw_text'] = projectHubCleanString($project['summary'] ?? '', 500);
    $event['description'] = projectHubCleanString($project['description'] ?? '', 8000);
    $event['link'] = projectHubCleanString($project['results_link'] ?? '', 500);
    $event['offical'] = isset($event['offical']) ? $event['offical'] : 0;
    $event['project_hub_id'] = (int)($project['id'] ?? 0);
    $organizer = projectHubHydrateClub($project['organizer_club'] ?? null);
    if ($organizer) {
        $event['organizer_club'] = $organizer;
        $event['clubName'] = $organizer['name'] ?? '';
    }
    return $event;
}

function projectHubSyncCalendarEvent(array $project): array {
    if (($project['project_type'] ?? '') !== 'activity') {
        return $project;
    }
    $event = projectHubProjectToCalendarEvent($project);
    if (empty($event['event']) || empty($event['date'])) {
        return $project;
    }
    $file = projectHubDataPath('events.json');
    $payload = projectHubJsonRead($file, ['events' => []]);
    $events = projectHubNormalizeEventsPayload($payload);
    $idx = null;
    $eventId = (int)($project['calendar_event_id'] ?? 0);
    foreach ($events as $i => $row) {
        if (($eventId > 0 && (int)($row['id'] ?? 0) === $eventId) || (int)($row['project_hub_id'] ?? 0) === (int)($project['id'] ?? 0)) {
            $idx = $i;
            break;
        }
    }
    if ($idx === null) {
        $event['id'] = projectHubNextIntId($events);
        $event['created_at'] = projectHubNow();
        $events[] = $event;
        $project['calendar_event_id'] = $event['id'];
    } else {
        $event['id'] = (int)($events[$idx]['id'] ?? $eventId);
        $event['created_at'] = $events[$idx]['created_at'] ?? projectHubNow();
        $event['updated_at'] = projectHubNow();
        $events[$idx] = projectHubProjectToCalendarEvent($project, $events[$idx]);
        $project['calendar_event_id'] = $event['id'];
    }
    projectHubJsonWrite($file, ['events' => array_values($events)]);
    return $project;
}

function projectHubDeleteCalendarEvent(array $project): void {
    $eventId = (int)($project['calendar_event_id'] ?? 0);
    if ($eventId <= 0 || ($project['project_type'] ?? '') !== 'activity') {
        return;
    }
    $file = projectHubDataPath('events.json');
    $payload = projectHubJsonRead($file, ['events' => []]);
    $events = projectHubNormalizeEventsPayload($payload);
    $next = array_values(array_filter($events, function ($event) use ($eventId, $project) {
        if ((int)($event['id'] ?? 0) !== $eventId) {
            return true;
        }
        return (int)($event['project_hub_id'] ?? 0) !== (int)($project['id'] ?? 0);
    }));
    if (count($next) !== count($events)) {
        projectHubJsonWrite($file, ['events' => $next]);
    }
}

function projectHubUpsertActivityProjectFromEvent(array $event, ?array $user = null): ?array {
    $eventId = (int)($event['id'] ?? 0);
    $title = projectHubCleanString($event['event'] ?? '', 120);
    $date = projectHubCleanDate($event['date'] ?? '');
    if ($eventId <= 0 || $title === '' || $date === '') {
        return null;
    }
    $file = projectHubDataPath('projects.json');
    $data = projectHubJsonRead($file, ['projects' => [], 'migrated_at' => null]);
    $projects = $data['projects'] ?? [];
    $idx = null;
    $projectId = (int)($event['project_hub_id'] ?? 0);
    foreach ($projects as $i => $project) {
        if (($projectId > 0 && (int)($project['id'] ?? 0) === $projectId) || (int)($project['calendar_event_id'] ?? 0) === $eventId) {
            $idx = $i;
            break;
        }
    }
    $organizer = projectHubNormalizeClub($event['organizer_club'] ?? null);
    if (!$organizer && !empty($event['clubName'])) {
        $organizer = projectHubFindClubByName((string)$event['clubName']);
    }
    if (!$organizer && $user) {
        $organizer = projectHubFirstManagedClub($user);
    }
    if (!$organizer) {
        $organizer = ['id' => 0, 'country' => 'china', 'name' => projectHubCleanString($event['clubName'] ?? '日历活动', 80)];
    }
    $baseProject = $idx === null ? [] : $projects[$idx];
    $project = [
        'id' => $idx === null ? projectHubNextIntId($projects) : (int)($baseProject['id'] ?? 0),
        'title' => $title,
        'project_type' => 'activity',
        'is_joint' => false,
        'status' => 'ongoing',
        'organizer_club' => $organizer,
        'participant_clubs' => $organizer['id'] ? [$organizer] : [],
        'summary' => projectHubCleanString($event['raw_text'] ?? '', 160),
        'description' => projectHubCleanString($event['description'] ?? $event['raw_text'] ?? '', 8000),
        'cover_image' => projectHubCleanString($event['image'] ?? '', 500),
        'deadline' => $date,
        'event_date' => $date,
        'event_date_end' => projectHubCleanDate($event['date_end'] ?? ''),
        'results_description' => $baseProject['results_description'] ?? '',
        'results_link' => projectHubCleanString($event['link'] ?? '', 500),
        'calendar_event_id' => $eventId,
        'deleted_at' => null,
        'created_at' => $idx === null ? projectHubNow() : ($baseProject['created_at'] ?? projectHubNow()),
        'updated_at' => projectHubNow(),
    ];
    if ($idx === null) {
        $projects[] = $project;
    } else {
        $projects[$idx] = array_merge($projects[$idx], $project);
    }
    $data['projects'] = $projects;
    projectHubJsonWrite($file, $data);
    return $project;
}

function projectHubArchiveActivityProjectByEventId(int $eventId): void {
    if ($eventId <= 0) {
        return;
    }
    $file = projectHubDataPath('projects.json');
    $data = projectHubJsonRead($file, ['projects' => [], 'migrated_at' => null]);
    $changed = false;
    foreach (($data['projects'] ?? []) as &$project) {
        if ((int)($project['calendar_event_id'] ?? 0) === $eventId && ($project['project_type'] ?? '') === 'activity') {
            $project['deleted_at'] = projectHubNow();
            $project['updated_at'] = projectHubNow();
            $changed = true;
        }
    }
    unset($project);
    if ($changed) {
        projectHubJsonWrite($file, $data);
    }
}

function projectHubNotify(int $userId, string $type, string $title, string $message = '', string $link = '', string $relatedType = '', int $relatedId = 0): bool {
    if (!function_exists('createNotification')) {
        require_once __DIR__ . '/notifications.php';
    }
    return createNotification($userId, $type, $title, $message, $link, $relatedType, $relatedId);
}

function projectHubNotifyClubAdmins(array $club, string $title, string $message, int $projectId = 0): int {
    $sent = 0;
    try {
        $db = getDB();
        $stmt = $db->prepare(
            "SELECT user_id FROM club_memberships
             WHERE club_id = ?
               AND COALESCE(country, 'china') = ?
               AND role IN ('representative', 'manager')
               AND status = 'active'"
        );
        $stmt->execute([(int)$club['id'], $club['country'] ?? 'china']);
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $userId) {
            if (projectHubNotify((int)$userId, 'project_participation', $title, $message, './user.html#notifications', 'project', $projectId)) {
                $sent++;
            }
        }
    } catch (Throwable $e) {
        error_log('projectHubNotifyClubAdmins failed: ' . $e->getMessage());
    }
    return $sent;
}
