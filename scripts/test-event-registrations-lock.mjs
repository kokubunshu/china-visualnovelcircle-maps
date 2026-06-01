import { readFileSync } from 'fs';

const source = readFileSync(new URL('../api/events.php', import.meta.url), 'utf8');

const requiredSnippets = [
  'function registerEventAtomic',
  'function unregisterEventAtomic',
  'withLockedJsonFile($registrationFile, []',
  "'code' => 'already_registered'",
  "'code' => 'registration_not_found'",
  "'registered_at' => date('Y-m-d H:i:s')",
  "return (int)($registration['event_id'] ?? 0) === $eventId",
];

for (const snippet of requiredSnippets) {
  if (!source.includes(snippet)) {
    throw new Error(`events.php is missing registration lock snippet: ${snippet}`);
  }
}

console.log('event registration locking test passed');
