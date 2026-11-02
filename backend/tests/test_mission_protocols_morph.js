'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const Database = require('better-sqlite3');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const collective = require('../src/services/collectiveStateService');
const fixture = require('./helpers/missionProtocolsMorphFixture');

async function main() {
  const input = await fixture.create();
  try {
    const result = await require('../src/services/morphogenesis/morphogenesisGitService').executeVersionedTransition(input);
    assert.equal(result.receipt.committed, true, JSON.stringify(result));
    assert.equal(result.receipt.protocol.status, 'finalized', JSON.stringify(result.receipt));
    assert.ok(result.commit.id);
    const saved = await input.db.get("SELECT value FROM collective_state WHERE key='collective_state_v1'");
    const graph = collective.deserializeState(saved.value);
    assert.equal(graph.topologyState.organization, 'rhizome');
    assert.equal(graph.agents.get(input.agentId).role, 'verifier');
    const folder = path.join(`${input.filename}.protocols`, `morph-${digest([input.req.tenant, input.missionId]).slice(7)}`);
    const db = new Database(path.join(folder, 'coordinator.sqlite'));
    try {
      const events = db.prepare('SELECT message FROM morph_coordinator_events ORDER BY sequence').all().map(row => JSON.parse(row.message));
      assert.deepEqual(events.map(event => event.type), ['PROPOSE', 'QUIESCE', 'CHECKPOINT', 'PREPARE', 'READY', 'COMMIT', 'FINALIZE']);
      const decision = JSON.parse(db.prepare('SELECT body FROM morph_coordinator_decisions').get().body);
      assert.equal(decision.decision, 'COMMIT');
      assert.equal(decision.targetVersion, graph.currentMorphologyVersion);
    } finally { db.close(); }
    const row = await input.db.get('SELECT status,authority_json FROM morphogenesis_transition_snapshots');
    assert.equal(row.status, 'committed');
    assert.equal(JSON.parse(row.authority_json).decision, 'APPLY', 'actual Rust admission remains required');
    console.log('Mission MORPH actual Rust admission, durable 2PC, native AgentGit and persisted graph mutation: PASS');
  } finally { await input.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
