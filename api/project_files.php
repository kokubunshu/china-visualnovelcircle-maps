<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/../includes/project_hub.php';

$root = realpath(__DIR__ . '/..');
$uploadRoot = $root . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'project_files';
$method = $_SERVER['REQUEST_METHOD'];
$allowed = [
    'pdf' => 'application/pdf',
    'png' => 'image/png',
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'gif' => 'image/gif',
    'webp' => 'image/webp',
    'doc' => 'application/msword',
    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'txt' => 'text/plain',
];

function projectFileSafePath(string $relative, string $uploadRoot): ?string {
    $relative = ltrim(str_replace(['\\', "\0"], ['/', ''], $relative), '/');
    if ($relative === '' || str_contains($relative, '..')) {
        return null;
    }
    $path = $uploadRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
    $dir = realpath(dirname($path));
    $base = realpath($uploadRoot);
    if (!$dir || !$base || strncmp($dir, $base, strlen($base)) !== 0) {
        return null;
    }
    return $path;
}

if ($method === 'GET') {
    $file = projectHubCleanString($_GET['file'] ?? '', 500);
    $path = projectFileSafePath($file, $uploadRoot);
    if (!$path || !is_file($path)) {
        http_response_code(404);
        exit('Not found');
    }
    $name = basename($path);
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="' . rawurlencode($name) . '"');
    header('Content-Length: ' . filesize($path));
    readfile($path);
    exit();
}

$authUser = requireLogin();

if ($method === 'POST') {
    if (empty($_FILES['file']) || !is_uploaded_file($_FILES['file']['tmp_name'])) {
        projectHubRespond(['success' => false, 'message' => '请选择文件'], 400);
    }
    if ((int)$_FILES['file']['size'] > 50 * 1024 * 1024) {
        projectHubRespond(['success' => false, 'message' => '文件不能超过 50MB'], 400);
    }
    $projectId = max(0, (int)($_POST['project_id'] ?? 0));
    $ext = strtolower(pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION));
    if (!isset($allowed[$ext])) {
        projectHubRespond(['success' => false, 'message' => '不支持的文件类型'], 400);
    }
    $projectDir = $uploadRoot . DIRECTORY_SEPARATOR . ($projectId > 0 ? $projectId : 'general');
    if (!is_dir($projectDir)) {
        mkdir($projectDir, 0755, true);
    }
    $safeName = date('YmdHis') . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
    $dest = $projectDir . DIRECTORY_SEPARATOR . $safeName;
    if (!move_uploaded_file($_FILES['file']['tmp_name'], $dest)) {
        projectHubRespond(['success' => false, 'message' => '保存失败'], 500);
    }
    $relative = 'uploads/project_files/' . ($projectId > 0 ? $projectId : 'general') . '/' . $safeName;
    projectHubRespond([
        'success' => true,
        'file' => [
            'name' => $_FILES['file']['name'],
            'url' => $relative,
            'download_url' => './api/project_files.php?file=' . rawurlencode(($projectId > 0 ? $projectId : 'general') . '/' . $safeName),
            'size' => (int)$_FILES['file']['size'],
            'uploaded_by' => (int)$authUser['id'],
            'created_at' => projectHubNow(),
        ],
    ]);
}

if ($method === 'DELETE') {
    $input = projectHubInput();
    $file = projectHubCleanString($input['file'] ?? $_GET['file'] ?? '', 500);
    $path = projectFileSafePath($file, $uploadRoot);
    if (!$path || !is_file($path)) {
        projectHubRespond(['success' => false, 'message' => '文件不存在'], 404);
    }
    unlink($path);
    projectHubRespond(['success' => true, 'message' => '文件已删除']);
}

projectHubRespond(['success' => false, 'message' => '不支持的请求方法'], 405);
