const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

(async () => {
  const session = await syncytium.createSession('Maintain a shared state with continuous sync and invariant checks.');
  assert.equal(session.members.length, 4);
  assert.equal(session.organization, 'memory_compilation');
  assert.ok(session.capabilityContract.required.includes('CRDT_SHARED_STATE'));
  assert.ok(session.capabilityContract.required.includes('SIGNALING_BUS'));

  const inserted = await syncytium.applyOperation(session.sessionId, {
    agentId: 'w1', role: 'shared_state_coordinator', kind: { type: 'insert_text', index: 0, text: 'hello syncytium' }
  });
  assert.equal(inserted.snapshot.textContent, 'hello syncytium');
  assert.equal(inserted.consistency.verdict, 'consistent');

  const invariant = await syncytium.applyOperation(session.sessionId, {
    agentId: 'w2', role: 'consistency_guardian', kind: { type: 'check_invariant', name: 'no_divergence', passed: false, error: 'stale state' }
  });
  assert.equal(invariant.consistency.verdict, 'divergent');
  assert.ok(invariant.consistency.failedInvariants.includes('no_divergence'));

  const flux = await syncytium.applyOperation(session.sessionId, {
    agentId: 'w3', role: 'parallel_executor', kind: { type: 'flux_Ca2+', deltaFlux: 2.5 }
  });
  assert.equal(flux.ion.ion, 'Ca2+');
  assert.ok(Number.isFinite(flux.ion.membranePotentialMv));

  const full = await syncytium.snapshot(session.sessionId);
  assert.ok(full.shared && full.cytoplasm && full.consistency);

  assert.equal(await syncytium.closeSession(session.sessionId), true);
  await assert.rejects(() => syncytium.snapshot(session.sessionId), (error) => error.code === 'SYNCYTIUM_SESSION_UNKNOWN');

  console.log('Syncytium wiring checks: PASS');
})().catch((error) => {
  console.error('Syncytium wiring test failed:', error);
  process.exit(1);
});
