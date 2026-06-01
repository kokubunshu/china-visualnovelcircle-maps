<?php
// api/club_moe_king.php - One Bangumi character "moe king" per club.

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/audit.php';
require_once __DIR__ . '/../includes/image_proxy_helper.php';

$action = $_GET['action'] ?? '';

function ensureMoeKingTable(PDO $db): void {
    $driver = $db->getAttribute(PDO::ATTR_DRIVER_NAME);
    if ($driver === 'sqlite') {
        $db->exec("
            CREATE TABLE IF NOT EXISTS club_moe_kings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                club_id INTEGER NOT NULL,
                country TEXT DEFAULT 'china',
                character_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                name_cn TEXT DEFAULT '',
                image_url TEXT DEFAULT '',
                summary TEXT DEFAULT '',
                updated_by INTEGER NOT NULL REFERENCES users(id),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(club_id, country)
            )
        ");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_moe_kings_club ON club_moe_kings(club_id, country)");
    } else {
        $db->exec("
            CREATE TABLE IF NOT EXISTS club_moe_kings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                club_id INT NOT NULL,
                country VARCHAR(20) DEFAULT 'china',
                character_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                name_cn VARCHAR(255) DEFAULT '',
                image_url VARCHAR(500) DEFAULT '',
                summary TEXT,
                updated_by INT NOT NULL,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uk_moe_king_club (club_id, country),
                FOREIGN KEY (updated_by) REFERENCES users(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
    }
}

function canManageMoeKing(array $user, int $clubId, string $country): bool {
    return canManageClubInCountry($user, $clubId, $country);
}

try {
    $db = getDB();
    ensureMoeKingTable($db);

    if ($action === 'get') {
        $clubId = (int)($_GET['club_id'] ?? 0);
        $country = $_GET['country'] ?? 'china';
        if (!$clubId) {
            echo json_encode(['success' => false, 'message' => '无效的同好会 ID']);
            exit();
        }
        $stmt = $db->prepare("SELECT * FROM club_moe_kings WHERE club_id = ? AND country = ? LIMIT 1");
        $stmt->execute([$clubId, $country]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        if ($row) {
            $row['id'] = (int)$row['id'];
            $row['club_id'] = (int)$row['club_id'];
            $row['character_id'] = (int)$row['character_id'];
            $row['image_url'] = proxyImageUrl($row['image_url'] ?? '');
        }
        echo json_encode(['success' => true, 'data' => $row], JSON_UNESCAPED_UNICODE);
        exit();
    }

    if ($action === 'set') {
        $user = requireLogin();
        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input)) {
            echo json_encode(['success' => false, 'message' => '请求数据格式错误']);
            exit();
        }
        $clubId = (int)($input['club_id'] ?? 0);
        $country = $input['country'] ?? 'china';
        $characterId = (int)($input['character_id'] ?? 0);
        $name = trim((string)($input['name'] ?? ''));
        $nameCn = trim((string)($input['name_cn'] ?? ''));
        $imageUrl = trim((string)($input['image_url'] ?? ''));
        $summary = trim((string)($input['summary'] ?? ''));
        if (!$clubId || !$characterId || $name === '') {
            echo json_encode(['success' => false, 'message' => '角色信息不完整']);
            exit();
        }
        if (!canManageMoeKing($user, $clubId, $country)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => '权限不足']);
            exit();
        }
        $driver = $db->getAttribute(PDO::ATTR_DRIVER_NAME);
        if ($driver === 'sqlite') {
            $stmt = $db->prepare("
                INSERT INTO club_moe_kings (club_id, country, character_id, name, name_cn, image_url, summary, updated_by, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(club_id, country) DO UPDATE SET
                    character_id = excluded.character_id,
                    name = excluded.name,
                    name_cn = excluded.name_cn,
                    image_url = excluded.image_url,
                    summary = excluded.summary,
                    updated_by = excluded.updated_by,
                    updated_at = datetime('now')
            ");
        } else {
            $stmt = $db->prepare("
                INSERT INTO club_moe_kings (club_id, country, character_id, name, name_cn, image_url, summary, updated_by, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON DUPLICATE KEY UPDATE
                    character_id = VALUES(character_id),
                    name = VALUES(name),
                    name_cn = VALUES(name_cn),
                    image_url = VALUES(image_url),
                    summary = VALUES(summary),
                    updated_by = VALUES(updated_by),
                    updated_at = CURRENT_TIMESTAMP
            ");
        }
        $stmt->execute([$clubId, $country, $characterId, $name, $nameCn, $imageUrl, $summary, $user['id']]);
        logAction('club_moe_king.set', 'club_moe_kings', $clubId, ['country' => $country, 'character_id' => $characterId]);
        echo json_encode(['success' => true, 'message' => '萌王已更新'], JSON_UNESCAPED_UNICODE);
        exit();
    }

    if ($action === 'remove') {
        $user = requireLogin();
        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input)) $input = [];
        $clubId = (int)($input['club_id'] ?? 0);
        $country = $input['country'] ?? 'china';
        if (!$clubId) {
            echo json_encode(['success' => false, 'message' => '无效的同好会 ID']);
            exit();
        }
        if (!canManageMoeKing($user, $clubId, $country)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => '权限不足']);
            exit();
        }
        $stmt = $db->prepare("DELETE FROM club_moe_kings WHERE club_id = ? AND country = ?");
        $stmt->execute([$clubId, $country]);
        logAction('club_moe_king.remove', 'club_moe_kings', $clubId, ['country' => $country]);
        echo json_encode(['success' => true, 'message' => '萌王已移除'], JSON_UNESCAPED_UNICODE);
        exit();
    }

    echo json_encode(['success' => false, 'message' => '未知操作 action=' . $action]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '服务器错误', 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
