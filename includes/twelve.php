<?php
// includes/twelve.php - compatibility aliases for the shared vote project core.

require_once __DIR__ . '/vote_projects.php';

const TWELVE_CONTEST_STATUSES = VOTE_PROJECT_STATUSES;
const TWELVE_ROUND_STATUSES = VOTE_STAGE_STATUSES;
const TWELVE_ELIGIBILITY_MODES = VOTE_ELIGIBILITY_MODES;
const TWELVE_RESULT_VISIBILITIES = VOTE_RESULT_VISIBILITIES;
const TWELVE_VISIBILITIES = VOTE_VISIBILITIES;
const TWELVE_WORK_STATUSES = ['pending', 'approved', 'rejected', 'removed'];
const TWELVE_TIE_RULES = ['same_rank', 'created_order', 'manual_review'];

function twelveRespond(array $payload, int $status = 200): void { voteRespond($payload, $status); }
function twelveReadJson(): array { return voteReadJson(); }
function twelveEnsureSchema(?PDO $db = null): void { voteEnsureSchema($db); }
function twelveNormalizeCountry($value): string { return voteNormalizeCountry($value); }
