'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'p1-bridge-test-only';
const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const fixture = require('./fixtures/pairedReplayRunner.cjs');
const causal = require('../src/services/proceduralCausalExperimentService');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const bridge = require('../src/services/gvxPairedReplayBridge');
const gvxFixture = require('./fixtures/gvxExperimentManifest.cjs');
const verifiers = require('../src/services/gvxVerifierRegistry');

function input(row) {
  const value = gvxFixture.input();
  value.experimentId = 'gvx-paired-bridge';
  value.scope = { organizationId: fixture.scope.organizationId, projectId: fixture.scope.projectId };
  value.entityId = fixture.scope.entityId;
  value.snapshotHash = JSON.parse(row.snapshot_hashes_json)['paired-snapshot'];
  value.controls = { model: `procedural:${row.runner_id}`, toolsetHash: row.runner_hash,
    environmentHash: row.environment_hash };
  for (const arm of value.experimentDesign.arms) arm.snapshotHash = value.snapshotHash;
  return value;
}

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    fixture.register();
    await migrateGvxLedger(db);
    await causal.createExperiment(db, fixture.spec());
    const row = await causal.loadExperiment(db, fixture.spec().experimentId);
    const artifacts = new Map();
    const options = { db, input: input(row), causalExperimentId: row.experiment_id,
      snapshotId: 'paired-snapshot', seed: 7, scope: fixture.scope,
      artifactWriter: async ({ bytes }) => {
        const artifactRef = verifiers.digest(bytes);
        artifacts.set(artifactRef, Buffer.from(bytes));
        return { artifactRef };
      }, artifactReader: async ({ artifactRef }) => artifacts.get(artifactRef) };
    const result = await bridge.run(options);
    assert.equal(result.assessment.status, 'ready_for_independent_review');
    assert.ok(Math.abs(result.diff.scoreDelta - 2) < 1e-12);
    assert.equal(result.semanticOracle, 'not_evaluated');
    assert.equal(result.runtimeAuthority, false);
    assert.equal(result.promotionAllowed, false);
    assert.equal(result.isolation, 'logical-state-only');
    const before = await db.get("SELECT COUNT(*) AS count FROM procedural_causal_fork_events WHERE event_type='RUN_RESULT'");
    const resumed = await bridge.run(options);
    assert.deepEqual(resumed, result);
    assert.deepEqual(await db.get("SELECT COUNT(*) AS count FROM procedural_causal_fork_events WHERE event_type='RUN_RESULT'"), before);
    await assert.rejects(bridge.run({ ...options, scope: { ...fixture.scope, projectId: 'foreign' } }),
      { code: 'CAUSAL_REPLAY_SCOPE_MISMATCH' });
    const changed = structuredClone(options.input);
    changed.controls.toolsetHash = 'a'.repeat(64);
    await assert.rejects(bridge.run({ ...options, input: changed }), { code: 'GVX_PAIRED_CONTROLS_MISMATCH' });
    const ref = result.outcomes[0].evidence[0].artifactRef;
    artifacts.set(ref, Buffer.from('tampered'));
    await assert.rejects(bridge.run(options), { code: 'GVX_PAIRED_ARTIFACT_CHANGED' });
    const forkId = result.diff.baselineForkId;
    const fork = await causal.loadFork(db, forkId);
    const event = fork.events.filter(item => item.event_type === 'RUN_RESULT').at(-1);
    const payload = structuredClone(event.payload);
    payload.replayObservation.samples[0].value += 0.2;
    await causal.recordEvent(db, { forkId, eventType: 'RUN_RESULT', stateHash: event.state_hash, payload });
    await assert.rejects(bridge.run(options), { code: 'CAUSAL_RANDOMNESS_PROOF_INVALID' });
    console.log('GVX nursery: real paired forks, manifest, replay, stable resume and current evidence refusal qualified.');
  } finally { await db.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
