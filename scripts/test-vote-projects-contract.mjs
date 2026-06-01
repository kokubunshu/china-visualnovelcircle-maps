import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const core = read('includes/vote_projects.php');
const stagesApi = read('api/vote_stages.php');
const votesApi = read('api/vote_votes.php');
const matchesApi = read('api/vote_matches.php');
const managerJs = read('js/club-project-manager.js');
const moeJs = read('js/moe-contest.js');
const twelveJs = read('js/twelve-contest.js');

[
  'vote_flow_runs',
  'vote_flow_pools',
  'vote_flow_pool_entries',
  'vote_flow_results',
  'vote_flow_matches',
  'vote_flow_events',
].forEach((table) => {
  assert.ok(core.includes(table), `new post-nomination flow should define ${table}`);
});

assert.ok(core.includes('function voteFlowRebuildFromNominationAndOpen'), 'core should expose one atomic nomination-to-qualifier command');
assert.ok(core.includes('bool $forceRebuild = false'), 'atomic rebuild should default to idempotent reuse');
assert.ok(core.includes('voteFlowPoolForStage($db, (int)$qualifier'), 'atomic rebuild should check for an existing qualifier flow pool');
assert.ok(core.includes("'existing' => true"), 'atomic rebuild should report when it reused an existing qualifier pool');
assert.ok(core.includes("entry_status = 'approved'"), 'atomic rebuild should only read approved nominations');
assert.ok(core.includes('voteFlowSeedPoolEntries($db, $pool, $entryIds'), 'atomic rebuild should seed vote_flow_pool_entries');
assert.ok(core.includes('voteFlowPoolEntryCount($db, (int)$pool'), 'atomic rebuild should read back the generated flow pool');
assert.ok(core.includes('FLOW_POOL_READBACK_MISMATCH'), 'atomic rebuild should fail if seeded and readback counts diverge');
assert.ok(core.includes("UPDATE vote_flow_pools SET status = 'open'"), 'atomic rebuild should open the qualifier pool in the same transaction');
assert.ok(core.includes("UPDATE vote_stages SET status = 'open'"), 'atomic rebuild should open the qualifier stage in the same transaction');
assert.ok(core.includes("UPDATE vote_flow_runs SET status = 'archived'"), 'rebuild should archive the previous active flow run');
assert.ok(core.includes("eventType") || core.includes('rebuild_from_nomination_and_open'), 'atomic rebuild should write a flow event');

assert.ok(stagesApi.includes("case 'rebuild_from_nomination_and_open'"), 'stage API should expose rebuild_from_nomination_and_open');
assert.ok(stagesApi.includes('voteFlowRebuildFromNominationAndOpen($db, $project'), 'stage API should call the atomic flow command');
assert.ok(stagesApi.includes('force_rebuild'), 'stage API should require an explicit force flag for rebuilds');
assert.ok(stagesApi.includes("'readback_count'"), 'stage API should return readback_count');
assert.ok(stagesApi.includes("'pool_id'") && stagesApi.includes("'stage_id'"), 'stage API should return pool and stage identifiers');
assert.ok(stagesApi.includes("'qualifier_stage_id'"), 'stage API should return the qualifier stage id');
assert.ok(stagesApi.includes("case 'advance_from_nomination'"), 'legacy one-click action should remain compatible');
assert.ok(stagesApi.includes("case 'flow_status'"), 'stage API should expose flow_status');
assert.ok(stagesApi.includes("case 'stage_entries'"), 'stage API should expose stage_entries');
assert.ok(stagesApi.includes("'pool_status' => 'missing'"), 'stage_entries should clearly report a missing flow pool');
assert.ok(stagesApi.includes('阶段池尚未生成，请联系负责人'), 'empty flow pools should have an explicit operator-facing message');
assert.ok(stagesApi.includes("'code' => 'STAGE_POOL_NOT_GENERATED'"), 'ordinary open should reject post-nomination stages without a flow pool');
assert.ok(stagesApi.includes("($stage['stage_type'] ?? '') !== 'nomination'"), 'ordinary open should only allow nomination stages without a flow pool');

const missingPoolIndex = stagesApi.indexOf("'pool_status' => 'missing'");
const oldStageEntryFallbackIndex = stagesApi.indexOf('FROM vote_stage_entries vse');
assert.ok(missingPoolIndex >= 0, 'stage_entries should include a missing flow-pool response');
assert.ok(oldStageEntryFallbackIndex === -1 || missingPoolIndex < oldStageEntryFallbackIndex, 'stage_entries should return the flow-pool missing response before any legacy stage-entry fallback can run');

assert.ok(votesApi.includes('vote_flow_pool_entries'), 'public voting should validate candidates against flow pool entries');
assert.ok(votesApi.includes('vote_flow_matches'), 'match voting should validate candidates against flow matches');
assert.ok(votesApi.includes("'match_results'") && votesApi.includes('slot_a_votes') && votesApi.includes('slot_b_votes'), 'results API should expose per-match vote counts');
assert.ok(votesApi.includes('result_visibility'), 'results API should return result visibility for frontend display rules');
assert.ok(matchesApi.includes('voteFlowGenerateMatches'), 'moe match generation should use flow pools');
assert.ok(matchesApi.includes('voteFlowSettleMatch'), 'moe match settling should use flow matches');
assert.ok(matchesApi.includes("case 'settle_by_votes'"), 'match API should support manager-triggered vote-count settlement');
assert.ok(matchesApi.includes("status = 'open'"), 'vote-count settlement should only process open matches');
assert.ok(core.includes('voteFlowOpenNextReadyMatches') && core.includes("status = 'open'"), 'flow matches should open the next ready round after settlement');
assert.ok(core.includes('voteFlowRankRowsForPool') && core.includes('group_advance_count'), 'flow settlement should support grouped qualifier advancement');
assert.ok(core.includes('generate_final_matches'), 'moe final generation should create explicit champion and third-place matches');

assert.ok(managerJs.includes("action=rebuild_from_nomination_and_open"), 'manager should call the atomic rebuild-and-open API');
assert.ok(managerJs.includes('rebuildFlowInFlight'), 'manager should ignore repeated rebuild clicks while a request is in flight');
assert.ok(managerJs.includes('boundRebuildFlow'), 'manager should prevent duplicate rebuild button bindings');
assert.ok(managerJs.includes('seeded !== readback') && managerJs.includes('seeded !== entries.length'), 'manager should verify backend write count against frontend read count');
assert.ok(managerJs.includes('海选池生成异常'), 'manager should surface count mismatches instead of pretending success');
assert.ok(managerJs.includes('生成海选池并打开海选'), 'manager should expose the one-click nomination-to-qualifier action');
assert.equal((managerJs.match(/function renderPoolContent\(/g) || []).length, 1, 'manager should keep a single active pool renderer');
assert.ok(!managerJs.includes('copy.entry_id = Number(entry.id)'), 'manager should not hydrate qualifier entries from nominations on the client');
assert.ok(!managerJs.includes('[data-advance-from-nomination]'), 'manager should not bind the deprecated nomination advancement button');
assert.ok(!managerJs.includes('function advanceFromNomination'), 'manager should not keep the deprecated nomination advancement function');
assert.ok(managerJs.includes('action=flow_status'), 'manager should refresh flow_status after operations');
assert.ok(managerJs.includes('loadStageEntries(qualifierId)'), 'manager should reread stage_entries after generation');

assert.ok(moeJs.includes('moe_stages.php?action=stage_entries'), 'moe page should read candidates from stage_entries compatibility API');
assert.ok(twelveJs.includes('twelve_rounds.php?action=stage_entries'), 'twelve page should read candidates from stage_entries compatibility API');
assert.ok(moeJs.includes('moe_votes.php?action=results'), 'moe page should load vote statistics');
assert.ok(twelveJs.includes('twelve_votes.php?action=results'), 'twelve page should load vote statistics');
assert.ok(twelveJs.includes('renderScoreVoting') && twelveJs.includes('tw-score-input') && twelveJs.includes('payload.scores'), 'twelve page should support top-N score voting with score payloads');
assert.ok(twelveJs.includes('最终十二器排行榜') && twelveJs.includes('rows = rows.slice(0, 12)'), 'twelve final results should render a top-12 leaderboard');
assert.ok(!twelveJs.includes('vote_matches.php?action=list'), 'twelve page should not use bracket match APIs');
assert.ok(moeJs.includes('currentOpenRoundMatches') && moeJs.includes("m.status === 'open'") && moeJs.includes('matchHasBothSlots'), 'moe bracket page should vote only on the current open round with complete slots');
assert.ok(moeJs.includes('请选择本轮全部对阵') && moeJs.includes('requiredMatches.length'), 'moe bracket submit should require only the current round');
assert.ok(moeJs.includes('renderReadonlyMatchSummary'), 'moe bracket page should show settled and future matches as a read-only schedule');
assert.ok(managerJs.includes('allowedVoteModesForStage'), 'manager stage editor should restrict vote modes by stage type');
assert.ok(managerJs.includes('live_votes') && managerJs.includes('after_event'), 'manager stage editor should expose all result visibility options');
assert.ok(managerJs.includes('settle_by_votes'), 'manager should expose vote-count match settlement');
assert.ok(managerJs.includes('loadMoeMatchesForStages') && managerJs.includes("stage.stage_type === 'final'"), 'manager should load bracket and final match lists for the active workbench stage');
assert.ok(managerJs.includes('lastSettleIssues') && managerJs.includes('平票/缺槽'), 'manager should surface unresolved match settlement issues');
assert.ok(managerJs.includes('mfEndsAt') && managerJs.includes('startTimedSettlePolling') && managerJs.includes('setInterval(checkTimedSettle, 45000)'), 'manager should edit ends_at and poll for timed match settlement');
assert.ok(managerJs.includes('renderMoeAwardsFromResults') && managerJs.includes("club_moe_king.php?action=set"), 'manager should fill final awards from results and sync champion to moe king');
assert.ok(votesApi.includes('score_avg DESC, votes DESC'), 'results API should order live score stages by average score before vote count');
assert.ok(moeJs.includes('阶段池尚未生成，请联系负责人') || moeJs.includes('闃舵姹犲皻鏈敓鎴愶紝璇疯仈绯昏礋璐ｄ汉'), 'moe page should explain missing pools');
assert.ok(twelveJs.includes('阶段池尚未生成，请联系负责人') || twelveJs.includes('闃舵姹犲皻鏈敓鎴愶紝璇疯仈绯昏礋璐ｄ汉'), 'twelve page should explain missing pools');

console.log('stable vote flow contract checks passed');
