const assert = require('node:assert/strict');
const { getDatabase, closeDatabase, withTransaction } = require('../src/db');
const state = require('../src/services/organismPersistedState');
const turns = require('../src/services/organismModelTurns');

async function main() {
  process.env.GENOS_ADMIN_PASSWORD ||= 'OrganismSnapshotTestOnly-2026!';
  const db = await getDatabase(':memory:');
  const scope = { clause: 'w.organization_id IS NULL AND w.project_id IS NULL', params: [] };
  try {
    await db.run("INSERT INTO agents (id, name, role, status) VALUES ('snapshot-agent', 'Source', 'Solver', 'idle')");
    await db.run("INSERT INTO agents (id, name, role, status) VALUES ('snapshot-peer', 'Peer', 'Solver', 'idle')");
    await db.run("INSERT INTO episodic_memories (id, agent_id, action_input) VALUES ('snapshot-memory', 'snapshot-agent', 'before')");
    await db.run("INSERT INTO autobiographical_episodes (id, agent_id, kind) VALUES ('snapshot-episode', 'snapshot-agent', 'observation')");
    await db.run("INSERT INTO agent_self_models (agent_id, self_model_json) VALUES ('snapshot-agent', '{\"self\":1}')");
    await db.run("INSERT INTO genome_decisions (id, title, content, created_by) VALUES ('snapshot-decision', 'Decision', 'before', 'snapshot-agent')");
    await db.run("INSERT INTO memory_synapses (source_id, target_id) VALUES ('snapshot-decision', 'snapshot-decision')");
    await db.run("INSERT INTO agent_relations (id, source_agent_id, target_agent_id) VALUES ('snapshot-relation', 'snapshot-agent', 'snapshot-peer')");
    await db.run("INSERT INTO agent_runtime_state (id, agent_id, state_json) VALUES ('snapshot-runtime', 'snapshot-agent', '{\"cursor\":1}')");
    await db.run("INSERT INTO telemetry_events (event_id, agent_id, event_type, action, payload_json) VALUES ('event-1', 'snapshot-agent', 'AGENT_STEP', 'EXECUTE', '{}')");
    const turn = await turns.begin({ db, agentId: 'snapshot-agent', prompt: 'Visible request', model: 'test-model' });
    await turns.complete(db, turn, { text: 'Visible response', model: 'test-model' });

    const captured = await withTransaction(db, () => state.capture(db, 'snapshot-agent', scope));
    assert.equal(state.verify(captured), true);
    assert.equal(captured.sections.modelTurns.length, 1);
    assert.equal(captured.sections.autobiographicalEpisodes.length, 1);
    assert.equal(captured.sections.selfModels.length, 1);
    assert.equal(captured.sections.runtimeCursor.event_id, 'event-1');
    assert.equal(captured.sections.modelTurns[0].status, 'completed');
    assert.equal(captured.sections.relations.length, 1);
    await db.run("UPDATE episodic_memories SET action_input = 'after' WHERE id = 'snapshot-memory'");
    await db.run("UPDATE agent_relations SET familiarity = 9 WHERE id = 'snapshot-relation'");
    await withTransaction(db, () => state.restore(db, 'snapshot-agent', { payload: captured, scope }));
    assert.equal((await db.get("SELECT action_input FROM episodic_memories WHERE id = 'snapshot-memory'")).action_input, 'before');
    assert.equal((await db.get("SELECT familiarity FROM agent_relations WHERE id = 'snapshot-relation'")).familiarity, 0);

    const forged = structuredClone(captured);
    forged.sections.memories[0].agent_id = 'snapshot-peer';
    forged.hash = state.digest(forged.sections);
    await assert.rejects(() => state.restore(db, 'snapshot-agent', { payload: forged, scope }), /owner mismatch/);
    await db.run("UPDATE telemetry_events SET event_type = 'TAMPERED' WHERE event_id = 'event-1'");
    await assert.rejects(() => state.restore(db, 'snapshot-agent', { payload: captured, scope }), /cursor is missing or changed/);
    console.log('Organism persisted sections and model context passed.');
  } finally {
    await closeDatabase();
  }
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
