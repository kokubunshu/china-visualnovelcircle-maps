import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const i18nPath = path.join(root, 'js', 'page-i18n.js');
assert.ok(fs.existsSync(i18nPath), 'page-i18n.js should exist');

const i18n = fs.readFileSync(i18nPath, 'utf8');
[
  'localStorage.getItem(STORAGE_KEY)',
  'language:changed',
  'MutationObserver',
  'VNFest ユーザーセンター',
  '個人星図観測台',
].forEach((marker) => {
  assert.ok(i18n.includes(marker), `page i18n should include ${marker}`);
});

[
  ['user.html', './js/page-i18n.js'],
  ['star_map.html', 'js/page-i18n.js'],
].forEach(([file, script]) => {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert.ok(html.includes(script), `${file} should load page-i18n.js`);
  assert.match(html, /data-i18n-lang="zh"[\s\S]*data-i18n-lang="ja"/, `${file} should expose zh/ja language controls`);
});

console.log('page i18n contract tests passed');
