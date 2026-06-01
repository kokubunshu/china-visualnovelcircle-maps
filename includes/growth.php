<?php
// Shared growth helpers for public club sharing, owner dashboard, and bot summaries.

function growthJsonDecodeFile(string $path, array $fallback = []): array {
    if (!file_exists($path)) return $fallback;
    $raw = file_get_contents($path);
    if ($raw === false) return $fallback;
    $data = json_decode($raw, true);
    return is_array($data) ? $data : $fallback;
}

function growthRows(string $path, string $key): array {
    $data = growthJsonDecodeFile($path, [$key => []]);
    $rows = $data[$key] ?? [];
    return is_array($rows) ? $rows : [];
}

function growthString($value): string {
    return trim((string)($value ?? ''));
}

function growthContains(string $haystack, string $needle): bool {
    if ($needle === '') return true;
    if (function_exists('mb_stripos')) {
        return mb_stripos($haystack, $needle, 0, 'UTF-8') !== false;
    }
    return stripos($haystack, $needle) !== false || strpos($haystack, $needle) !== false;
}

function growthLoadClubs(string $country = 'all'): array {
    $clubs = [];
    if ($country === 'all' || $country === 'china') {
        foreach (growthRows(__DIR__ . '/../data/clubs.json', 'data') as $club) {
            if (!is_array($club)) continue;
            $club['country'] = 'china';
            $clubs[] = $club;
        }
    }
    if ($country === 'all' || $country === 'japan') {
        foreach (growthRows(__DIR__ . '/../data/clubs_japan.json', 'data') as $club) {
            if (!is_array($club)) continue;
            $club['country'] = 'japan';
            $clubs[] = $club;
        }
    }
    return $clubs;
}

function growthClubKey(string $country, int $id): string {
    return ($country === 'japan' ? 'japan' : 'china') . ':' . $id;
}

function growthWikiKey(string $country, int $id): string {
    return ($country === 'japan' ? 'japan' : 'china') . '-' . $id;
}

function growthParseClubKey(string $value): array {
    $value = trim($value);
    if (preg_match('/^(china|japan)[:\-](\d+)$/i', $value, $matches)) {
        return [strtolower($matches[1]), (int)$matches[2]];
    }
    if (preg_match('/^\d+$/', $value)) {
        return ['china', (int)$value];
    }
    return ['', 0];
}

function growthFindClub(string $country, int $id): ?array {
    if ($id <= 0) return null;
    foreach (growthLoadClubs($country ?: 'all') as $club) {
        if ((int)($club['id'] ?? 0) === $id && ($country === '' || ($club['country'] ?? 'china') === $country)) {
            return $club;
        }
    }
    return null;
}

function growthFindClubByKey(string $key): ?array {
    [$country, $id] = growthParseClubKey($key);
    return growthFindClub($country, $id);
}

function growthClubName(array $club): string {
    return growthString($club['display_name'] ?? $club['name'] ?? ('Club #' . (int)($club['id'] ?? 0)));
}

function growthClubRegion(array $club): string {
    $country = $club['country'] ?? 'china';
    if ($country === 'japan') {
        return growthString($club['prefecture'] ?? $club['region'] ?? '');
    }
    return growthString($club['province'] ?? $club['region'] ?? '');
}

function growthPublicContact(array $club): array {
    $contact = growthString($club['info'] ?? '');
    $visible = !empty($club['visible_by_default']) && empty($club['protected']);
    return [
        'text' => $visible ? $contact : '',
        'hidden' => !$visible && $contact !== '',
        'visible_by_default' => $visible ? 1 : 0,
    ];
}

function growthWikiForClub(string $country, int $id): ?array {
    $index = growthJsonDecodeFile(__DIR__ . '/../wiki/index.json', []);
    $key = growthWikiKey($country, $id);
    if (!isset($index[$key]) || !is_array($index[$key])) return null;
    $row = $index[$key];
    $url = growthString($row['url'] ?? '');
    if ($url !== '' && !preg_match('/^https?:\/\//i', $url)) {
        $row['url'] = './wiki/' . ltrim(preg_replace('/^\.\//', '', $url), '/');
    }
    return $row;
}

function growthPublicationsForClub(array $club): array {
    $country = $club['country'] ?? 'china';
    $id = (int)($club['id'] ?? 0);
    $name = growthClubName($club);
    $shortName = growthString($club['name'] ?? '');
    $items = [];
    foreach (growthRows(__DIR__ . '/../data/publications.json', 'publications') as $pub) {
        if (!is_array($pub)) continue;
        $matched = false;
        foreach (($pub['club_ids'] ?? []) as $clubRef) {
            if (!is_array($clubRef)) continue;
            if ((int)($clubRef['id'] ?? 0) === $id && ($clubRef['country'] ?? 'china') === $country) {
                $matched = true;
                break;
            }
        }
        if (!$matched) {
            $clubName = growthString($pub['clubName'] ?? '');
            $matched = $clubName !== '' && ($clubName === $name || $clubName === $shortName || growthContains($clubName, $shortName));
        }
        if ($matched) {
            $items[] = [
                'id' => (int)($pub['id'] ?? 0),
                'name' => growthString($pub['publicationName'] ?? ''),
                'status' => growthString($pub['status'] ?? ''),
                'deadline' => growthString($pub['deadline'] ?? ''),
                'description' => growthString($pub['description'] ?? ''),
                'submit_link' => growthString($pub['submitLink'] ?? ''),
                'image_url' => growthString($pub['image_url'] ?? ''),
            ];
        }
    }
    return $items;
}

function growthEventsForClub(array $club): array {
    $country = $club['country'] ?? 'china';
    $id = (int)($club['id'] ?? 0);
    $name = growthClubName($club);
    $shortName = growthString($club['name'] ?? '');
    $items = [];
    foreach (growthRows(__DIR__ . '/../data/events.json', 'events') as $event) {
        if (!is_array($event)) continue;
        $matched = false;
        if (isset($event['club_id']) && (int)$event['club_id'] === $id && ($event['country'] ?? $country) === $country) {
            $matched = true;
        }
        foreach (($event['club_ids'] ?? []) as $clubRef) {
            if (!is_array($clubRef)) continue;
            if ((int)($clubRef['id'] ?? 0) === $id && ($clubRef['country'] ?? 'china') === $country) {
                $matched = true;
                break;
            }
        }
        if (!$matched) {
            $text = growthString(($event['clubName'] ?? '') . ' ' . ($event['raw_text'] ?? '') . ' ' . ($event['event'] ?? ''));
            $matched = ($shortName !== '' && growthContains($text, $shortName)) || ($name !== '' && growthContains($text, $name));
        }
        if ($matched) {
            $items[] = [
                'id' => (int)($event['id'] ?? 0),
                'title' => growthString($event['event'] ?? ''),
                'date' => growthString($event['date'] ?? ''),
                'date_end' => growthString($event['date_end'] ?? ''),
                'description' => growthString($event['description'] ?? ''),
                'link' => growthString($event['link'] ?? ''),
                'image' => growthString($event['image'] ?? ''),
            ];
        }
    }
    usort($items, function ($a, $b) {
        return strcmp((string)($b['date'] ?? ''), (string)($a['date'] ?? ''));
    });
    return $items;
}

function growthClubCompleteness(array $club, ?array $wiki, array $events, array $publications): array {
    $checks = [
        'logo' => growthString($club['logo_url'] ?? '') !== '',
        'intro' => growthString($club['remark'] ?? $club['raw_text'] ?? '') !== '',
        'public_contact' => !growthPublicContact($club)['hidden'],
        'external_links' => growthString($club['external_links'] ?? '') !== '',
        'wiki' => $wiki !== null,
        'events' => count($events) > 0,
        'publications' => count($publications) > 0,
    ];
    $missing = [];
    foreach ($checks as $key => $ok) {
        if (!$ok) $missing[] = $key;
    }
    return [
        'score' => (int)round((count($checks) - count($missing)) / max(1, count($checks)) * 100),
        'missing' => $missing,
    ];
}

function growthBuildClubSummary(array $club): array {
    $country = $club['country'] ?? 'china';
    $id = (int)($club['id'] ?? 0);
    $key = growthClubKey($country, $id);
    $wiki = growthWikiForClub($country, $id);
    $events = growthEventsForClub($club);
    $publications = growthPublicationsForClub($club);
    $contact = growthPublicContact($club);
    return [
        'id' => $id,
        'key' => $key,
        'country' => $country,
        'name' => growthClubName($club),
        'short_name' => growthString($club['name'] ?? ''),
        'school' => growthString($club['school'] ?? ''),
        'region' => growthClubRegion($club),
        'type' => growthString($club['type'] ?? 'school') ?: 'school',
        'logo_url' => growthString($club['logo_url'] ?? ''),
        'external_links' => growthString($club['external_links'] ?? ''),
        'remark' => growthString($club['remark'] ?? ''),
        'contact' => $contact['text'],
        'contact_hidden' => $contact['hidden'],
        'visible_by_default' => $contact['visible_by_default'],
        'share_url' => './club_share.html?club=' . rawurlencode($key),
        'apply_url' => './index.html?guest=1&club=' . rawurlencode($key),
        'completeness' => growthClubCompleteness($club, $wiki, $events, $publications),
        'activity' => [
            'events' => array_slice($events, 0, 5),
            'publications' => array_slice($publications, 0, 5),
            'wiki' => $wiki,
        ],
    ];
}

function growthAnalyticsFile(): string {
    return __DIR__ . '/../data/growth_analytics.json';
}

function growthRecordAnalytics(string $event, string $clubKey = '', string $source = 'web'): bool {
    $allowed = ['club_share_view', 'club_share_copy', 'club_apply_click', 'bot_share_query'];
    if (!in_array($event, $allowed, true)) return false;
    $clubKey = preg_replace('/[^a-z0-9:_-]/i', '', $clubKey) ?: 'global';
    $source = preg_replace('/[^a-z0-9:_-]/i', '', substr($source, 0, 32)) ?: 'web';
    $path = growthAnalyticsFile();
    $dir = dirname($path);
    if (!is_dir($dir)) return false;
    $handle = fopen($path, 'c+');
    if (!$handle) return false;
    try {
        flock($handle, LOCK_EX);
        $raw = stream_get_contents($handle);
        $data = $raw ? json_decode($raw, true) : [];
        if (!is_array($data)) $data = [];
        if (!isset($data['days']) || !is_array($data['days'])) $data['days'] = [];
        $day = date('Y-m-d');
        if (!isset($data['days'][$day])) $data['days'][$day] = [];
        if (!isset($data['days'][$day][$event])) $data['days'][$day][$event] = [];
        if (!isset($data['days'][$day][$event][$clubKey])) {
            $data['days'][$day][$event][$clubKey] = ['total' => 0, 'sources' => []];
        }
        $data['days'][$day][$event][$clubKey]['total']++;
        $data['days'][$day][$event][$clubKey]['sources'][$source] =
            ($data['days'][$day][$event][$clubKey]['sources'][$source] ?? 0) + 1;
        ftruncate($handle, 0);
        rewind($handle);
        fwrite($handle, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
        return true;
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function growthAnalyticsSummary(array $clubKeys = [], int $days = 30): array {
    $data = growthJsonDecodeFile(growthAnalyticsFile(), ['days' => []]);
    $wanted = array_fill_keys($clubKeys, true);
    $hasFilter = count($clubKeys) > 0;
    $cutoff = strtotime('-' . max(1, $days - 1) . ' days', strtotime(date('Y-m-d')));
    $summary = [
        'club_share_view' => 0,
        'club_share_copy' => 0,
        'club_apply_click' => 0,
        'bot_share_query' => 0,
        'by_club' => [],
    ];
    foreach (($data['days'] ?? []) as $day => $events) {
        if (strtotime((string)$day) < $cutoff || !is_array($events)) continue;
        foreach ($events as $event => $clubs) {
            if (!isset($summary[$event]) || !is_array($clubs)) continue;
            foreach ($clubs as $clubKey => $row) {
                if ($hasFilter && !isset($wanted[$clubKey])) continue;
                $total = (int)($row['total'] ?? 0);
                $summary[$event] += $total;
                if (!isset($summary['by_club'][$clubKey])) {
                    $summary['by_club'][$clubKey] = [
                        'club_share_view' => 0,
                        'club_share_copy' => 0,
                        'club_apply_click' => 0,
                        'bot_share_query' => 0,
                    ];
                }
                $summary['by_club'][$clubKey][$event] += $total;
            }
        }
    }
    return $summary;
}
