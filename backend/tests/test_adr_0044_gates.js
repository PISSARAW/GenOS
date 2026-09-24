'use strict';

// ADR 0044 — matrice d'autorité unifiée, gate provenance, incertitude d'observabilité.

const assert = require('assert');
const matrix = require('../src/services/authorityMatrixService');
const gate = require('../src/services/highImpactProvenanceGateService');
const uncertainty = require('../src/services/observabilityUncertaintyService');

function check(name, condition) {
  assert.ok(condition, name);
  console.log(`ok - ${name}`);
}

// 1. Matrice : 8 phénotypes spec canoniques.
const canonical = [
  'ScoutCell', 'BoundedWorker', 'AdaptiveWorker', 'Specialist',
  'Verifier', 'SubOrchestrator', 'Orchestrator', 'ResidentDaemon'
];
for (const id of canonical) {
  check(`matrix knows ${id}`, matrix.resolveCanonical(id) === id);
}
check('matrix denies ScoutCell topology', matrix.can('ScoutCell', 'topology') === false);
check('matrix signals ScoutCell', matrix.can('ScoutCell', 'signal') === true);
check('matrix local strategy AdaptiveWorker', matrix.can('AdaptiveWorker', 'strategy') === true);
check(
  'matrix denies SubOrchestrator global topology',
  matrix.can('SubOrchestrator', 'topology') === false
);
check('matrix grants Orchestrator topology', matrix.can('Orchestrator', 'topology') === true);
check('matrix denies daemon write', matrix.can('ResidentDaemon', 'write') === false);
check('matrix supports canonical red worker kind', matrix.can('red_worker', 'execute') === true);
check('creative worker cannot execute tools', matrix.can('creative_worker', 'execute') === false);
check('specialist worker kind cannot write', matrix.can('specialist', 'write') === false);
check('resident daemon may use bounded probe tools', matrix.can('resident_daemon', 'execute') === true);
check('metadata worker kind enforces creative read-only profile', matrix.validateAction({ metadata_json: '{"workerKind":"creative_worker"}' }, 'execute').allowed === false);

// 2. Aliases legacy résolus, inconnus rejetés.
check('alias adaptive_worker', matrix.resolveCanonical('adaptive_worker') === 'AdaptiveWorker');
check('alias strategist', matrix.resolveCanonical('strategist') === 'SubOrchestrator');
check('alias elder', matrix.resolveCanonical('elder') === 'Orchestrator');
check('unknown rejected', matrix.resolveCanonical('nope') === null);
check('unknown denied', matrix.can('nope', 'read') === false);

// 3. Gate provenance universel.
check('low-impact allow', gate.gate({ action: 'read', risk: 'LOW' }).verdict === 'ALLOW');
check(
  'topology without provenance reviewed',
  gate.gate({ action: 'topology', risk: 'LOW' }).verdict === 'HUMAN_REVIEW'
);
check(
  'topology with provenance allowed',
  gate.gate({
    action: 'topology', risk: 'LOW', provenanceHash: 'abc', evidenceRefs: ['e1']
  }).verdict === 'ALLOW'
);
check(
  'high risk without provenance reviewed',
  gate.gate({ action: 'write', risk: 'HIGH' }).verdict === 'HUMAN_REVIEW'
);

// 4. Incertitude d'observabilité monotone et bornée.
const full = uncertainty.coverageFromHealth({ delivered: 100 });
const partial = uncertainty.coverageFromHealth({ delivered: 50, dropped: 50 });
check('full coverage is 1', full === 1);
check('partial coverage is 0.5', partial === 0.5);
const base = 0.2;
const inflated = uncertainty.inflateUncertainty({
  base, health: { delivered: 50, dropped: 50 }
});
check('missing telemetry inflates', inflated > base);
check('inflated bounded', inflated <= 1 && inflated >= 0);
check(
  'no signal keeps base',
  uncertainty.inflateUncertainty({ base, health: {} }) === base
);

console.log('adr-0044-gates: all checks passed');
