const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getDatabase, closeDatabase } = require('./src/db');
const strategyContracts = require('./src/services/strategyContractService');
const { loadAgentDossier } = require('./src/services/agentDossierService');

async function run() {
  const dbPath = path.resolve(__dirname, 'agent-dossier-test.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);
  try {
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode, current_task) VALUES ('agent-root', 'DP Orchestrator', 'Programmer', 'idle', 'orchestrator', 'Solve knapsack')");
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode, parent_agent_id, lineage_relation) VALUES ('agent-child', 'DP Worker', 'Verifier', 'idle', 'worker', 'agent-root', 'autonomous_strategy_branch')");
    await strategyContracts.saveContract(db, { agentId: 'agent-root', problem: 'Solve a dynamic programming knapsack problem' });
    await db.run("INSERT INTO genome_decisions (id, title, content, created_by) VALUES ('decision-1', 'DP recurrence', 'Use the validated recurrence', 'agent-child')");
    await db.run("INSERT INTO telemetry_events (agent_id, event_type, action, detail, payload_json) VALUES ('agent-root', 'AGENT_RUNTIME_STARTED', 'START', 'Started', ?)", JSON.stringify({ autonomyPlan: { organization: 'network_silence' } }));
    await db.run("INSERT INTO telemetry_events (agent_id, event_type, action, detail, payload_json) VALUES ('agent-root', 'AGENT_CAPSULE_CREATED', 'CAPSULE', 'Created', ?)", JSON.stringify({ id: 'capsule-dp', genomeId: 'genome-dp' }));
    await db.run("INSERT INTO telemetry_events (agent_id, event_type, action, detail, payload_json) VALUES ('agent-child', 'EVIDENCE_REPORT', 'VERIFY', 'Verified recurrence', ?)", JSON.stringify({ claims: [{ statement: 'Optimal value is 42', evidence: ['tests pass'] }] }));
    await db.run("INSERT INTO telemetry_events (agent_id, event_type, action, detail, payload_json) VALUES ('agent-root', 'GENOME_MUTATION_COMPLETED', 'MUTATE', 'Selected stronger branch', '{}')");

    const dossier = await loadAgentDossier(db, 'agent-root');
    assert.equal(dossier.schema, 'genos.agent-dossier/v1');
    assert.equal(dossier.contract.contract.mission, 'Solve a dynamic programming knapsack problem');
    assert.equal(dossier.memory[0].agentId, 'agent-child');
    assert.equal(dossier.genome.decisions[0].title, 'DP recurrence');
    assert.equal(dossier.genome.runtimeCapsules[0].id, 'capsule-dp');
    assert.equal(dossier.organizations.runtime[0].name, 'network_silence');
    assert.equal(dossier.mutations.length, 1);
    assert.equal(dossier.forks[0].id, 'agent-child');
    assert.equal(dossier.children[0].id, 'agent-child');
    assert.equal(dossier.descendants.length, 1);
    console.log('Agent dossier checks passed.');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) {
      if (fs.existsSync(`${dbPath}${suffix}`)) fs.unlinkSync(`${dbPath}${suffix}`);
    }
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
