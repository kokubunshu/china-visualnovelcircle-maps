<?php
// api_events.php - 活动数据管理 API
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Admin-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$dataFile = __DIR__ . '/../data/events.json';
$registrationFile = __DIR__ . '/../data/event_registrations.json';
require_once __DIR__ . '/../includes/project_hub.php';

function jsonResponse(array $payload): void {
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit();
}

function readJsonFile(string $file, $default) {
    if (!file_exists($file)) {
        return $default;
    }
    $content = file_get_contents($file);
    if ($content === false || trim($content) === '') {
        return $default;
    }
    $decoded = json_decode($content, true);
    return is_array($decoded) ? $decoded : $default;
}

function normalizeEventsPayload($payload): array {
    if (is_array($payload) && isset($payload['events']) && is_array($payload['events'])) {
        return array_values($payload['events']);
    }
    if (is_array($payload) && ($payload === [] || array_keys($payload) === range(0, count($payload) - 1))) {
        return array_values($payload);
    }
    return [];
}

function withLockedJsonFile(string $file, $default, callable $modifier): array {
    $dir = dirname($file);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

    $handle = fopen($file, 'c+');
    if (!$handle) {
        return ['success' => false, 'message' => '无法打开数据文件', 'code' => 'file_open_failed'];
    }

    try {
        if (!flock($handle, LOCK_EX)) {
            return ['success' => false, 'message' => '无法锁定数据文件', 'code' => 'file_lock_failed'];
        }

        rewind($handle);
        $content = stream_get_contents($handle);
        $data = $content && trim($content) !== '' ? json_decode($content, true) : $default;
        if (!is_array($data)) {
            $data = $default;
        }

        $result = $modifier($data);
        if (isset($result['success']) && $result['success'] === false) {
            return $result;
        }

        $nextData = $result['data'] ?? $result;
        $json = json_encode($nextData, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        if ($json === false) {
            return ['success' => false, 'message' => '数据编码失败', 'code' => 'json_encode_failed'];
        }

        rewind($handle);
        ftruncate($handle, 0);
        $written = fwrite($handle, $json);
        fflush($handle);
        if ($written === false) {
            return ['success' => false, 'message' => '保存失败，请检查文件权限', 'code' => 'file_write_failed'];
        }

        return $result;
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function eventKey(array $event): string {
    return trim((string)($event['event'] ?? '')) . '|' . trim((string)($event['date'] ?? ''));
}

function maxEventId(array $events): int {
    $max = 0;
    foreach ($events as $event) {
        $id = (int)($event['id'] ?? 0);
        if ($id > $max) $max = $id;
    }
    return $max;
}

function validateEventInput(array $input, bool $partial = false): array {
    $eventName = trim((string)($input['event'] ?? ''));
    $eventDate = trim((string)($input['date'] ?? ''));
    $eventDateEnd = trim((string)($input['date_end'] ?? ''));

    if (!$partial || array_key_exists('event', $input)) {
        if ($eventName === '') {
            return ['success' => false, 'message' => '活动名称不能为空', 'code' => 'event_name_required'];
        }
    }

    if (!$partial || array_key_exists('date', $input)) {
        if ($eventDate === '') {
            return ['success' => false, 'message' => '活动日期不能为空', 'code' => 'event_date_required'];
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $eventDate)) {
            return ['success' => false, 'message' => '活动日期格式无效', 'code' => 'invalid_event_date'];
        }
    }

    if ($eventDateEnd !== '') {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $eventDateEnd)) {
            return ['success' => false, 'message' => '结束日期格式无效', 'code' => 'invalid_event_date_end'];
        }
        if ($eventDate !== '' && $eventDateEnd < $eventDate) {
            return ['success' => false, 'message' => '结束日期不能早于开始日期', 'code' => 'invalid_date_range'];
        }
    }

    return ['success' => true];
}

function sanitizeEvent(array $input, ?array $base = null): array {
    $event = $base ?: [];
    $fields = ['event', 'date', 'date_end', 'image', 'raw_text', 'offical', 'description', 'link'];
    foreach ($fields as $field) {
        if (array_key_exists($field, $input)) {
            $value = $input[$field];
            if ($field === 'date_end' && ($value === '' || $value === false)) {
                $value = null;
            }
            if ($field === 'offical') {
                $value = filter_var($value, FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
            }
            $event[$field] = $value;
        }
    }
    return $event;
}

function addEventAtomic(string $dataFile, array $input): array {
    $validation = validateEventInput($input);
    if (!$validation['success']) return $validation;

    return withLockedJsonFile($dataFile, ['events' => []], function($current) use ($input) {
        $events = normalizeEventsPayload($current);
        $newKey = eventKey($input);
        foreach ($events as $event) {
            if (eventKey($event) === $newKey) {
                return ['success' => false, 'message' => '同名同日期活动已存在', 'code' => 'duplicate_event'];
            }
        }

        $newEvent = sanitizeEvent($input);
        $newEvent['id'] = maxEventId($events) + 1;
        $newEvent['created_at'] = date('Y-m-d H:i:s');
        $events[] = $newEvent;

        return [
            'success' => true,
            'message' => '活动已添加',
            'event' => $newEvent,
            'data' => ['events' => array_values($events)]
        ];
    });
}

function updateEventAtomic(string $dataFile, int $eventId, array $input): array {
    $validation = validateEventInput($input, true);
    if (!$validation['success']) return $validation;

    return withLockedJsonFile($dataFile, ['events' => []], function($current) use ($eventId, $input) {
        $events = normalizeEventsPayload($current);
        $foundIndex = -1;
        foreach ($events as $index => $event) {
            if ((int)($event['id'] ?? 0) === $eventId) {
                $foundIndex = $index;
                break;
            }
        }
        if ($foundIndex < 0) {
            return ['success' => false, 'message' => '活动不存在', 'code' => 'event_not_found'];
        }

        $updated = sanitizeEvent($input, $events[$foundIndex]);
        $updated['id'] = $eventId;
        $updated['updated_at'] = date('Y-m-d H:i:s');
        $updatedKey = eventKey($updated);
        foreach ($events as $index => $event) {
            if ($index !== $foundIndex && eventKey($event) === $updatedKey) {
                return ['success' => false, 'message' => '同名同日期活动已存在', 'code' => 'duplicate_event'];
            }
        }

        $events[$foundIndex] = $updated;
        return [
            'success' => true,
            'message' => '活动已更新',
            'event' => $updated,
            'data' => ['events' => array_values($events)]
        ];
    });
}

function deleteEventAtomic(string $dataFile, int $eventId): array {
    return withLockedJsonFile($dataFile, ['events' => []], function($current) use ($eventId) {
        $events = normalizeEventsPayload($current);
        $next = [];
        $deleted = false;
        foreach ($events as $event) {
            if ((int)($event['id'] ?? 0) === $eventId) {
                $deleted = true;
                continue;
            }
            $next[] = $event;
        }
        if (!$deleted) {
            return ['success' => false, 'message' => '活动不存在', 'code' => 'event_not_found'];
        }
        return [
            'success' => true,
            'message' => '活动已删除',
            'events' => array_values($next),
            'data' => ['events' => array_values($next)]
        ];
    });
}

function replaceEventsCompat(string $dataFile, array $incomingEvents): array {
    return withLockedJsonFile($dataFile, ['events' => []], function($current) use ($incomingEvents) {
        $existingEvents = normalizeEventsPayload($current);
        $merged = [];
        $seenIds = [];
        $seenKeys = [];
        $incomingById = [];
        $incomingWithoutId = [];

        foreach ($incomingEvents as $incoming) {
            if (!is_array($incoming)) continue;
            $validation = validateEventInput($incoming);
            if (!$validation['success']) return $validation;

            $id = (int)($incoming['id'] ?? 0);
            if ($id > 0) {
                $incomingById[$id] = $incoming;
            } else {
                $incomingWithoutId[] = $incoming;
            }
        }

        foreach ($existingEvents as $existing) {
            $id = (int)($existing['id'] ?? 0);
            if ($id > 0 && isset($incomingById[$id])) {
                $candidate = sanitizeEvent($incomingById[$id], $existing);
                $candidate['id'] = $id;
                $candidate['updated_at'] = date('Y-m-d H:i:s');
                $merged[] = $candidate;
                $seenIds[$id] = true;
                $seenKeys[eventKey($candidate)] = true;
            } else {
                $merged[] = $existing;
                if ($id > 0) $seenIds[$id] = true;
                $seenKeys[eventKey($existing)] = true;
            }
        }

        $maxId = maxEventId($merged);
        foreach ($incomingById as $id => $incoming) {
            if (isset($seenIds[$id])) continue;
            $candidate = sanitizeEvent($incoming);
            $candidate['id'] = $id;
            $duplicateKey = eventKey($candidate);
            if (isset($seenKeys[$duplicateKey])) continue;
            $candidate['created_at'] = $candidate['created_at'] ?? date('Y-m-d H:i:s');
            $merged[] = $candidate;
            $seenIds[$id] = true;
            $seenKeys[$duplicateKey] = true;
            if ($id > $maxId) $maxId = $id;
        }

        foreach ($incomingWithoutId as $incoming) {
            $candidate = sanitizeEvent($incoming);
            $duplicateKey = eventKey($candidate);
            if (isset($seenKeys[$duplicateKey])) continue;
            $candidate['id'] = ++$maxId;
            $candidate['created_at'] = $candidate['created_at'] ?? date('Y-m-d H:i:s');
            $merged[] = $candidate;
            $seenKeys[$duplicateKey] = true;
        }

        return [
            'success' => true,
            'message' => '活动已合并保存',
            'events' => array_values($merged),
            'data' => ['events' => array_values($merged)]
        ];
    });
}

function registerEventAtomic(string $registrationFile, int $eventId, array $user): array {
    return withLockedJsonFile($registrationFile, [], function($registrations) use ($eventId, $user) {
        $registrations = is_array($registrations) ? array_values($registrations) : [];
        $userId = (int)$user['id'];
        foreach ($registrations as $registration) {
            if ((int)($registration['event_id'] ?? 0) === $eventId && (int)($registration['user_id'] ?? 0) === $userId) {
                return ['success' => false, 'message' => '您已报名该活动', 'code' => 'already_registered'];
            }
        }

        $registrations[] = [
            'event_id' => $eventId,
            'user_id' => $userId,
            'username' => $user['nickname'] ?? $user['username'] ?? '',
            'registered_at' => date('Y-m-d H:i:s'),
        ];

        return [
            'success' => true,
            'message' => '报名成功',
            'registrations' => array_values($registrations),
            'data' => array_values($registrations)
        ];
    });
}

function unregisterEventAtomic(string $registrationFile, int $eventId, array $user): array {
    return withLockedJsonFile($registrationFile, [], function($registrations) use ($eventId, $user) {
        $registrations = is_array($registrations) ? array_values($registrations) : [];
        $userId = (int)$user['id'];
        $next = [];
        $found = false;
        foreach ($registrations as $registration) {
            if ((int)($registration['event_id'] ?? 0) === $eventId && (int)($registration['user_id'] ?? 0) === $userId) {
                $found = true;
                continue;
            }
            $next[] = $registration;
        }

        if (!$found) {
            return ['success' => false, 'message' => '您未报名该活动', 'code' => 'registration_not_found'];
        }

        return [
            'success' => true,
            'message' => '已取消报名',
            'registrations' => array_values($next),
            'data' => array_values($next)
        ];
    });
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $action = $_GET['action'] ?? '';

    if ($action === 'registrations') {
        $registrations = readJsonFile($registrationFile, []);
        $registrations = is_array($registrations) ? array_values($registrations) : [];
        $eventId = isset($_GET['event_id']) ? (int)$_GET['event_id'] : 0;
        if ($eventId > 0) {
            $registrations = array_values(array_filter($registrations, function($registration) use ($eventId) {
                return (int)($registration['event_id'] ?? 0) === $eventId;
            }));
        }
        jsonResponse(['success' => true, 'registrations' => $registrations]);
    }

    $events = normalizeEventsPayload(readJsonFile($dataFile, ['events' => []]));
    if ($action === 'list') {
        jsonResponse(['success' => true, 'events' => $events]);
    }
    jsonResponse(['events' => $events]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_once __DIR__ . '/../includes/auth.php';
    $action = $_GET['action'] ?? '';
    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) $input = [];

    if ($action === 'add') {
        $authUser = requireAdmin();
        $result = addEventAtomic($dataFile, $input);
        if (($result['success'] ?? false) && isset($result['event'])) {
            projectHubUpsertActivityProjectFromEvent($result['event'], $authUser);
        }
        jsonResponse($result);
    }

    if ($action === 'update') {
        $authUser = requireAdmin();
        $eventId = (int)($input['event_id'] ?? 0);
        if ($eventId <= 0) {
            jsonResponse(['success' => false, 'message' => '缺少活动 ID', 'code' => 'event_id_required']);
        }
        $result = updateEventAtomic($dataFile, $eventId, $input);
        if (($result['success'] ?? false) && isset($result['event'])) {
            projectHubUpsertActivityProjectFromEvent($result['event'], $authUser);
        }
        jsonResponse($result);
    }

    if ($action === 'delete') {
        requireAdmin();
        $eventId = (int)($input['event_id'] ?? 0);
        if ($eventId <= 0) {
            jsonResponse(['success' => false, 'message' => '缺少活动 ID', 'code' => 'event_id_required']);
        }
        $result = deleteEventAtomic($dataFile, $eventId);
        if (($result['success'] ?? false)) {
            projectHubArchiveActivityProjectByEventId($eventId);
        }
        jsonResponse($result);
    }

    // Compatibility path for old admin screens. This never deletes existing events.
    if (isset($_GET['action']) && $_GET['action'] === 'replace') {
        requireAdmin();
        $incomingEvents = is_array($input['events'] ?? null) ? $input['events'] : [];
        jsonResponse(replaceEventsCompat($dataFile, $incomingEvents));
    }

    if ($action === 'register') {
        $user = requireLogin();
        $eventId = (int)($input['event_id'] ?? 0);
        if ($eventId <= 0) {
            jsonResponse(['success' => false, 'message' => '缺少活动 ID', 'code' => 'event_id_required']);
        }
        jsonResponse(registerEventAtomic($registrationFile, $eventId, $user));
    }

    if ($action === 'unregister') {
        $user = requireLogin();
        $eventId = (int)($input['event_id'] ?? 0);
        if ($eventId <= 0) {
            jsonResponse(['success' => false, 'message' => '缺少活动 ID', 'code' => 'event_id_required']);
        }
        jsonResponse(unregisterEventAtomic($registrationFile, $eventId, $user));
    }
}

jsonResponse(['success' => false, 'message' => '不支持的请求方法', 'code' => 'unsupported_method']);
?>
