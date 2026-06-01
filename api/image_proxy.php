<?php
// api/image_proxy.php - Bangumi 图片服务端代理
// 解决：lain.bgm.tv 旧路径 /pic/cover/ 只支持 HTTP，
//       但现代浏览器在 HTTPS 页面上自动升级 HTTP 图片为 HTTPS 导致加载失败。
// 方案：服务端去抓 HTTP 图片，通过本站输出，完全绕过 CDN 限制。

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$url = $_GET['url'] ?? '';

// 安全校验：只允许 lain.bgm.tv 的图片（支持新旧两种路径格式）
// 旧格式: lain.bgm.tv/pic/cover/...
// 新格式: lain.bgm.tv/r/400/pic/crt/...
if (!preg_match('#^https?://lain\.bgm\.tv/(r/\d+/)?pic/#', $url)) {
    http_response_code(403);
    header('Content-Type: text/plain');
    echo 'invalid url';
    exit();
}

// 缓存目录
$cacheDir = __DIR__ . '/../data/cache/images';
if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0755, true);
}

$cacheFile = $cacheDir . '/' . md5($url) . '.img';

// 缓存命中（24小时）
if (file_exists($cacheFile) && time() - filemtime($cacheFile) < 86400) {
    $img = file_get_contents($cacheFile);
    if ($img !== false && strlen($img) > 0) {
        outputImage($img, $cacheFile);
        exit();
    }
}

// 服务端抓取图片（先原协议，失败换协议）
$opts = [
    'http' => [
        'method' => 'GET',
        'timeout' => 10,
        'user_agent' => 'VNFest/1.0 (https://map.vnfest.top; contact@vnfest.top)',
    ],
];

$context = stream_context_create($opts);

// 尝试原协议
$raw = @file_get_contents($url, false, $context);

// 失败则换协议重试
if ($raw === false || strlen($raw) === 0) {
    $altUrl = '';
    if (strncasecmp($url, 'https://', 8) === 0) {
        $altUrl = 'http://' . substr($url, 8);
    } elseif (strncasecmp($url, 'http://', 7) === 0) {
        $altUrl = 'https://' . substr($url, 7);
    }
    if ($altUrl !== '') {
        $raw = @file_get_contents($altUrl, false, $context);
    }
}

if ($raw === false || strlen($raw) === 0) {
    // 返回过期缓存兜底
    if (file_exists($cacheFile)) {
        $cached = file_get_contents($cacheFile);
        if ($cached !== false && strlen($cached) > 0) {
            outputImage($cached, $cacheFile);
            exit();
        }
    }
    http_response_code(404);
    header('Content-Type: text/plain');
    echo 'image not found';
    exit();
}

file_put_contents($cacheFile, $raw);
outputImage($raw, $cacheFile);

function outputImage(string $data, string $cacheFile): void {
    // 从缓存文件名推断 Content-Type
    $ext = '';
    if (preg_match('/\.(\w+)\.img$/', $cacheFile, $m)) {
        $ext = strtolower($m[1]);
    } else {
        // 从图片数据 magic bytes 推断
        $header = substr($data, 0, 8);
        if (strncmp($header, "\x89PNG", 4) === 0) $ext = 'png';
        elseif (strncmp($header, "\xFF\xD8\xFF", 3) === 0) $ext = 'jpg';
        elseif (strncmp($header, 'GIF', 3) === 0) $ext = 'gif';
        elseif (strncmp($header, 'RIFF', 4) === 0) $ext = 'webp';
    }

    $mimeTypes = [
        'jpg'  => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png'  => 'image/png',
        'gif'  => 'image/gif',
        'webp' => 'image/webp',
    ];

    $mime = $mimeTypes[$ext] ?? 'image/jpeg';

    header('Content-Type: ' . $mime);
    header('Content-Length: ' . strlen($data));
    header('Cache-Control: public, max-age=86400');
    header('ETag: "' . md5($data) . '"');

    // 条件请求
    if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH'], '"') === md5($data)) {
        http_response_code(304);
        exit();
    }

    echo $data;
}
