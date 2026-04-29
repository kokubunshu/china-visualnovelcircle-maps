<?php
// api_save.php - 用于保存同好会数据
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Admin-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$dataFile = __DIR__ . '/galgame_clubs.json';
$adminToken = 'admin123456';

function getAdminToken() {
    $headers = getallheaders();
    return $headers['X-Admin-Token'] ?? '';
}

function getData() {
    global $dataFile;
    if (!file_exists($dataFile)) {
        return ['success' => true, 'total' => 0, 'data' => []];
    }
    $content = file_get_contents($dataFile);
    $data = json_decode($content, true);
    if (!$data || !isset($data['data'])) {
        return ['success' => true, 'total' => 0, 'data' => []];
    }
    return $data;
}

function saveData($data) {
    global $dataFile;
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    return file_put_contents($dataFile, $json) !== false;
}

$method = $_SERVER['REQUEST_METHOD'];

// GET - 获取所有数据
if ($method === 'GET') {
    $result = getData();
    echo json_encode($result);
    exit();
}

// 以下操作需要管理员验证
$token = getAdminToken();
if ($token !== $adminToken) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => '未授权访问']);
    exit();
}

// POST - 添加新数据
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        echo json_encode(['success' => false, 'message' => '无效的数据']);
        exit();
    }
    
    $current = getData();
    $rows = $current['data'] ?? [];
    
    // 生成新 ID
    $maxId = 0;
    foreach ($rows as $item) {
        if (($item['id'] ?? 0) > $maxId) $maxId = $item['id'];
    }
    $input['id'] = $maxId + 1;
    $input['created_at'] = date('Y-m-d H:i:s');
    $input['raw_text'] = $input['name'] . ' ' . ($input['info'] ?? '');
    $input['project'] = 'galgame';
    
    $rows[] = $input;
    
    $result = [
        'success' => true,
        'total' => count($rows),
        'data' => $rows
    ];
    
    if (saveData($result)) {
        echo json_encode(['success' => true, 'message' => '添加成功', 'data' => $input]);
    } else {
        echo json_encode(['success' => false, 'message' => '保存失败，请检查文件权限']);
    }
    exit();
}

// PUT - 更新数据
if ($method === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['id'])) {
        echo json_encode(['success' => false, 'message' => '无效的数据']);
        exit();
    }
    
    $current = getData();
    $rows = $current['data'] ?? [];
    $updated = false;
    
    foreach ($rows as $i => $item) {
        if ($item['id'] == $input['id']) {
            $input['raw_text'] = $input['name'] . ' ' . ($input['info'] ?? '');
            $rows[$i] = array_merge($item, $input);
            $updated = true;
            break;
        }
    }
    
    if (!$updated) {
        echo json_encode(['success' => false, 'message' => '未找到要更新的数据']);
        exit();
    }
    
    $result = [
        'success' => true,
        'total' => count($rows),
        'data' => $rows
    ];
    
    if (saveData($result)) {
        echo json_encode(['success' => true, 'message' => '更新成功']);
    } else {
        echo json_encode(['success' => false, 'message' => '保存失败，请检查文件权限']);
    }
    exit();
}

// DELETE - 删除数据
if ($method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['id'])) {
        echo json_encode(['success' => false, 'message' => '无效的数据']);
        exit();
    }
    
    $current = getData();
    $rows = $current['data'] ?? [];
    $newRows = [];
    $deleted = false;
    
    foreach ($rows as $item) {
        if ($item['id'] != $input['id']) {
            $newRows[] = $item;
        } else {
            $deleted = true;
        }
    }
    
    if (!$deleted) {
        echo json_encode(['success' => false, 'message' => '未找到要删除的数据']);
        exit();
    }
    
    $result = [
        'success' => true,
        'total' => count($newRows),
        'data' => $newRows
    ];
    
    if (saveData($result)) {
        echo json_encode(['success' => true, 'message' => '删除成功']);
    } else {
        echo json_encode(['success' => false, 'message' => '保存失败，请检查文件权限']);
    }
    exit();
}

echo json_encode(['success' => false, 'message' => '不支持的请求方法']);
?>