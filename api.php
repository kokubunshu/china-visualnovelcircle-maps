<?php
// api.php - 完整版（支持添加、更新、删除）
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Admin-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$dataFile = __DIR__ . '/galgame_clubs.json';
$adminToken = 'ciallo';

function checkAuth() {
    global $adminToken;
    $headers = getallheaders();
    $token = $headers['X-Admin-Token'] ?? '';
    return $token === $adminToken;
}

// GET - 读取数据
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (file_exists($dataFile)) {
        echo file_get_contents($dataFile);
    } else {
        echo json_encode(['success' => true, 'total' => 0, 'data' => []]);
    }
    exit();
}

// 以下需要验证
if (!checkAuth()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => '未授权访问']);
    exit();
}

// POST - 添加
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['name']) || !isset($input['province']) || !isset($input['info'])) {
        echo json_encode(['success' => false, 'message' => '缺少必填字段']);
        exit();
    }
    
    $current = json_decode(file_get_contents($dataFile), true);
    $rows = $current['data'] ?? [];
    
    $maxId = 0;
    foreach ($rows as $item) {
        if (($item['id'] ?? 0) > $maxId) $maxId = $item['id'];
    }
    
    $newItem = [
        'id' => $maxId + 1,
        'province' => $input['province'],
        'school' => $input['school'] ?? '',
        'name' => $input['name'],
        'display_name' => $input['name'],
        'info' => $input['info'],
        'type' => $input['type'] ?? 'school',
        'verified' => 1,
        'raw_text' => $input['name'] . ' ' . $input['info'],
        'created_at' => date('Y-m-d H:i:s'),
        'project' => 'galgame',
        'remark' => $input['remark'] ?? ''
    ];
    
    $rows[] = $newItem;
    $result = ['success' => true, 'total' => count($rows), 'data' => $rows];
    
    file_put_contents($dataFile, json_encode($result, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    echo json_encode(['success' => true, 'message' => '添加成功']);
    exit();
}

// PUT - 更新
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['id'])) {
        echo json_encode(['success' => false, 'message' => '无效数据']);
        exit();
    }
    
    $current = json_decode(file_get_contents($dataFile), true);
    $rows = $current['data'] ?? [];
    $updated = false;
    
    foreach ($rows as $i => $item) {
        if ($item['id'] == $input['id']) {
            $rows[$i]['province'] = $input['province'] ?? $item['province'];
            $rows[$i]['school'] = $input['school'] ?? $item['school'];
            $rows[$i]['name'] = $input['name'] ?? $item['name'];
            $rows[$i]['display_name'] = $input['name'] ?? $item['name'];
            $rows[$i]['info'] = $input['info'] ?? $item['info'];
            $rows[$i]['type'] = $input['type'] ?? $item['type'];
            $rows[$i]['raw_text'] = ($input['name'] ?? $item['name']) . ' ' . ($input['info'] ?? $item['info']);
            $rows[$i]['remark'] = $input['remark'] ?? $item['remark'];
            $updated = true;
            break;
        }
    }
    
    if (!$updated) {
        echo json_encode(['success' => false, 'message' => '未找到要更新的数据']);
        exit();
    }
    
    $result = ['success' => true, 'total' => count($rows), 'data' => $rows];
    file_put_contents($dataFile, json_encode($result, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    echo json_encode(['success' => true, 'message' => '更新成功']);
    exit();
}

// DELETE - 删除
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['id'])) {
        echo json_encode(['success' => false, 'message' => '无效数据']);
        exit();
    }
    
    $current = json_decode(file_get_contents($dataFile), true);
    $rows = $current['data'] ?? [];
    $newRows = [];
    
    foreach ($rows as $item) {
        if ($item['id'] != $input['id']) {
            $newRows[] = $item;
        }
    }
    
    $result = ['success' => true, 'total' => count($newRows), 'data' => $newRows];
    file_put_contents($dataFile, json_encode($result, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    echo json_encode(['success' => true, 'message' => '删除成功']);
    exit();
}

echo json_encode(['success' => false, 'message' => '不支持的请求方法']);
?>