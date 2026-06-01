<?php
require_once __DIR__ . '/db.php';

const ROLE_HIERARCHY = [
    'visitor' => 0,
    'external' => 0.5,
    'member' => 1,
    'manager' => 2,
    'representative' => 3,
    'super_admin' => 4,
];

function initSession(): void {
    if (session_status() === PHP_SESSION_NONE) {
        ini_set('session.cookie_httponly', '1');
        ini_set('session.cookie_samesite', 'Lax');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.use_strict_mode', '1');
        if (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') {
            ini_set('session.cookie_secure', '1');
        }
        session_start();
    }
}

function getCurrentUser(): ?array {
    initSession();
    if (!isset($_SESSION['user_id'])) {
        return null;
    }

    $db = getDB();
    try {
        $stmt = $db->prepare(
            'SELECT u.id, u.username, u.nickname, u.avatar_url, u.role, u.status, u.email, u.email_verified_at, u.qq_openid, u.discord_id, u.is_audit, u.profile_bio
             FROM users u
             WHERE u.id = ? AND u.status = \'active\''
        );
        $stmt->execute([$_SESSION['user_id']]);
        $user = $stmt->fetch();
    } catch (PDOException $e) {
        // profile_bio 列尚不存在（迁移未执行），回退到不带该列的查询
        $stmt = $db->prepare(
            'SELECT u.id, u.username, u.nickname, u.avatar_url, u.role, u.status, u.email, u.email_verified_at, u.qq_openid, u.discord_id, u.is_audit
             FROM users u
             WHERE u.id = ? AND u.status = \'active\''
        );
        $stmt->execute([$_SESSION['user_id']]);
        $user = $stmt->fetch();
        if ($user) {
            $user['profile_bio'] = '';
        }
    }

    if (!$user) {
        unset($_SESSION['user_id']);
        return null;
    }

    return $user;
}

function requireLogin(): array {
    $user = getCurrentUser();
    if (!$user) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => '请先登录', 'logged_in' => false]);
        exit();
    }
    return $user;
}

function requireRole(string $minRole): array {
    $user = requireLogin();
    $userLevel = ROLE_HIERARCHY[$user['role']] ?? 0;
    $requiredLevel = ROLE_HIERARCHY[$minRole] ?? 0;

    if ($userLevel < $requiredLevel) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => '权限不足']);
        exit();
    }
    return $user;
}

function requireAdmin(): array {
    initSession();

    // Try session-based auth first
    if (isset($_SESSION['user_id'])) {
        $user = getCurrentUser();
        if ($user && in_array($user['role'], ['manager', 'representative', 'super_admin'])) {
            return $user;
        }
        if ($user && hasAnyClubManagementRole($user)) {
            return $user;
        }
    }

    // Fallback to legacy token during transition
    if (defined('LEGACY_AUTH_ENABLED') && LEGACY_AUTH_ENABLED) {
        $headers = function_exists('getallheaders') ? getallheaders() : [];
        $token = $headers['X-Admin-Token'] ?? $headers['x-admin-token'] ?? '';
        if ($token === ADMIN_TOKEN) {
            return ['id' => 0, 'username' => 'legacy_admin', 'role' => 'super_admin', 'avatar_url' => ''];
        }
    }

    http_response_code(401);
    echo json_encode(['success' => false, 'message' => '未授权访问']);
    exit();
}

function hasAnyClubManagementRole(array $user): bool {
    $db = getDB();
    try {
        $stmt = $db->prepare(
            "SELECT id FROM club_memberships
             WHERE user_id = ?
               AND role IN ('representative', 'manager')
               AND status = 'active'
             LIMIT 1"
        );
        $stmt->execute([$user['id']]);
        return (bool)$stmt->fetch();
    } catch (Exception $e) {
        return false;
    }
}

function createSession(int $userId): void {
    initSession();
    session_regenerate_id(true);
    $_SESSION['user_id'] = $userId;

    $db = getDB();
    $db->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$userId]);

    $lifetime = defined('SESSION_LIFETIME') ? (int)SESSION_LIFETIME : 7200;
    $expiresAt = date('Y-m-d H:i:s', time() + $lifetime);

    $db->prepare(
        'INSERT INTO sessions (id, user_id, ip_address, user_agent, expires_at)
         VALUES (?, ?, ?, ?, ?)'
    )->execute([
        session_id(),
        $userId,
        $_SERVER['REMOTE_ADDR'] ?? '',
        $_SERVER['HTTP_USER_AGENT'] ?? '',
        $expiresAt,
    ]);
}

function destroySession(): void {
    initSession();
    if (isset($_SESSION['user_id'])) {
        $db = getDB();
        $db->prepare('UPDATE sessions SET is_valid = 0 WHERE id = ?')->execute([session_id()]);
    }
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
}

/**
 * 检查当前用户是否有权限管理指定俱乐部
 * 超级管理员拥有全局权限，负责人/管理员可管理所属俱乐部
 */
function canManageClub(array $user, int $clubId): bool {
    if ($user['role'] === 'super_admin') {
        return true;
    }
    $db = getDB();
    $stmt = $db->prepare(
        "SELECT id FROM club_memberships WHERE user_id = ? AND club_id = ? AND role IN ('representative', 'manager') AND status = 'active'"
    );
    $stmt->execute([$user['id'], $clubId]);
    return (bool)$stmt->fetch();
}

function canManageClubInCountry(array $user, int $clubId, string $country): bool {
    if ($user['role'] === 'super_admin') {
        return true;
    }
    $db = getDB();
    try {
        $stmt = $db->prepare(
            "SELECT id FROM club_memberships
             WHERE user_id = ?
               AND club_id = ?
               AND country = ?
               AND role IN ('representative', 'manager')
               AND status = 'active'"
        );
        $stmt->execute([$user['id'], $clubId, $country]);
        return (bool)$stmt->fetch();
    } catch (Exception $e) {
        return canManageClub($user, $clubId);
    }
}

function hasAuditPermission(array $user): bool {
    if ($user['role'] === 'super_admin') return true;
    return !empty($user['is_audit']);
}
