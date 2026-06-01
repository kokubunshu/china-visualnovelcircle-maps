import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const growthApi = read('api/growth.php');
const growthLib = read('includes/growth.php');
const sharePage = read('club_share.html');
const userPage = read('user.html');
const botApi = read('api/bot.php');
const clubsApi = read('api/clubs.php');

assert(growthApi.includes("case 'club_summary'"), 'growth API exposes club_summary');
assert(growthApi.includes("case 'owner_dashboard'"), 'growth API exposes owner_dashboard');
assert(growthApi.includes('growthRecordAnalytics($event'), 'growth API records lightweight events');
assert(growthLib.includes('growthBuildClubSummary'), 'growth helper builds share summaries');
assert(growthLib.includes('growthRecordAnalytics'), 'growth helper records analytics');
assert(growthLib.includes('visible_by_default'), 'growth helper respects contact visibility');
assert(growthLib.includes('protected'), 'growth helper respects protected clubs');
assert(!growthLib.includes('REMOTE_ADDR'), 'growth analytics does not store request IPs');
assert(!growthLib.includes('HTTP_USER_AGENT'), 'growth analytics does not store user agents');

assert(sharePage.includes('api/growth.php?action=club_summary'), 'club share page loads growth summary');
assert(sharePage.includes('club_share_copy'), 'club share page records copy intent');
assert(sharePage.includes('data-i18n-lang'), 'club share page keeps language controls');

assert(userPage.includes('ownerGrowthPanel'), 'user center has owner growth panel');
assert(userPage.includes('ownerGrowthList'), 'user center has owner growth list');
assert(userPage.includes('owner_dashboard'), 'user center loads owner dashboard API');
assert(userPage.includes('data-copy-share'), 'user center can copy share links');

assert(botApi.includes("'club_share'"), 'bot API exposes club_share action');
assert(botApi.includes("'club_activity'"), 'bot API exposes club_activity action');
assert(botApi.includes('share_url'), 'bot API includes share URLs');
assert(botApi.includes('growthAnalyticsSummary'), 'bot stats include growth analytics');

assert(clubsApi.includes('dynamic_summary'), 'clubs API includes public dynamic summary');
assert(clubsApi.includes('public_contact'), 'clubs API exposes public contact field only');

console.log('PASS: growth contract checks passed');
