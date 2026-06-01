<?php
// api/vote_sources.php - normalized Bangumi/VNDB source search.

require_once __DIR__ . '/../includes/vote_projects.php';
require_once __DIR__ . '/../includes/image_proxy_helper.php';

voteBootstrap();

$action = trim((string)($_GET['action'] ?? 'search'));
$projectType = voteNormalize((string)($_GET['project_type'] ?? 'twelve'), VOTE_PROJECT_TYPES, 'twelve');
$keyword = trim((string)($_GET['keyword'] ?? $_GET['q'] ?? ''));
$limit = max(1, min(30, (int)($_GET['limit'] ?? 12)));
$cacheDir = __DIR__ . '/../data/cache/vote_sources';
if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0755, true);
}

function voteSourceRequest(string $method, string $url, ?array $body, string $cacheKey, int $ttl = 3600): array {
    global $cacheDir;
    $cacheFile = $cacheDir . '/' . $cacheKey . '.json';
    if (file_exists($cacheFile) && time() - filemtime($cacheFile) < $ttl) {
        $cached = json_decode((string)file_get_contents($cacheFile), true);
        return is_array($cached) ? $cached : [];
    }
    $headers = "Accept: application/json\r\nUser-Agent: VNFestVoteProjects/1.0\r\n";
    $content = null;
    if ($body !== null) {
        $content = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $headers .= "Content-Type: application/json\r\n";
    }
    $context = stream_context_create([
        'http' => [
            'method' => $method,
            'header' => $headers,
            'content' => $content,
            'timeout' => 8,
            'ignore_errors' => true,
        ],
    ]);
    $raw = @file_get_contents($url, false, $context);
    $data = json_decode((string)$raw, true);
    if (is_array($data)) {
        @file_put_contents($cacheFile, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        return $data;
    }
    if (file_exists($cacheFile)) {
        $cached = json_decode((string)file_get_contents($cacheFile), true);
        return is_array($cached) ? $cached : [];
    }
    return [];
}

function voteSourceImage(array $item): string {
    $images = $item['images'] ?? [];
    if (is_array($images)) {
        $url = $images['medium'] ?? $images['grid'] ?? $images['large'] ?? $images['small'] ?? '';
        return proxyImageUrl($url);
    }
    $image = $item['image'] ?? [];
    $url = is_array($image) ? ($image['url'] ?? '') : '';
    return proxyImageUrl($url);
}

function voteBangumiSubjects(string $keyword, int $limit): array {
    $data = voteSourceRequest(
        'GET',
        'https://api.bgm.tv/search/subject/' . urlencode($keyword) . '?type=4&responseGroup=large',
        null,
        'bgm_subject_' . md5(voteLower($keyword) . '_' . $limit),
        3600
    );
    $rows = [];
    foreach (array_slice($data['list'] ?? [], 0, $limit) as $item) {
        if (!is_array($item)) continue;
        $id = (string)($item['id'] ?? '');
        $rows[] = [
            'source_type' => 'bangumi_subject',
            'source_id' => $id,
            'title' => $item['name'] ?? '',
            'title_cn' => $item['name_cn'] ?? '',
            'subtitle' => $item['air_date'] ?? '',
            'image_url' => voteSourceImage($item),
            'summary' => function_exists('mb_substr') ? mb_substr($item['summary'] ?? '', 0, 240) : substr($item['summary'] ?? '', 0, 240),
            'external_url' => $id !== '' ? 'https://bgm.tv/subject/' . $id : '',
        ];
    }
    return $rows;
}

function voteBangumiCharacters(string $keyword, int $limit): array {
    $data = voteSourceRequest(
        'POST',
        'https://api.bgm.tv/v0/search/characters?limit=' . $limit,
        ['keyword' => $keyword],
        'bgm_character_' . md5(voteLower($keyword) . '_' . $limit),
        3600
    );
    $rows = [];
    foreach (($data['data'] ?? []) as $item) {
        if (!is_array($item)) continue;
        $id = (string)($item['id'] ?? '');
        $rows[] = [
            'source_type' => 'bangumi_character',
            'source_id' => $id,
            'title' => $item['name'] ?? '',
            'title_cn' => $item['name_cn'] ?? '',
            'subtitle' => $item['relation'] ?? '',
            'image_url' => voteSourceImage($item),
            'summary' => function_exists('mb_substr') ? mb_substr($item['summary'] ?? '', 0, 240) : substr($item['summary'] ?? '', 0, 240),
            'external_url' => $id !== '' ? 'https://bgm.tv/character/' . $id : '',
        ];
    }
    return $rows;
}

function voteVndbWorks(string $keyword, int $limit): array {
    $data = voteSourceRequest(
        'POST',
        'https://api.vndb.org/kana/vn',
        [
            'filters' => ['search', '=', $keyword],
            'fields' => 'title, aliases, image.url, released, developers.name, description',
            'sort' => 'searchrank',
            'results' => $limit,
        ],
        'vndb_vn_' . md5(voteLower($keyword) . '_' . $limit),
        3600
    );
    $rows = [];
    foreach (($data['results'] ?? []) as $item) {
        if (!is_array($item)) continue;
        $id = (string)($item['id'] ?? '');
        $developers = $item['developers'] ?? [];
        $rows[] = [
            'source_type' => 'vndb_vn',
            'source_id' => $id,
            'title' => $item['title'] ?? '',
            'title_cn' => '',
            'subtitle' => implode(' / ', array_slice(array_map(fn($dev) => $dev['name'] ?? '', is_array($developers) ? $developers : []), 0, 2)),
            'image_url' => voteSourceImage($item),
            'summary' => function_exists('mb_substr') ? mb_substr($item['description'] ?? '', 0, 240) : substr($item['description'] ?? '', 0, 240),
            'external_url' => $id !== '' ? 'https://vndb.org/' . $id : '',
        ];
    }
    return $rows;
}

function voteManualSource(string $keyword, string $projectType): array {
    return [[
        'source_type' => 'manual',
        'source_id' => '',
        'title' => $keyword,
        'title_cn' => $keyword,
        'subtitle' => $projectType === 'moe' ? '手动角色提名' : '手动作品提名',
        'image_url' => '',
        'summary' => '',
        'external_url' => '',
    ]];
}

if ($action !== 'search') {
    voteRespond(['success' => false, 'message' => '未知 action=' . $action], 400);
}
if ($keyword === '') {
    voteRespond(['success' => false, 'message' => '请输入搜索关键词'], 400);
}

$results = $projectType === 'moe'
    ? voteBangumiCharacters($keyword, $limit)
    : array_merge(voteBangumiSubjects($keyword, $limit), voteVndbWorks($keyword, max(1, (int)floor($limit / 2))));

voteRespond([
    'success' => true,
    'data' => array_merge($results, voteManualSource($keyword, $projectType)),
    'source_order' => $projectType === 'moe' ? ['bangumi', 'manual'] : ['bangumi', 'vndb', 'manual'],
]);
