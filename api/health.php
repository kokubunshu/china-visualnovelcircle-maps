<?php
// api/health.php — 服务器健康检查端点
// 用于监控和部署验证，返回服务器及应用状态
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Cache-Control: no-store, no-cache, must-revalidate');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$startTime = microtime(true);
$status = 'ok';
$checks = [];

// 1. PHP 版本
$checks['php_version'] = PHP_VERSION;
$checks['php_sapi'] = PHP_SAPI;

// 2. 配置文件
$configExists = file_exists(__DIR__ . '/../config.php');
$checks['config_exists'] = $configExists;
if ($configExists) {
    require_once __DIR__ . '/../config.php';
    $checks['db_driver'] = defined('DB_DRIVER') ? DB_DRIVER : 'unknown';
    $checks['site_url'] = defined('SITE_URL') ? SITE_URL : 'unknown';
}

// 3. 数据库连接
try {
    require_once __DIR__ . '/../includes/db.php';
    $db = getDB();
    $db->query('SELECT 1');
    $checks['database'] = 'connected';
} catch (Exception $e) {
    $checks['database'] = 'error: ' . $e->getMessage();
    $status = 'degraded';
}

// 4. 关键文件完整性
$criticalFiles = [
    'index.html',
    'includes/auth.php',
    'includes/db.php',
    'api/galonly.php',
];
$missingFiles = [];
foreach ($criticalFiles as $f) {
    if (!file_exists(__DIR__ . '/../' . $f)) {
        $missingFiles[] = $f;
    }
}
$checks['file_integrity'] = empty($missingFiles) ? 'complete' : 'missing: ' . implode(', ', $missingFiles);
if (!empty($missingFiles)) $status = 'degraded';

// 5. 可写目录
$writableDirs = ['data', 'uploads'];
$unwritable = [];
foreach ($writableDirs as $d) {
    $path = __DIR__ . '/../' . $d;
    if (!is_dir($path) || !is_writable($path)) {
        $unwritable[] = $d;
    }
}
$checks['writable_dirs'] = empty($unwritable) ? 'ok' : 'unwritable: ' . implode(', ', $unwritable);
if (!empty($unwritable)) $status = 'degraded';

// 6. data JSON 文件状态
$dataFiles = glob(__DIR__ . '/../data/*.json');
$checks['data_files_count'] = count($dataFiles);

// 7. Git 版本
$gitHash = trim((string)@shell_exec('git -C ' . escapeshellarg(__DIR__ . '/..') . ' rev-parse --short HEAD 2>/dev/null') ?: '');
$gitBranch = trim((string)@shell_exec('git -C ' . escapeshellarg(__DIR__ . '/..') . ' rev-parse --abbrev-ref HEAD 2>/dev/null') ?: '');
$checks['git_commit'] = $gitHash ?: 'unknown';
$checks['git_branch'] = $gitBranch ?: 'unknown';

// 8. 响应时间
$elapsed = (microtime(true) - $startTime) * 1000;
$checks['response_time_ms'] = round($elapsed, 1);

// 9. 磁盘使用（只检查当前分区）
$dataPath = __DIR__ . '/../data';
if (function_exists('disk_free_space') && function_exists('disk_total_space')) {
    $free = @disk_free_space($dataPath);
    $total = @disk_total_space($dataPath);
    if ($total > 0) {
        $checks['disk_usage_percent'] = round((1 - $free / $total) * 100, 1);
        $checks['disk_free_gb'] = round($free / 1073741824, 1);
    }
}

$httpCode = ($status === 'ok') ? 200 : 503;
http_response_code($httpCode);

echo json_encode([
    'status' => $status,
    'timestamp' => date('c'),
    'checks' => $checks,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
