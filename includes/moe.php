<?php
// includes/moe.php - compatibility aliases for the shared vote project core.

require_once __DIR__ . '/vote_projects.php';

const MOE_CONTEST_STATUSES = VOTE_PROJECT_STATUSES;
const MOE_STAGE_STATUSES = VOTE_STAGE_STATUSES;
const MOE_STAGE_TYPES = VOTE_STAGE_TYPES;
const MOE_ELIGIBILITY_MODES = VOTE_ELIGIBILITY_MODES;
const MOE_RESULT_VISIBILITIES = VOTE_RESULT_VISIBILITIES;

function moeRespond(array $payload, int $status = 200): void { voteRespond($payload, $status); }
function moeReadJson(): array { return voteReadJson(); }
function moeEnsureSchema(?PDO $db = null): void { voteEnsureSchema($db); }
function moeNormalizeCountry($value): string { return voteNormalizeCountry($value); }
