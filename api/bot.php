<?php
// api/bot.php - private read-only aggregation API for AstrBot and other bots.

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// auto_approve and similar mutating actions bypass the GET-only check
$action = trim((string)($_GET['action'] ?? ''));
$isReadAction = !in_array($action, ['auto_approve'], true);
if ($isReadAction && $_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'GET only'], JSON_UNESCAPED_UNICODE);
    exit();
}

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/growth.php';
if (file_exists(__DIR__ . '/../includes/japan_prefectures.php')) {
    require_once __DIR__ . '/../includes/japan_prefectures.php';
}
require_once __DIR__ . '/../includes/image_proxy_helper.php';

function botRespond(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit();
}

function botTokenFromRequest(): string {
    $token = trim((string)($_GET['token'] ?? ''));
    if ($token !== '') {
        return $token;
    }
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $matches)) {
        return trim($matches[1]);
    }
    return '';
}

function botConfiguredToken(): string {
    if (defined('BOT_API_KEY') && trim((string)BOT_API_KEY) !== '') {
        return trim((string)BOT_API_KEY);
    }
    if (defined('LEGACY_AUTH_ENABLED') && LEGACY_AUTH_ENABLED && defined('ADMIN_TOKEN')) {
        return trim((string)ADMIN_TOKEN);
    }
    return '';
}

function authBot(): void {
    $expected = botConfiguredToken();
    if ($expected === '') {
        botRespond(['success' => false, 'error' => 'BOT_API_KEY 未配置'], 500);
    }
    $actual = botTokenFromRequest();
    $valid = function_exists('hash_equals') ? hash_equals($expected, $actual) : ($expected === $actual);
    if (!$valid) {
        botRespond(['success' => false, 'error' => '无效的 API 密钥'], 401);
    }
}

authBot();

function botLoadJson(string $path, array $fallback = []): array {
    if (!file_exists($path)) return $fallback;
    $data = json_decode((string)file_get_contents($path), true);
    return is_array($data) ? $data : $fallback;
}

function botRows(string $path, string $key): array {
    $data = botLoadJson($path, [$key => []]);
    $rows = $data[$key] ?? [];
    return is_array($rows) ? $rows : [];
}

function botString($value): string {
    return trim((string)($value ?? ''));
}

function botBoolParam(string $key): bool {
    $value = strtolower(trim((string)($_GET[$key] ?? '')));
    return in_array($value, ['1', 'true', 'yes', 'full'], true);
}

function botLimit(int $default = 20, int $max = 100): int {
    $limit = (int)($_GET['limit'] ?? $default);
    if ($limit < 1) return $default;
    return min($limit, $max);
}

function botQuery(): string {
    return botString($_GET['q'] ?? $_GET['query'] ?? $_GET['keyword'] ?? '');
}

function botContainsText(string $haystack, string $needle): bool {
    if ($needle === '') return true;
    if (function_exists('mb_stripos')) {
        return mb_stripos($haystack, $needle, 0, 'UTF-8') !== false;
    }
    return stripos($haystack, $needle) !== false || strpos($haystack, $needle) !== false;
}

function botSiteUrl(): string {
    return defined('SITE_URL') ? rtrim((string)SITE_URL, '/') : '';
}

function botAbsUrl(string $url): string {
    $url = trim($url);
    if ($url === '') return '';
    if (preg_match('/^https?:\/\//i', $url)) return $url;
    $site = botSiteUrl();
    if ($site === '') return $url;
    return $site . '/' . ltrim($url, '/');
}

function botCountry(): string {
    $country = strtolower(botString($_GET['country'] ?? 'all'));
    return in_array($country, ['china', 'japan', 'all'], true) ? $country : 'all';
}

function botNormalizeChinaRegion(string $value): string {
    $value = trim($value);
    if ($value === '') return '';
    $map = [
        '北京' => '北京', '北京市' => '北京', '京' => '北京',
        '天津' => '天津', '天津市' => '天津', '津' => '天津',
        '上海' => '上海', '上海市' => '上海', '沪' => '上海',
        '重庆' => '重庆', '重庆市' => '重庆', '渝' => '重庆',
        '河北' => '河北', '河北省' => '河北', '冀' => '河北',
        '山西' => '山西', '山西省' => '山西', '晋' => '山西',
        '辽宁' => '辽宁', '辽宁省' => '辽宁', '辽' => '辽宁',
        '吉林' => '吉林', '吉林省' => '吉林', '吉' => '吉林',
        '黑龙江' => '黑龙江', '黑龙江省' => '黑龙江', '黑' => '黑龙江',
        '江苏' => '江苏', '江苏省' => '江苏', '苏' => '江苏',
        '浙江' => '浙江', '浙江省' => '浙江', '浙' => '浙江',
        '安徽' => '安徽', '安徽省' => '安徽', '皖' => '安徽',
        '福建' => '福建', '福建省' => '福建', '闽' => '福建',
        '江西' => '江西', '江西省' => '江西', '赣' => '江西',
        '山东' => '山东', '山东省' => '山东', '鲁' => '山东',
        '河南' => '河南', '河南省' => '河南', '豫' => '河南',
        '湖北' => '湖北', '湖北省' => '湖北', '鄂' => '湖北',
        '湖南' => '湖南', '湖南省' => '湖南', '湘' => '湖南',
        '广东' => '广东', '广东省' => '广东', '粤' => '广东',
        '海南' => '海南', '海南省' => '海南', '琼' => '海南',
        '四川' => '四川', '四川省' => '四川', '川' => '四川', '蜀' => '四川',
        '贵州' => '贵州', '贵州省' => '贵州', '贵' => '贵州', '黔' => '贵州',
        '云南' => '云南', '云南省' => '云南', '云' => '云南', '滇' => '云南',
        '陕西' => '陕西', '陕西省' => '陕西', '陕' => '陕西', '秦' => '陕西',
        '甘肃' => '甘肃', '甘肃省' => '甘肃', '甘' => '甘肃', '陇' => '甘肃',
        '青海' => '青海', '青海省' => '青海', '青' => '青海',
        '台湾' => '台湾', '台湾省' => '台湾', '台' => '台湾',
        '广西' => '广西', '广西壮族自治区' => '广西', '桂' => '广西',
        '西藏' => '西藏', '西藏自治区' => '西藏', '藏' => '西藏',
        '宁夏' => '宁夏', '宁夏回族自治区' => '宁夏', '宁' => '宁夏',
        '新疆' => '新疆', '新疆维吾尔自治区' => '新疆', '新' => '新疆',
        '内蒙古' => '内蒙古', '内蒙古自治区' => '内蒙古', '蒙' => '内蒙古',
        '香港' => '香港', '香港特别行政区' => '香港', '港' => '香港',
        '澳门' => '澳门', '澳门特别行政区' => '澳门', '澳' => '澳门',
        '海外' => '海外',
    ];
    return $map[$value] ?? preg_replace('/(壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|省|市)$/u', '', $value);
}

function botNormalizeJapanRegion(string $value): string {
    if (function_exists('normalizeJapanPrefectureName')) {
        return normalizeJapanPrefectureName($value);
    }
    return trim($value);
}

function botClubRegion(array $club, string $country): string {
    $region = $country === 'japan'
        ? botString($club['prefecture'] ?? $club['province'] ?? '')
        : botString($club['province'] ?? $club['prefecture'] ?? '');
    return $country === 'japan' ? botNormalizeJapanRegion($region) : botNormalizeChinaRegion($region);
}

function botLoadClubs(?string $country = null): array {
    $sources = [];
    if ($country === null || $country === 'all' || $country === 'china') {
        $sources[] = ['country' => 'china', 'rows' => botRows(__DIR__ . '/../data/clubs.json', 'data')];
    }
    if ($country === null || $country === 'all' || $country === 'japan') {
        $sources[] = ['country' => 'japan', 'rows' => botRows(__DIR__ . '/../data/clubs_japan.json', 'data')];
    }

    $clubs = [];
    foreach ($sources as $source) {
        foreach ($source['rows'] as $club) {
            if (!is_array($club)) continue;
            $club['country'] = $source['country'];
            $clubs[] = $club;
        }
    }
    usort($clubs, fn($a, $b) => [$a['country'] ?? '', (int)($a['id'] ?? 0)] <=> [$b['country'] ?? '', (int)($b['id'] ?? 0)]);
    return $clubs;
}

function botTextMatches(array $row, string $query, array $fields): bool {
    if ($query === '') return true;
    $keywords = preg_split('/\s+/u', $query) ?: [];
    foreach ($keywords as $keyword) {
        if ($keyword === '') continue;
        $matched = false;
        foreach ($fields as $field) {
            $value = $row[$field] ?? '';
            if (is_array($value)) $value = json_encode($value, JSON_UNESCAPED_UNICODE);
            if ($value !== '' && botContainsText((string)$value, $keyword)) {
                $matched = true;
                break;
            }
        }
        if (!$matched) return false;
    }
    return true;
}

function botDb(): ?PDO {
    static $db = null;
    static $attempted = false;
    if (!$attempted) {
        $attempted = true;
        try {
            require_once __DIR__ . '/../includes/db.php';
            $db = getDB();
        } catch (Throwable $e) {
            $db = null;
        }
    }
    return $db;
}

function botMemberCounts(): array {
    $db = botDb();
    if (!$db) return [];
    try {
        $stmt = $db->query("SELECT club_id, COALESCE(country, 'china') AS country, COUNT(*) AS cnt FROM club_memberships WHERE status = 'active' AND role <> 'external' GROUP BY club_id, COALESCE(country, 'china')");
        $result = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $key = ($row['country'] ?: 'china') . ':' . (int)$row['club_id'];
            $result[$key] = (int)$row['cnt'];
        }
        return $result;
    } catch (Throwable $e) {
        try {
            $stmt = $db->query("SELECT club_id, COUNT(*) AS cnt FROM club_memberships WHERE status = 'active' AND role <> 'external' GROUP BY club_id");
            $result = [];
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $result['china:' . (int)$row['club_id']] = (int)$row['cnt'];
            }
            return $result;
        } catch (Throwable $e2) {
            return [];
        }
    }
}

function botClubKey(array $club): string {
    return ($club['country'] ?? 'china') . ':' . (int)($club['id'] ?? 0);
}

function botWikiIndex(): array {
    $rows = botLoadJson(__DIR__ . '/../wiki/index.json', []);
    return is_array($rows) ? $rows : [];
}

function botWikiForClub(string $country, int $id): ?array {
    $wiki = botWikiIndex();
    $key = $country . '-' . $id;
    if (!isset($wiki[$key]) || !is_array($wiki[$key])) return null;
    $row = $wiki[$key];
    if (!empty($row['url'])) $row['url'] = botAbsUrl((string)$row['url']);
    return $row;
}

function botPublicationsForClub(array $club): array {
    $country = $club['country'] ?? 'china';
    $id = (int)($club['id'] ?? 0);
    $name = botString($club['display_name'] ?? $club['name'] ?? '');
    $shortName = botString($club['name'] ?? '');
    $items = [];
    foreach (botRows(__DIR__ . '/../data/publications.json', 'publications') as $pub) {
        $matched = false;
        foreach (($pub['club_ids'] ?? []) as $clubRef) {
            if ((int)($clubRef['id'] ?? 0) === $id && ($clubRef['country'] ?? 'china') === $country) {
                $matched = true;
                break;
            }
        }
        if (!$matched) {
            $clubName = botString($pub['clubName'] ?? '');
            $matched = $clubName !== '' && ($clubName === $name || $clubName === $shortName);
        }
        if ($matched) {
            $items[] = botPublicationRow($pub, false);
        }
    }
    return $items;
}

function botClubRow(array $club, bool $full = false, ?array $memberCounts = null): array {
    $country = $club['country'] ?? 'china';
    $id = (int)($club['id'] ?? 0);
    $region = botClubRegion($club, $country);
    $row = [
        'id' => $id,
        'key' => $country . ':' . $id,
        'country' => $country,
        'name' => botString($club['display_name'] ?? $club['name'] ?? ''),
        'short_name' => botString($club['name'] ?? ''),
        'school' => botString($club['school'] ?? ''),
        'region' => $region,
        'province' => $country === 'china' ? $region : '',
        'prefecture' => $country === 'japan' ? $region : '',
        'type' => botString($club['type'] ?? 'school') ?: 'school',
        'verified' => (int)($club['verified'] ?? 0),
        'project' => botString($club['project'] ?? 'galgame') ?: 'galgame',
        'created_at' => botString($club['created_at'] ?? ''),
        'logo_url' => botAbsUrl(botString($club['logo_url'] ?? '')),
        'share_url' => botAbsUrl('club_share.html?club=' . rawurlencode($country . ':' . $id)),
        'external_links' => botString($club['external_links'] ?? ''),
        'member_count' => 0,
    ];

    if ($memberCounts !== null) {
        $row['member_count'] = $memberCounts[$country . ':' . $id] ?? 0;
    }

    $contact = botString($club['info'] ?? '');
    if ($full) {
        $row['contact'] = $contact;
        $row['contact_hidden'] = false;
        $row['remark'] = botString($club['remark'] ?? '');
        $row['raw_text'] = botString($club['raw_text'] ?? '');
        $row['protected'] = (int)($club['protected'] ?? 0);
        $row['visible_by_default'] = (int)($club['visible_by_default'] ?? 0);
    } else {
        $visible = !empty($club['visible_by_default']);
        $row['contact'] = $visible ? $contact : '';
        $row['contact_hidden'] = !$visible && $contact !== '';
    }

    return $row;
}

function botClubMembers(int $clubId, string $country): array {
    $db = botDb();
    if (!$db) return [];
    try {
        $stmt = $db->prepare(
            "SELECT cm.id, cm.user_id, cm.role, cm.status, cm.joined_at, cm.qq_account, cm.apply_role, cm.is_student,
                    u.username, u.nickname, u.email, u.avatar_url
             FROM club_memberships cm
             JOIN users u ON u.id = cm.user_id
             WHERE cm.club_id = ? AND COALESCE(cm.country, 'china') = ? AND cm.status = 'active'
             ORDER BY CASE cm.role WHEN 'representative' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END, cm.joined_at ASC"
        );
        $stmt->execute([$clubId, $country]);
    } catch (Throwable $e) {
        try {
            $stmt = $db->prepare(
                "SELECT cm.id, cm.user_id, cm.role, cm.status, cm.joined_at, u.username, u.nickname, u.avatar_url
                 FROM club_memberships cm
                 JOIN users u ON u.id = cm.user_id
                 WHERE cm.club_id = ? AND cm.status = 'active'
                 ORDER BY cm.joined_at ASC"
            );
            $stmt->execute([$clubId]);
        } catch (Throwable $e2) {
            return [];
        }
    }
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$row) {
        $row['role_label'] = botRoleLabel(botString($row['role'] ?? 'member'));
    }
    return $rows;
}

function botJoinMethodLabel(string $method): string {
    return match ($method) {
        'school_code' => '本校成员申请（有绑定码）',
        'external_exchange' => '外校成员交流申请',
        default => '本校成员申请加入（未有绑定码）',
    };
}

function botRoleLabel(string $role): string {
    return match ($role) {
        'external' => '外交成员（IEM）',
        'representative' => '负责人',
        'manager' => '管理员',
        'super_admin' => '超级管理员',
        default => '成员',
    };
}

function botMoeKing(int $clubId, string $country): ?array {
    $db = botDb();
    if (!$db) return null;
    try {
        $stmt = $db->prepare("SELECT character_id, name, name_cn, image_url, summary, updated_at FROM club_moe_kings WHERE club_id = ? AND country = ? LIMIT 1");
        $stmt->execute([$clubId, $country]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) return null;
        $row['character_id'] = (int)($row['character_id'] ?? 0);
        $row['image_url'] = proxyImageUrl($row['image_url'] ?? '');
        return $row;
    } catch (Throwable $e) {
        return null;
    }
}

function botMembershipApplications(): array {
    $db = botDb();
    if (!$db) return ['success' => true, 'total' => 0, 'data' => []];
    botEnsureMembershipApplicationColumns($db);

    $scope = strtolower(botString($_GET['scope'] ?? 'all'));
    $status = strtolower(botString($_GET['status'] ?? 'pending'));
    $sinceId = max(0, (int)($_GET['since_id'] ?? 0));
    $order = strtolower(botString($_GET['order'] ?? 'asc'));
    $limit = botLimit(20, 50);
    $params = [];
    $where = [];

    if ($status !== '' && $status !== 'all') {
        $where[] = 'cm.status = ?';
        $params[] = $status;
    }
    if ($sinceId > 0) {
        $where[] = 'cm.id > ?';
        $params[] = $sinceId;
    }

    if ($scope === 'club') {
        $clubKey = botString($_GET['club_key'] ?? $_GET['key'] ?? '');
        $club = botFindClubByKey($clubKey);
        if (!$club) {
            return ['success' => false, 'error' => '无效的 club_key'];
        }
        $where[] = 'cm.club_id = ?';
        $params[] = (int)($club['id'] ?? 0);
        $where[] = "COALESCE(cm.country, 'china') = ?";
        $params[] = $club['country'] ?? 'china';
    } elseif ($scope !== 'all') {
        return ['success' => false, 'error' => 'scope must be club or all'];
    }

    $sql = "SELECT cm.id, cm.user_id, cm.club_id, COALESCE(cm.country, 'china') AS country,
                   cm.status, cm.role, cm.apply_role, cm.join_method, cm.qq_account, cm.contact_account,
                   cm.external_club_name, cm.external_club_role, cm.apply_reason, cm.joined_at,
                   u.username, u.nickname
            FROM club_memberships cm
            LEFT JOIN users u ON u.id = cm.user_id";
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY cm.id ' . ($order === 'desc' ? 'DESC' : 'ASC') . ' LIMIT ' . $limit;

    try {
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $items = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $country = botString($row['country'] ?? 'china') ?: 'china';
            $clubId = (int)($row['club_id'] ?? 0);
            $club = botFindClub($clubId, $country);
            $joinMethod = botString($row['join_method'] ?? 'school_no_code') ?: 'school_no_code';
            $role = botString($row['apply_role'] ?? $row['role'] ?? 'member') ?: 'member';
            $applicant = botString($row['nickname'] ?? '') ?: (botString($row['username'] ?? '') ?: ('用户#' . (int)($row['user_id'] ?? 0)));
            $items[] = [
                'id' => (int)($row['id'] ?? 0),
                'club_key' => $country . ':' . $clubId,
                'club_name' => $club ? botString($club['display_name'] ?? $club['name'] ?? ('同好会#' . $clubId)) : ('同好会#' . $clubId),
                'country' => $country,
                'club_id' => $clubId,
                'status' => botString($row['status'] ?? ''),
                'join_method' => $joinMethod,
                'join_method_label' => botJoinMethodLabel($joinMethod),
                'apply_role' => $role,
                'role_label' => botRoleLabel($role),
                'applicant_name' => $applicant,
                'username' => botString($row['username'] ?? ''),
                'user_id' => (int)($row['user_id'] ?? 0),
                'contact_account' => botString($row['contact_account'] ?? ''),
                'qq_account' => botString($row['qq_account'] ?? ''),
                'external_club_name' => botString($row['external_club_name'] ?? ''),
                'external_club_role' => botString($row['external_club_role'] ?? ''),
                'apply_reason' => botString($row['apply_reason'] ?? ''),
                'created_at' => botString($row['joined_at'] ?? ''),
                'joined_at' => botString($row['joined_at'] ?? ''),
            ];
        }
        return ['success' => true, 'total' => count($items), 'data' => $items];
    } catch (Throwable $e) {
        return ['success' => false, 'error' => 'membership application query failed'];
    }
}

function botFindClub(int $id, string $country = 'all'): ?array {
    foreach (botLoadClubs($country) as $club) {
        if ((int)($club['id'] ?? 0) === $id) return $club;
    }
    return null;
}

function botFindClubByKey(string $value): ?array {
    $value = trim($value);
    if (preg_match('/^(china|japan):([0-9]+)$/i', $value, $matches)) {
        return botFindClub((int)$matches[2], strtolower($matches[1]));
    }
    if (preg_match('/^(china|japan)-([0-9]+)$/i', $value, $matches)) {
        return botFindClub((int)$matches[2], strtolower($matches[1]));
    }
    if (ctype_digit($value)) {
        return botFindClub((int)$value, botCountry());
    }
    return null;
}

function botPublicationRow(array $pub, bool $full): array {
    return [
        'id' => (int)($pub['id'] ?? 0),
        'title' => botString($pub['publicationName'] ?? ''),
        'club_name' => botString($pub['clubName'] ?? ''),
        'club_ids' => is_array($pub['club_ids'] ?? null) ? $pub['club_ids'] : [],
        'status' => botString($pub['status'] ?? ''),
        'deadline' => botString($pub['deadline'] ?? ''),
        'description' => botString($pub['description'] ?? ''),
        'submit_contact' => $full ? botString($pub['submitContact'] ?? '') : '',
        'submit_contact_hidden' => !$full && botString($pub['submitContact'] ?? '') !== '',
        'submit_link' => $full ? botString($pub['submitLink'] ?? '') : '',
        'image_url' => botAbsUrl(botString($pub['image_url'] ?? '')),
        'created_at' => botString($pub['created_at'] ?? ''),
        'updated_at' => botString($pub['updated_at'] ?? ''),
    ];
}

function botEventRow(array $event): array {
    return [
        'id' => (int)($event['id'] ?? 0),
        'title' => botString($event['event'] ?? ''),
        'date' => botString($event['date'] ?? ''),
        'date_end' => botString($event['date_end'] ?? ''),
        'description' => botString($event['description'] ?? ''),
        'link' => botString($event['link'] ?? ''),
        'image_url' => botAbsUrl(botString($event['image'] ?? '')),
        'official' => (int)($event['offical'] ?? $event['official'] ?? 0),
        'created_at' => botString($event['created_at'] ?? ''),
    ];
}

function botFilterRows(array $rows, string $query, array $fields, int $limit): array {
    $items = [];
    foreach ($rows as $row) {
        if (!is_array($row)) continue;
        if (!botTextMatches($row, $query, $fields)) continue;
        $items[] = $row;
        if (count($items) >= $limit) break;
    }
    return $items;
}

function botGrowthClubSummary(array $club): array {
    $summary = growthBuildClubSummary($club);
    $summary['share_url'] = botAbsUrl($summary['share_url'] ?? '');
    $summary['apply_url'] = botAbsUrl($summary['apply_url'] ?? '');
    if (!empty($summary['logo_url'])) {
        $summary['logo_url'] = botAbsUrl((string)$summary['logo_url']);
    }
    if (!empty($summary['activity']['wiki']['url'])) {
        $summary['activity']['wiki']['url'] = botAbsUrl((string)$summary['activity']['wiki']['url']);
    }
    return $summary;
}

function botDbCount(string $sql, array $params = []): int {
    $db = botDb();
    if (!$db) return 0;
    try {
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        return (int)$stmt->fetchColumn();
    } catch (Throwable $e) {
        return 0;
    }
}

function botEnsureColumn(PDO $db, string $table, string $column, string $definition): void {
    $exists = false;
    try {
        if ($db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite') {
            $stmt = $db->query("PRAGMA table_info($table)");
            $cols = $stmt ? $stmt->fetchAll(PDO::FETCH_COLUMN, 1) : [];
            $exists = in_array($column, $cols, true);
        } else {
            $stmt = $db->query("SHOW COLUMNS FROM `$table` LIKE " . $db->quote($column));
            $exists = (bool)($stmt && $stmt->fetch());
        }
    } catch (Throwable $e) {
        $exists = true;
    }
    if (!$exists) {
        try {
            $db->exec("ALTER TABLE `$table` ADD COLUMN `$column` $definition");
        } catch (Throwable $e) {}
    }
}

function botEnsureMembershipApplicationColumns(PDO $db): void {
    botEnsureColumn($db, 'club_memberships', 'country', "VARCHAR(20) DEFAULT 'china'");
    botEnsureColumn($db, 'club_memberships', 'qq_account', "VARCHAR(255) DEFAULT ''");
    botEnsureColumn($db, 'club_memberships', 'contact_account', "VARCHAR(255) DEFAULT ''");
    botEnsureColumn($db, 'club_memberships', 'apply_role', "VARCHAR(50) DEFAULT 'member'");
    botEnsureColumn($db, 'club_memberships', 'join_method', "VARCHAR(50) DEFAULT 'school_no_code'");
    botEnsureColumn($db, 'club_memberships', 'external_club_name', "VARCHAR(255) DEFAULT ''");
    botEnsureColumn($db, 'club_memberships', 'external_club_role', "VARCHAR(255) DEFAULT ''");
    botEnsureColumn($db, 'club_memberships', 'apply_reason', "TEXT");
}

function botPendingJsonCount(string $path, string $listKey = ''): int {
    $rows = $listKey === '' ? botLoadJson($path, []) : botRows($path, $listKey);
    $count = 0;
    foreach ($rows as $row) {
        if (!is_array($row)) continue;
        if (($row['status'] ?? '') === 'pending') $count++;
    }
    return $count;
}

$action = strtolower(botString($_GET['action'] ?? 'help'));
$limit = botLimit();
$full = botBoolParam('full') || botBoolParam('include_private') || botBoolParam('include_contact');
$query = botQuery();

switch ($action) {
    case 'help':
        botRespond([
            'success' => true,
            'actions' => ['clubs', 'club', 'club_share', 'club_activity', 'search', 'events', 'publications', 'wiki', 'star_unions', 'moe_contests', 'announcements', 'membership_applications', 'stats', 'admin_summary'],
            'params' => ['token', 'action', 'country', 'id', 'q', 'region', 'type', 'status', 'limit', 'full', 'scope', 'club_key', 'since_id', 'order'],
        ]);

    case 'clubs':
    case 'search':
        $country = botCountry();
        $regionFilter = botString($_GET['region'] ?? $_GET['province'] ?? $_GET['prefecture'] ?? '');
        $typeFilter = botString($_GET['type'] ?? '');
        $memberCounts = botMemberCounts();
        $items = [];
        foreach (botLoadClubs($country) as $club) {
            $clubCountry = $club['country'] ?? 'china';
            if ($typeFilter !== '' && botString($club['type'] ?? '') !== $typeFilter) continue;
            if ($regionFilter !== '') {
                $clubRegion = botClubRegion($club, $clubCountry);
                $wanted = $clubCountry === 'japan' ? botNormalizeJapanRegion($regionFilter) : botNormalizeChinaRegion($regionFilter);
                if ($clubRegion !== $wanted) continue;
            }
            if ($query !== '' && !botTextMatches($club, $query, ['name', 'display_name', 'school', 'province', 'prefecture', 'remark', 'raw_text', 'project'])) continue;
            $items[] = botClubRow($club, $full, $memberCounts);
            if (count($items) >= $limit) break;
        }
        botRespond(['success' => true, 'action' => $action, 'total' => count($items), 'data' => $items]);

    case 'club':
        $idParam = botString($_GET['id'] ?? $_GET['key'] ?? '');
        $club = botFindClubByKey($idParam);
        if (!$club && $query !== '') {
            foreach (botLoadClubs(botCountry()) as $candidate) {
                if (botTextMatches($candidate, $query, ['name', 'display_name', 'school', 'remark', 'raw_text'])) {
                    $club = $candidate;
                    break;
                }
            }
        }
        if (!$club) {
            botRespond(['success' => false, 'error' => '未找到该同好会'], 404);
        }
        $memberCounts = botMemberCounts();
        $row = botClubRow($club, $full, $memberCounts);
        $country = $club['country'] ?? 'china';
        $id = (int)($club['id'] ?? 0);
        $row['wiki'] = botWikiForClub($country, $id);
        $row['publications'] = botPublicationsForClub($club);
        if ($full) {
            $row['members'] = botClubMembers($id, $country);
        }
        $row['moe_king'] = botMoeKing($id, $country);
        botRespond(['success' => true, 'data' => $row]);

    case 'club_share':
    case 'club_activity':
        $idParam = botString($_GET['id'] ?? $_GET['key'] ?? '');
        $club = botFindClubByKey($idParam);
        if (!$club && $query !== '') {
            foreach (botLoadClubs(botCountry()) as $candidate) {
                if (botTextMatches($candidate, $query, ['name', 'display_name', 'school', 'remark', 'raw_text'])) {
                    $club = $candidate;
                    break;
                }
            }
        }
        if (!$club) {
            botRespond(['success' => false, 'error' => 'club not found'], 404);
        }
        $summary = botGrowthClubSummary($club);
        growthRecordAnalytics('bot_share_query', $summary['key'], 'bot');
        if ($action === 'club_activity') {
            botRespond([
                'success' => true,
                'data' => [
                    'club' => [
                        'key' => $summary['key'],
                        'name' => $summary['name'],
                        'share_url' => $summary['share_url'],
                    ],
                    'activity' => $summary['activity'],
                ],
            ]);
        }
        botRespond(['success' => true, 'data' => $summary]);

    case 'events':
        $rows = array_reverse(botRows(__DIR__ . '/../data/events.json', 'events'));
        $items = [];
        foreach (botFilterRows($rows, $query, ['event', 'date', 'date_end', 'description', 'link'], $limit) as $row) {
            $items[] = botEventRow($row);
        }
        botRespond(['success' => true, 'total' => count($items), 'data' => $items]);

    case 'publications':
        $status = botString($_GET['status'] ?? '');
        $items = [];
        foreach (botRows(__DIR__ . '/../data/publications.json', 'publications') as $row) {
            if ($status !== '' && botString($row['status'] ?? '') !== $status) continue;
            if (!botTextMatches($row, $query, ['publicationName', 'clubName', 'status', 'deadline', 'description', 'submitContact'])) continue;
            $items[] = botPublicationRow($row, $full);
            if (count($items) >= $limit) break;
        }
        botRespond(['success' => true, 'total' => count($items), 'data' => $items]);

    case 'wiki':
        $items = [];
        foreach (botWikiIndex() as $key => $row) {
            if (!is_array($row)) continue;
            if (!botTextMatches($row, $query, ['title', 'school', 'club_name', 'region', 'summary', 'country_label'])) continue;
            $row['key'] = $key;
            if (!empty($row['url'])) $row['url'] = botAbsUrl((string)$row['url']);
            $items[] = $row;
            if (count($items) >= $limit) break;
        }
        botRespond(['success' => true, 'total' => count($items), 'data' => $items]);

    case 'star_unions':
        $db = botDb();
        if (!$db) botRespond(['success' => true, 'total' => 0, 'data' => []]);
        try {
            $country = botCountry();
            $params = [];
            $where = [];
            if ($country !== 'all') {
                $where[] = 'country = ?';
                $params[] = $country;
            }
            if ($query !== '') {
                $where[] = '(name LIKE ? OR description LIKE ? OR region LIKE ?)';
                $params[] = '%' . $query . '%';
                $params[] = '%' . $query . '%';
                $params[] = '%' . $query . '%';
            }
            $sql = 'SELECT id, name, description, region, country, bound_club_id, bound_club_country, star_color, created_at FROM star_unions';
            if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
            $sql .= ' ORDER BY created_at DESC LIMIT ' . $limit;
            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            $items = [];
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $row['id'] = (int)$row['id'];
                $row['member_count'] = botDbCount('SELECT COUNT(*) FROM star_union_members WHERE union_id = ?', [(int)$row['id']]);
                $items[] = $row;
            }
            botRespond(['success' => true, 'total' => count($items), 'data' => $items]);
        } catch (Throwable $e) {
            botRespond(['success' => true, 'total' => 0, 'data' => []]);
        }

    case 'moe_contests':
        botRespond([
            'success' => true,
            'total' => 0,
            'data' => [],
            'code' => 'MOE_REBUILDING',
            'message' => '萌战模块正在重构，旧方案已下线，接口动作保留。',
        ]);

    case 'announcements':
        $db = botDb();
        if (!$db) botRespond(['success' => true, 'total' => 0, 'data' => []]);
        try {
            $stmt = $db->prepare(
                "SELECT id, title, content, type, status, is_persistent, created_at, published_at
                 FROM announcements
                 WHERE status = 'published'
                 ORDER BY published_at DESC, created_at DESC
                 LIMIT " . $limit
            );
            $stmt->execute();
            botRespond(['success' => true, 'total' => $stmt->rowCount(), 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
        } catch (Throwable $e) {
            botRespond(['success' => true, 'total' => 0, 'data' => []]);
        }

    case 'membership_applications':
        $payload = botMembershipApplications();
        botRespond($payload, !empty($payload['success']) ? 200 : 400);

    case 'auto_approve':
        $membershipId = (int)($_GET['membership_id'] ?? 0);
        if ($membershipId <= 0) {
            botRespond(['success' => false, 'error' => 'membership_id required'], 400);
        }
        $db = botDb();
        if (!$db) botRespond(['success' => false, 'error' => 'database unavailable'], 500);
        try {
            // Verify the application exists and is pending
            $stmt = $db->prepare("SELECT cm.*, c.id FROM club_memberships cm WHERE cm.id = ? AND cm.status = 'pending'");
            $stmt->execute([$membershipId]);
            $membership = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$membership) {
                botRespond(['success' => false, 'error' => 'pending application not found'], 404);
            }
            // Approve
            $stmt = $db->prepare("UPDATE club_memberships SET status = 'active', left_at = NULL WHERE id = ? AND status = 'pending'");
            $stmt->execute([$membershipId]);
            // Notify the applicant (silent on failure)
            try {
                if (file_exists(__DIR__ . '/../includes/notifications.php')) {
                    require_once __DIR__ . '/../includes/notifications.php';
                    // Look up club name from JSON
                    $clubName = '同好会';
                    $clubId = (int)$membership['club_id'];
                    $clubCountry = $membership['country'] ?? 'china';
                    foreach (botLoadClubs($clubCountry) as $c) {
                        if ((int)($c['id'] ?? 0) === $clubId) {
                            $clubName = $c['name'] ?? $c['display_name'] ?? '同好会';
                            break;
                        }
                    }
                    createNotification(
                        (int)$membership['user_id'],
                        'join_approved',
                        '同好会申请已通过',
                        "你在「{$clubName}」的加入申请已被系统自动批准。",
                        './index.html',
                        'membership',
                        $membershipId
                    );
                }
            } catch (Throwable $e) {
                // notification failure is non-fatal
            }
            botRespond(['success' => true, 'message' => 'membership approved', 'membership_id' => $membershipId]);
        } catch (Throwable $e) {
            botRespond(['success' => false, 'error' => 'approve failed: ' . $e->getMessage()], 500);
        }

    case 'stats':
        $clubs = botLoadClubs('all');
        $memberCounts = botMemberCounts();
        $byCountry = [];
        $byType = [];
        $byRegion = [];
        foreach ($clubs as $club) {
            $country = $club['country'] ?? 'china';
            $type = botString($club['type'] ?? 'school') ?: 'school';
            $region = botClubRegion($club, $country);
            $byCountry[$country] = ($byCountry[$country] ?? 0) + 1;
            $byType[$type] = ($byType[$type] ?? 0) + 1;
            if ($region !== '') $byRegion[$region] = ($byRegion[$region] ?? 0) + 1;
        }
        arsort($byRegion);
        botRespond([
            'success' => true,
            'data' => [
                'total_clubs' => count($clubs),
                'total_members' => array_sum($memberCounts),
                'total_events' => count(botRows(__DIR__ . '/../data/events.json', 'events')),
                'total_publications' => count(botRows(__DIR__ . '/../data/publications.json', 'publications')),
                'total_wiki_pages' => count(botWikiIndex()),
                'total_moe_contests' => 0,
                'active_users' => botDbCount("SELECT COUNT(*) FROM users WHERE status = 'active'"),
                'growth_analytics_30d' => growthAnalyticsSummary([], 30),
                'by_country' => $byCountry,
                'by_type' => $byType,
                'top_regions' => array_slice($byRegion, 0, 20, true),
            ],
        ]);

    case 'admin_summary':
        botRespond([
            'success' => true,
            'data' => [
                'pending_club_submissions' => botPendingJsonCount(__DIR__ . '/../data/submissions.json'),
                'pending_publication_submissions' => botPendingJsonCount(__DIR__ . '/../data/submissions_publication.json'),
                'pending_event_submissions' => botPendingJsonCount(__DIR__ . '/../data/submissions_event.json'),
                'pending_feedback' => botPendingJsonCount(__DIR__ . '/../data/feedback.json'),
                'event_registrations' => count(botLoadJson(__DIR__ . '/../data/event_registrations.json', [])),
                'pending_memberships' => botDbCount("SELECT COUNT(*) FROM club_memberships WHERE status = 'pending'"),
                'pending_memberships_school_no_code' => botDbCount("SELECT COUNT(*) FROM club_memberships WHERE status = 'pending' AND COALESCE(join_method, 'school_no_code') = 'school_no_code'"),
                'pending_memberships_external_exchange' => botDbCount("SELECT COUNT(*) FROM club_memberships WHERE status = 'pending' AND COALESCE(join_method, 'school_no_code') = 'external_exchange'"),
                'active_users' => botDbCount("SELECT COUNT(*) FROM users WHERE status = 'active'"),
                'total_clubs' => count(botLoadClubs('all')),
                'total_publications' => count(botRows(__DIR__ . '/../data/publications.json', 'publications')),
                'total_events' => count(botRows(__DIR__ . '/../data/events.json', 'events')),
                'total_wiki_pages' => count(botWikiIndex()),
            ],
        ]);

    default:
        botRespond(['success' => false, 'error' => '未知 action', 'action' => $action], 400);
}
