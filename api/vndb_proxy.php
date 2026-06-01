<?php
// api/vndb_proxy.php - VNDB Kana API proxy for visual novel search.

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$action = $_GET['action'] ?? '';
$cacheDir = __DIR__ . '/../data/cache/vndb';
if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0755, true);
}

function vndbRequest(array $payload, string $cacheKey, int $ttl): array {
    $cacheDir = __DIR__ . '/../data/cache/vndb';
    $cacheFile = $cacheDir . '/' . $cacheKey . '.json';
    if (file_exists($cacheFile) && time() - filemtime($cacheFile) < $ttl) {
        return json_decode(file_get_contents($cacheFile), true) ?: [];
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'timeout' => 12,
            'header' => "Content-Type: application/json\r\nUser-Agent: VNFest/1.0\r\n",
            'content' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ],
    ]);
    $response = @file_get_contents('https://api.vndb.org/kana/vn', false, $context);
    if ($response === false) {
        if (file_exists($cacheFile)) {
            return json_decode(file_get_contents($cacheFile), true) ?: [];
        }
        return [];
    }
    $data = json_decode($response, true) ?: [];
    file_put_contents($cacheFile, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    return $data;
}

function vndbNormalize(array $item): array {
    $image = $item['image'] ?? [];
    $developers = $item['developers'] ?? [];
    $developerNames = [];
    foreach ($developers as $developer) {
        if (is_array($developer) && !empty($developer['name'])) {
            $developerNames[] = $developer['name'];
        }
    }
    return [
        'vndb_id' => $item['id'] ?? '',
        'title' => $item['title'] ?? '',
        'title_alias' => implode(' / ', array_slice($item['aliases'] ?? [], 0, 3)),
        'brand' => implode(' / ', array_slice($developerNames, 0, 2)),
        'release_year' => !empty($item['released']) ? substr((string)$item['released'], 0, 4) : '',
        'cover_url' => is_array($image) ? ($image['url'] ?? '') : '',
        'summary' => function_exists('mb_substr') ? mb_substr($item['description'] ?? '', 0, 240) : substr($item['description'] ?? '', 0, 240),
        'external_url' => !empty($item['id']) ? 'https://vndb.org/' . $item['id'] : '',
    ];
}

if ($action === 'search' || $action === 'search_vn') {
    $keyword = trim($_GET['keyword'] ?? '');
    $limit = max(1, min(20, (int)($_GET['limit'] ?? 10)));
    if ($keyword === '') {
        echo json_encode(['success' => false, 'message' => '请输入 VNDB 搜索关键词'], JSON_UNESCAPED_UNICODE);
        exit();
    }
    $payload = [
        'filters' => ['search', '=', $keyword],
        'fields' => 'id,title,aliases,released,image.url,description,developers.name',
        'sort' => 'searchrank',
        'results' => $limit,
    ];
    $data = vndbRequest($payload, 'search_' . md5(twelveLowerForProxy($keyword) . '_' . $limit), 3600);
    $results = [];
    foreach ($data['results'] ?? [] as $item) {
        if (is_array($item)) {
            $results[] = vndbNormalize($item);
        }
    }
    echo json_encode(['success' => true, 'data' => $results], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit();
}

function twelveLowerForProxy(string $value): string {
    return function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
}

echo json_encode(['success' => false, 'message' => '未知操作 action=' . $action], JSON_UNESCAPED_UNICODE);
