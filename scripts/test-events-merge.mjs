import { readFileSync } from 'fs';

const source = readFileSync(new URL('../api/events.php', import.meta.url), 'utf8');

const requiredSnippets = [
  'function withLockedJsonFile',
  'flock($handle, LOCK_EX)',
  'function addEventAtomic',
  'function updateEventAtomic',
  'function deleteEventAtomic',
  "action']) && $_GET['action'] === 'replace'",
  '$existingEvents',
  '$incomingEvents',
  '$merged',
  '$duplicateKey',
  "'code' => 'duplicate_event'",
  "'code' => 'invalid_date_range'",
];

for (const snippet of requiredSnippets) {
  if (!source.includes(snippet)) {
    throw new Error(`events.php is missing merge protection snippet: ${snippet}`);
  }
}

const forbiddenPatterns = [
  'file_put_contents($dataFile',
  'file_put_contents($registrationFile',
];

for (const pattern of forbiddenPatterns) {
  if (source.includes(pattern)) {
    throw new Error(`events.php should not use unlocked writes: ${pattern}`);
  }
}

console.log('events merge protection test passed');
