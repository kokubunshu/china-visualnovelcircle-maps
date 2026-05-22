<?php
// api/star_unions.php - 联合星图 API
// 动作: list, get, create, update, delete, add_club, remove_club, my_unions

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/audit.php';

$action = $_GET['action'] ?? '';

function getClubName($clubId, $country = 'china') {
    $file = $country === 'japan'
        ? __DIR__ . '/../data/clubs_japan.json'
        : __DIR__ . '/../data/clubs.json';
    if (!file_exists($file)) return '同好会#' . $clubId;
    $json = json_decode(file_get_contents($file), true);
    if (!is_array($json)) return '同好会#' . $clubId;
    foreach (($json['data'] ?? []) as $club) {
        if (($club['id'] ?? 0) == $clubId) {
            return $club['name'] ?? $club['display_name'] ?? '同好会#' . $clubId;
        }
    }
    return '同好会#' . $clubId;
}

function getClubSchool($clubId, $country = 'china') {
    $file = $country === 'japan'
        ? __DIR__ . '/../data/clubs_japan.json'
        : __DIR__ . '/../data/clubs.json';
    if (!file_exists($file)) return '';
    $json = json_decode(file_get_contents($file), true);
    if (!is_array($json)) return '';
    foreach (($json['data'] ?? []) as $club) {
        if (($club['id'] ?? 0) == $clubId) {
            return $club['school'] ?? '';
        }
    }
    return '';
}

function getClubProvince($clubId, $country = 'china') {
    $file = $country === 'japan'
        ? __DIR__ . '/../data/clubs_japan.json'
        : __DIR__ . '/../data/clubs.json';
    if (!file_exists($file)) return '';
    $json = json_decode(file_get_contents($file), true);
    if (!is_array($json)) return '';
    foreach (($json['data'] ?? []) as $club) {
        if (($club['id'] ?? 0) == $clubId) {
            return $club['province'] ?? $club['prefecture'] ?? '';
        }
    }
    return '';
}

function canManageUnion(array $user, array $union): bool {
    if ($user['role'] === 'super_admin') return true;
    return (int)$user['id'] === (int)$union['created_by'];
}

function readJsonBody(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

switch ($action) {
    case 'list':
        $db = getDB();
        $country = $_GET['country'] ?? '';
        if ($country) {
            $stmt = $db->prepare('SELECT * FROM star_unions WHERE country = ? ORDER BY created_at DESC');
            $stmt->execute([$country]);
        } else {
            $stmt = $db->query('SELECT * FROM star_unions ORDER BY created_at DESC');
        }
        $unions = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $user = getCurrentUser();
        foreach ($unions as &$u) {
            $cnt = $db->prepare('SELECT COUNT(*) FROM star_union_members WHERE union_id = ?');
            $cnt->execute([$u['id']]);
            $u['member_count'] = (int)$cnt->fetchColumn();
            $u['can_manage'] = $user ? canManageUnion($user, $u) : false;
        }
        echo json_encode(['success' => true, 'unions' => $unions]);
        break;

    case 'get':
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) { echo json_encode(['success' => false, 'message' => '缺少联合ID']); break; }
        $db = getDB();
        $stmt = $db->prepare('SELECT * FROM star_unions WHERE id = ?');
        $stmt->execute([$id]);
        $union = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$union) { echo json_encode(['success' => false, 'message' => '联合不存在']); break; }

        $mStmt = $db->prepare('SELECT * FROM star_union_members WHERE union_id = ? ORDER BY added_at ASC');
        $mStmt->execute([$id]);
        $members = $mStmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($members as &$m) {
            $m['club_name'] = getClubName($m['club_id'], $m['club_country']);
            $m['club_school'] = getClubSchool($m['club_id'], $m['club_country']);
            $m['club_province'] = getClubProvince($m['club_id'], $m['club_country']);
        }

        $user = getCurrentUser();
        $union['can_manage'] = $user ? canManageUnion($user, $union) : false;

        // Resolve bound club name
        if (!empty($union['bound_club_id'])) {
            $union['bound_club_name'] = getClubName($union['bound_club_id'], $union['bound_club_country'] ?? 'china');
            $union['bound_club_school'] = getClubSchool($union['bound_club_id'], $union['bound_club_country'] ?? 'china');
        }

        echo json_encode(['success' => true, 'union' => $union, 'members' => $members]);
        break;

    case 'create':
        $user = requireLogin();
        $data = readJsonBody();
        $name = trim($data['name'] ?? '');
        if ($name === '') { echo json_encode(['success' => false, 'message' => '联合名称不能为空']); break; }
        if (mb_strlen($name) > 100) { echo json_encode(['success' => false, 'message' => '联合名称不能超过100个字符']); break; }

        $db = getDB();
        $stmt = $db->prepare('INSERT INTO star_unions (name, description, region, country, created_by, bound_club_id, bound_club_country, star_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $name,
            trim($data['description'] ?? ''),
            trim($data['region'] ?? ''),
            trim($data['country'] ?? 'china'),
            $user['id'],
            !empty($data['bound_club_id']) ? (int)$data['bound_club_id'] : null,
            trim($data['bound_club_country'] ?? 'china'),
            trim($data['star_color'] ?? '#f0c060')
        ]);
        $newId = (int)$db->lastInsertId();
        logAction('star_union.create', 'star_union', $newId, ['name' => $name]);
        echo json_encode(['success' => true, 'union' => ['id' => $newId, 'name' => $name, 'created_by' => $user['id']]]);
        break;

    case 'update':
        $user = requireLogin();
        $data = readJsonBody();
        $id = (int)($data['id'] ?? 0);
        if (!$id) { echo json_encode(['success' => false, 'message' => '缺少联合ID']); break; }

        $db = getDB();
        $stmt = $db->prepare('SELECT * FROM star_unions WHERE id = ?');
        $stmt->execute([$id]);
        $union = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$union) { echo json_encode(['success' => false, 'message' => '联合不存在']); break; }
        if (!canManageUnion($user, $union)) { echo json_encode(['success' => false, 'message' => '无权限编辑此联合']); break; }

        $name = trim($data['name'] ?? $union['name']);
        if ($name === '') { echo json_encode(['success' => false, 'message' => '联合名称不能为空']); break; }

        $upd = $db->prepare('UPDATE star_unions SET name = ?, description = ?, region = ?, bound_club_id = ?, bound_club_country = ?, star_color = ? WHERE id = ?');
        $upd->execute([
            $name,
            trim($data['description'] ?? $union['description']),
            trim($data['region'] ?? $union['region']),
            array_key_exists('bound_club_id', $data) ? (!empty($data['bound_club_id']) ? (int)$data['bound_club_id'] : null) : ($union['bound_club_id'] ?? null),
            trim($data['bound_club_country'] ?? $union['bound_club_country'] ?? 'china'),
            trim($data['star_color'] ?? $union['star_color'] ?? '#f0c060'),
            $id
        ]);
        logAction('star_union.update', 'star_union', $id, ['name' => $name]);
        echo json_encode(['success' => true, 'message' => '已更新']);
        break;

    case 'delete':
        $user = requireLogin();
        $data = readJsonBody();
        $id = (int)($data['id'] ?? 0);
        if (!$id) { echo json_encode(['success' => false, 'message' => '缺少联合ID']); break; }

        $db = getDB();
        $stmt = $db->prepare('SELECT * FROM star_unions WHERE id = ?');
        $stmt->execute([$id]);
        $union = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$union) { echo json_encode(['success' => false, 'message' => '联合不存在']); break; }
        if (!canManageUnion($user, $union)) { echo json_encode(['success' => false, 'message' => '无权限删除此联合']); break; }

        $db->prepare('DELETE FROM star_union_members WHERE union_id = ?')->execute([$id]);
        $db->prepare('DELETE FROM star_unions WHERE id = ?')->execute([$id]);
        logAction('star_union.delete', 'star_union', $id, ['name' => $union['name']]);
        echo json_encode(['success' => true, 'message' => '已删除']);
        break;

    case 'add_club':
        $user = requireLogin();
        $data = readJsonBody();
        $unionId = (int)($data['union_id'] ?? 0);
        $clubId = (int)($data['club_id'] ?? 0);
        $clubCountry = trim($data['club_country'] ?? 'china');
        if (!$unionId || !$clubId) { echo json_encode(['success' => false, 'message' => '缺少参数']); break; }

        $db = getDB();
        $stmt = $db->prepare('SELECT * FROM star_unions WHERE id = ?');
        $stmt->execute([$unionId]);
        $union = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$union) { echo json_encode(['success' => false, 'message' => '联合不存在']); break; }
        if (!canManageUnion($user, $union)) { echo json_encode(['success' => false, 'message' => '无权限操作']); break; }

        // 检查同好会是否存在于 JSON 数据中
        $clubName = getClubName($clubId, $clubCountry);
        if (strpos($clubName, '同好会#') === 0) { echo json_encode(['success' => false, 'message' => '同好会不存在']); break; }

        // 插入（UNIQUE 约束防重复）
        try {
            $ins = $db->prepare('INSERT INTO star_union_members (union_id, club_id, club_country, added_by) VALUES (?, ?, ?, ?)');
            $ins->execute([$unionId, $clubId, $clubCountry, $user['id']]);
        } catch (PDOException $e) {
            if (strpos($e->getMessage(), 'UNIQUE') !== false || strpos($e->getMessage(), 'unique') !== false) {
                echo json_encode(['success' => false, 'message' => '该同好会已在联合中']);
                break;
            }
            throw $e;
        }
        logAction('star_union.add_club', 'star_union', $unionId, ['club_id' => $clubId, 'club_name' => $clubName]);
        echo json_encode(['success' => true, 'message' => '已添加同好会', 'club_name' => $clubName]);
        break;

    case 'remove_club':
        $user = requireLogin();
        $data = readJsonBody();
        $unionId = (int)($data['union_id'] ?? 0);
        $clubId = (int)($data['club_id'] ?? 0);
        $clubCountry = trim($data['club_country'] ?? 'china');
        if (!$unionId || !$clubId) { echo json_encode(['success' => false, 'message' => '缺少参数']); break; }

        $db = getDB();
        $stmt = $db->prepare('SELECT * FROM star_unions WHERE id = ?');
        $stmt->execute([$unionId]);
        $union = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$union) { echo json_encode(['success' => false, 'message' => '联合不存在']); break; }
        if (!canManageUnion($user, $union)) { echo json_encode(['success' => false, 'message' => '无权限操作']); break; }

        $del = $db->prepare('DELETE FROM star_union_members WHERE union_id = ? AND club_id = ? AND club_country = ?');
        $del->execute([$unionId, $clubId, $clubCountry]);
        echo json_encode(['success' => true, 'message' => '已移除同好会']);
        break;

    case 'my_unions':
        $user = requireLogin();
        $db = getDB();
        $stmt = $db->prepare('SELECT * FROM star_unions WHERE created_by = ? ORDER BY created_at DESC');
        $stmt->execute([$user['id']]);
        $unions = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($unions as &$u) {
            $cnt = $db->prepare('SELECT COUNT(*) FROM star_union_members WHERE union_id = ?');
            $cnt->execute([$u['id']]);
            $u['member_count'] = (int)$cnt->fetchColumn();
        }
        echo json_encode(['success' => true, 'unions' => $unions]);
        break;

    default:
        echo json_encode(['success' => false, 'message' => '未知操作']);
}
