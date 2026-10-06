'use strict';
const assert = require('node:assert/strict');
const fixture = require('./capability_runtime_fixture');
const spiral = require('../src/services/morphogenesis/capabilities/spiralRuntime');
const store = require('../src/services/morphogenesis/capabilities/capabilityEvidenceStore');
const policy = require('../src/services/morphogenesis/capabilities/unblockSpiral');

async function run(db) {
  const scope = fixture.scoped(db, 'MISSION:spiral');
  const evidenceRef = await fixture.proof(db, scope.scopeId, { cause: 'slow query' });
  const base = { initialState: 'snapshot', hypothesis: 'index', family: 'sql', scale: 'function',
    intervention: 'rewrite-query', verifierId: 'reviewer', evidenceRefs: [evidenceRef] };
  assert.equal(policy.signature({ ...base, intervention: { tool: 'sql', action: 'index' } }),
    policy.signature({ ...base, intervention: { action: 'index', tool: 'sql' } }));
  let restored = 0;
  const adapters = { snapshot: async () => 'snapshot', execute: async () => ({ measured: 0 }),
    verify: async ({ contract }) => ({ artifactRef: await fixture.artifacts.put(db, {
      scopeId: scope.scopeId, kind: 'intervention-verification', content: {
        signature: policy.signature(contract), verifierId: contract.verifierId, status: 'VERIFIED_FAILURE' } }) }),
    restore: async () => { restored++; } };
  const input = { ...scope, authorize: async () => true, candidates: [base], attemptId: 'z-first' };
  assert.equal((await spiral.runAttempt(db, input, adapters)).outcomeStatus, 'VERIFIED_FAILURE');
  assert.equal(restored, 1);
  assert.equal((await spiral.plan(db, input)).permitted, false);
  const wide = { ...base, family: 'schema', scale: 'module' };
  assert.equal((await spiral.plan(db, { ...scope, candidates: [wide] })).permitted, false);
  await spiral.runAttempt(db, { ...input, attemptId: 'a-second', candidates: [{ ...base, family: 'index' }] }, adapters);
  const history = await store.loadAttempts(db, scope.scopeId);
  assert.equal(history[0].attemptId, 'z-first');
  assert.equal((await spiral.plan(db, { ...scope, candidates: [wide] })).permitted, true);
  await recenterChecks(db, { ...scope, history, evidenceRef, base, wide });
  const denied = await spiral.runAttempt(db, { ...input, attemptId: 'denied', candidates: [wide], authorize: async () => false }, adapters);
  assert.equal(denied.reason, 'INTERVENTION_UNAUTHORIZED');
  await assert.rejects(spiral.runAttempt(db, { ...input, attemptId: 'interrupted', candidates: [wide] }, {
    ...adapters, execute: async () => { throw new Error('interrupted'); }
  }), /interrupted/);
  assert.equal(restored, 3);
  assert.equal((await spiral.plan(db, { ...scope, candidates: [{ ...wide, family: 'cache' }] })).reason, 'UNFINISHED_OR_UNRESOLVED_ATTEMPT');
  assert.equal(policy.scaleLimit({ attempts: history, newEvidence: true }).reason, 'VERIFIED_STAGNATION');
}
module.exports = run;

async function recenterChecks(db, input) {
  const recenterEvidenceRef = await fixture.artifacts.put(db, { scopeId: input.scopeId,
    kind: 'spiral-context-verification', content: { status: 'VERIFIED', verifierId: 'context-reviewer',
      previousAttemptId: input.history.at(-1).attemptId, newInitialState: 'new-snapshot', evidenceRefs: [input.evidenceRef] } });
  const candidate = { ...input.base, initialState: 'new-snapshot', family: 'new-evidence', scale: 'parameter' };
  const result = await spiral.plan(db, { ...input, recenterEvidenceRef, contextVerifierId: 'context-reviewer',
    candidates: [candidate, { ...input.wide, initialState: 'new-snapshot' }] });
  assert.equal(result.limit.maxScaleIndex, 1);
  assert.equal(result.limit.reason, 'RECENTER_ON_NEW_VERIFIED_CONTEXT');
  assert.equal(result.candidate.scale, 'parameter');
  assert.ok(result.candidate.evidenceRefs.includes(recenterEvidenceRef));
  await assert.rejects(spiral.plan(db, { ...input, candidates: [candidate], recenterEvidenceRef: input.evidenceRef }), /VERIFIED_RECENTER/);
}
