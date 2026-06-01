import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pages = [
  { file: 'vote.html', css: './css/vote-activity.css', js: './js/vote-activity.js' },
  { file: 'moe/index.html', css: '../css/vote-activity.css', js: '../js/vote-activity.js' },
  { file: 'moe/bracket.html', css: '../css/vote-activity.css', js: '../js/vote-activity.js' },
  { file: 'twelve/index.html', css: '../css/vote-activity.css', js: '../js/vote-activity.js' },
  { file: 'twelve/vote.html', css: '../css/vote-activity.css', js: '../js/vote-activity.js' },
];

const emojiPattern = /[\u{1F000}-\u{1FAFF}]/u;

const sharedCssPath = path.join(root, 'css', 'vote-activity.css');
const sharedJsPath = path.join(root, 'js', 'vote-activity.js');
assert.ok(fs.existsSync(sharedCssPath), 'shared voting activity CSS should exist');
assert.ok(fs.existsSync(sharedJsPath), 'shared voting activity wallpaper script should exist');

const sharedCss = fs.readFileSync(sharedCssPath, 'utf8');
const sharedJs = fs.readFileSync(sharedJsPath, 'utf8');
assert.match(sharedCss, /--activity-wallpaper-image/, 'shared CSS should define the wallpaper variable');
assert.match(sharedCss, /backdrop-filter/, 'shared CSS should provide translucent panel styling');
assert.match(sharedCss, /prefers-reduced-motion/, 'shared CSS should respect reduced motion');
assert.match(sharedJs, /api\/backgrounds\.php/, 'shared JS should load the built-in wallpaper library');
assert.match(sharedJs, /applyContestWallpaper/, 'shared JS should expose contest-cover wallpaper support');

for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page.file), 'utf8');
  assert.match(html, new RegExp(page.css.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${page.file} should load shared voting activity CSS`);
  assert.match(html, new RegExp(page.js.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${page.file} should load shared voting activity JS`);
  assert.doesNotMatch(html, /data-theme="dark"/, `${page.file} should not default to dark activity styling`);
  assert.doesNotMatch(html, emojiPattern, `${page.file} should not use emoji in visible voting activity UI`);
}

console.log('vote activity style contract tests passed');
