import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const userPages = [
  'index.html',
  'submit.html',
  'feedback.html',
  'user.html',
  'club_share.html',
  'club_square.html',
  'admin/club_project_manager.html',
  'star_map.html',
  'submit_event.html',
  'submit_publication.html',
  'wiki/index.html',
];

const attrPattern = /\b(?:href|src)=["']([^"']+)["']/gi;
const missing = [];

function isLocalReference(value) {
  if (!value || value === '#') return false;
  if (value.startsWith('#')) return false;
  if (/^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(value)) return false;
  return true;
}

function stripUrlSuffix(value) {
  return value.split('#')[0].split('?')[0];
}

for (const page of userPages) {
  const pagePath = path.join(root, page);
  assert.ok(fs.existsSync(pagePath), `${page} should exist`);
  const html = fs.readFileSync(pagePath, 'utf8');
  const pageDir = path.dirname(pagePath);

  for (const match of html.matchAll(attrPattern)) {
    const rawRef = match[1].trim();
    if (!isLocalReference(rawRef)) continue;
    const cleanRef = stripUrlSuffix(rawRef);
    if (!cleanRef) continue;
    const resolved = path.resolve(pageDir, cleanRef);
    if (!resolved.startsWith(root)) continue;
    if (!fs.existsSync(resolved)) {
      missing.push(`${page} -> ${rawRef}`);
    }
  }
}

assert.deepEqual(missing, [], `Missing local user-page assets:\n${missing.join('\n')}`);
console.log('user page asset checks passed');
