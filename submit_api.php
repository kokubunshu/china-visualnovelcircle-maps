<?php
// submit_api.php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

// 保存提交的文件
$submissions_file = './submissions.json';

// 获取 POST 数据
$input = json_decode(file_get_contents('php://input'), true);

if (!$input) {
    echo json_encode(['success' => false, 'message' => '无效的数据']);
    exit;
}

// 读取已有提交记录
$submissions = [];
if (file_exists($submissions_file)) {
    $submissions = json_decode(file_get_contents($submissions_file), true);
}

// 添加新记录
$input['id'] = count($submissions) + 1;
$input['status'] = 'pending';
$input['submitted_at'] = date('Y-m-d H:i:s');
$submissions[] = $input;

// 保存
file_put_contents($submissions_file, json_encode($submissions, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

// 可选：发送邮件通知
// mail('你的邮箱@example.com', '新的同好会提交', json_encode($input, JSON_UNESCAPED_UNICODE));

echo json_encode(['success' => true, 'message' => '提交成功']);
?>