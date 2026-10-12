'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateMorphologyGraph } = require('../src/db/migrations/migrateMorphologyGraph');
const { createTopologyRegistry } = require('../src/services/morphogenesis/registry/topologyRegistry');
const gate = require('../src/services/morphogenesis/runtime/morphogenesisPersistedReadOnlyService');
const decisionStore = require('../src/services/morphogenesis/runtime/morphogenesisReadOnlyDecisionStore');
const { executeMorphology } = require('../bin/orchestratorMissionAux.cjs');

const morphology = { topology: 'trinity', variantId: 'controlled', agents: [{ role: 'architect' }] };

function fakeRust(args) {
  const hash = crypto.createHash('sha256').update(args[1]).digest('hex');
  if (args[0] === 'morphogenesis-propose') return Promise.resolve({ ok: true, json: {
    schemaVersion: 1, requestSha256: hash, committed: false,
    proposals: [{ resolver: 'EpistemicResolver', action: 'spawn_verifier',
      target: 'scope_courant', gain: 0.35, cost: 0.08 }]
  } });
  return Promise.resolve({ ok: true, json: {
    schemaVersion: 1, requestSha256: hash, decision: 'REJECTED',
    committed: false, commitAuthorized: false,
    plan: { decision_no_change: false, spawns: ['verifier'] },
    governance: { allowed: false, reason: 'insufficient authority' }
  } });
}

async function main() {
  const filename = path.join(os.tmpdir(), `genos-morphogenesis-${crypto.randomUUID()}.sqlite`);
  let db = await open({ filename, driver: sqlite3.Database });
  try {
    await migrateMorphologyGraph(db);
    const snapshotRef = await gate.persistPreparedMorphology({ db, missionId: 'mission-1', morphology });
    await db.close();
    db = await open({ filename, driver: sqlite3.Database });
    assert.equal(snapshotRef.topology, 'trinity');
    const topologies = createTopologyRegistry().list();
    assert.equal(topologies.length, 8);
    for (const topology of topologies) {
      const prepared = { topology, variantId: 'default', agents: [{ role: 'worker' }] };
      const ref = await gate.persistPreparedMorphology({ db,
        missionId: `mission-${topology}`, morphology: prepared });
      assert.ok(await gate.readBoundSnapshot(db, ref, prepared), topology);
    }
    const telemetry = [];
    const input = { db, missionId: 'mission-1', orchestratorId: 'agent-1', morphology,
      snapshotRef, outcome: { verdict: 'unverified', evidence: [] }, finalVerdict: 'unverified',
      runtime: { executeMorphology: async () => ({ decision: 'SHADOWED', committed: false }) },
      telemetry: { emitEvent: (event) => telemetry.push(event) },
      adjudicate: (options) => gate.adjudicatePersistedOutcome({ ...options, runner: fakeRust }) };
    const result = await executeMorphology(input);
    assert.equal(result.kernelReadOnly.decision, 'REJECTED');
    assert.equal(result.kernelReadOnly.proposalCount, 1);
    assert.ok(result.kernelReadOnly.receiptId);
    assert.equal(result.applied, false);
    assert.equal(telemetry[0].eventType, 'MORPHOGENESIS_PROPOSED');
    const row = await db.get('SELECT proposals_json FROM morphogenesis_read_only_proposals WHERE id = ?',
      result.kernelReadOnly.proposalRecordId);
    assert.equal(JSON.parse(row.proposals_json)[0].action, 'spawn_verifier');
    await db.close();
    db = await open({ filename, driver: sqlite3.Database });
    const readReceipt = () => decisionStore.readReadOnlyDecision({ db,
      id: result.kernelReadOnly.receiptId, missionId: 'mission-1', morphology, snapshotRef });
    assert.equal((await readReceipt()).decision, 'REJECTED');
    const source = await gate.readPersistedProposals(db, snapshotRef,
      result.kernelReadOnly.proposalRecordId);
    const storedDecision = await db.get('SELECT response_json FROM morphogenesis_read_only_decisions WHERE id = ?',
      result.kernelReadOnly.receiptId);
    const receiptCount = await db.get('SELECT COUNT(*) AS count FROM morphogenesis_read_only_decisions');
    await assert.rejects(decisionStore.recordReadOnlyDecision({ db, missionId: 'mission-1',
      morphology, snapshotRef, record: { ...source, id: crypto.randomUUID() },
      decision: JSON.parse(storedDecision.response_json) }), /could not be verified/);
    const countAfterRefusal = await db.get('SELECT COUNT(*) AS count FROM morphogenesis_read_only_decisions');
    assert.equal(countAfterRefusal.count, receiptCount.count, 'failed receipt verification must not leave an orphan row');
    await assert.rejects(db.run('UPDATE morphogenesis_read_only_decisions SET response_json = ? WHERE id = ?',
      '{}', result.kernelReadOnly.receiptId), /immutable/);
    await assert.rejects(db.run('DELETE FROM morphogenesis_read_only_decisions WHERE id = ?',
      result.kernelReadOnly.receiptId), /immutable/);

    if (process.env.GENOS_MORPHO_E2E === '1') {
      const real = await gate.adjudicatePersistedOutcome({ db, missionId: 'mission-1',
        morphology, snapshotRef, outcome: input.outcome });
      assert.equal(real.decision, 'REJECTED', JSON.stringify(real));
      assert.equal(real.proposalCount, 1);
      assert.equal(real.committed, false);
    }
    await assert.rejects(db.run('UPDATE morphogenesis_read_only_proposals SET proposals_json = ? WHERE id = ?',
      '[{"action":"forged"}]', result.kernelReadOnly.proposalRecordId), /immutable/);
    await assert.rejects(db.run('DELETE FROM morphogenesis_read_only_proposals WHERE id = ?',
      result.kernelReadOnly.proposalRecordId), /immutable/);
    assert.equal((await readReceipt()).decision, 'REJECTED');
    const mismatched = await gate.adjudicatePersistedOutcome({ db, missionId: 'other',
      morphology, snapshotRef, outcome: input.outcome });
    assert.equal(mismatched.reason, 'SNAPSHOT_MISSING_OR_MISSION_MISMATCH');
    await assert.rejects(db.run('UPDATE morphology_graph_versions SET graph_json = ? WHERE graph_id = ?',
      '{}', snapshotRef.graphId), /immutable/);
    await assert.rejects(db.run('DELETE FROM morphology_graph_versions WHERE graph_id = ?',
      snapshotRef.graphId), /immutable/);
    const stale = await gate.adjudicatePersistedOutcome({ db, missionId: 'mission-1',
      morphology, snapshotRef: { ...snapshotRef, snapshotSha256: '0'.repeat(64) }, outcome: input.outcome });
    assert.equal(stale.reason, 'SNAPSHOT_STALE_OR_MISMATCHED');
    console.log('Morphogenesis persisted public read-only gate: PASS');
  } finally {
    await db.close();
    fs.rmSync(filename, { force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
