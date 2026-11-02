'use strict';

process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'mission-protocols-synapse-lineage-tests';
const assert = require('node:assert/strict');
const fixture = require('./helpers/missionProtocolFixture');
const identity = require('../src/services/missionIdentityService');
const experiments = require('../src/services/trinityExperimentStore');
const { publisher } = require('../src/services/missionProtocols/synapsePublisher');

async function createLineage(ctx) {
  await identity.attachAgent(ctx.db, { missionId: 'worker-mission', agentId: 'parent', role: 'orchestrator' });
  const run = await require('../src/services/strategyExecutionService').createExecutionRun(ctx.db, {
    agentId: 'parent', contractRecord: ctx.contractRecord, missionId: 'worker-mission',
    budget: { tokens: 100, costUsd: 1, latencyMs: 300000 } });
  const missionId = `trinity_parent_${run.id}`;
  await identity.create(ctx.db, { missionId, objective: 'Native child experiment', orchestratorAgentId: 'parent' });
  await identity.attachAgent(ctx.db, { missionId, agentId: 'worker', role: 'trinity_worker' });
  const binding = { db: ctx.db, agentId: 'worker', missionId, scope: { organizationId: 'org', projectId: 'project' } };
  await assert.rejects(publisher(binding), /another mission/);
  await ctx.db.exec(`CREATE TABLE trinity_worlds (id TEXT PRIMARY KEY,mission TEXT,world_number INTEGER,
    name TEXT,strategy TEXT,status TEXT,agent_id TEXT);`);
  await require('../src/db/migrations/migrateTrinityExperiments').migrateTrinityExperiments(ctx.db);
  await experiments.create(ctx.db, { id: missionId, missionId, domain: 'fixture', snapshotHash: 'a'.repeat(64),
    design: { orchestratorId: 'parent' }, isolationPolicy: {}, budgetPolicy: {} });
  await experiments.createWorld(ctx.db, { id: 'native-world', experimentId: missionId, mission: 'Native child experiment',
    worldNumber: 1, name: 'Worker', strategy: 'bounded-procedure', status: 'running', agentId: 'worker',
    snapshotHash: 'a'.repeat(64), workspaceRoot: ctx.workspace });
  return { binding, run, missionId };
}

async function rejectMutation(ctx, input) {
  await ctx.db.run(input.change, ...input.args);
  try { await assert.rejects(publisher(input.binding), /another mission/); }
  finally { await ctx.db.run(input.restore, ...input.restoreArgs); }
}

async function rejectForgeries(ctx, input) {
  const binding = input.binding;
  const mutations = [
    { change: "UPDATE trinity_experiments SET design_json='{}' WHERE id=?", args: [input.missionId],
      restore: 'UPDATE trinity_experiments SET design_json=? WHERE id=?', restoreArgs: ['{"orchestratorId":"parent"}', input.missionId] },
    { change: "UPDATE trinity_worlds SET agent_id='unrelated' WHERE id='native-world'", args: [],
      restore: "UPDATE trinity_worlds SET agent_id='worker' WHERE id='native-world'", restoreArgs: [] },
    { change: "DELETE FROM mission_agents WHERE mission_id=? AND agent_id='worker'", args: [input.missionId],
      restore: "INSERT INTO mission_agents (mission_id,agent_id,role) VALUES (?,'worker','trinity_worker')", restoreArgs: [input.missionId] },
    { change: "DELETE FROM mission_agents WHERE mission_id=? AND agent_id='parent'", args: [input.missionId],
      restore: "INSERT INTO mission_agents (mission_id,agent_id,role) VALUES (?,'parent','orchestrator')", restoreArgs: [input.missionId] },
    { change: "DELETE FROM mission_agents WHERE mission_id='worker-mission' AND agent_id='parent'", args: [],
      restore: "INSERT INTO mission_agents (mission_id,agent_id,role) VALUES ('worker-mission','parent','orchestrator')", restoreArgs: [] },
    { change: "UPDATE missions SET orchestrator_agent_id='unrelated' WHERE mission_id='worker-mission'", args: [],
      restore: "UPDATE missions SET orchestrator_agent_id='parent' WHERE mission_id='worker-mission'", restoreArgs: [] },
    { change: "UPDATE missions SET orchestrator_agent_id='unrelated' WHERE mission_id=?", args: [input.missionId],
      restore: "UPDATE missions SET orchestrator_agent_id='parent' WHERE mission_id=?", restoreArgs: [input.missionId] }
  ];
  for (const mutation of mutations) await rejectMutation(ctx, { ...mutation, binding });
  await identity.create(ctx.db, { missionId: `${input.missionId}_forged`, orchestratorAgentId: 'parent' });
  await assert.rejects(publisher({ ...binding, missionId: `${input.missionId}_forged` }), /another mission/);
}

async function main() {
  const ctx = await fixture.create();
  try {
    const input = await createLineage(ctx);
    assert.deepEqual(await publisher(input.binding), { agentId: 'parent', incarnationId: input.run.id, trustDomain: 'org' });
    await rejectForgeries(ctx, input);
    assert.equal((await publisher(input.binding)).incarnationId, input.run.id);
    await require('../src/services/strategyExecutionService').createExecutionRun(ctx.db, {
      agentId: 'parent', contractRecord: ctx.contractRecord, missionId: 'worker-mission',
      budget: { tokens: 100, costUsd: 1, latencyMs: 300000 } });
    await assert.rejects(publisher(input.binding), /another mission/);
    console.log('Mission SYNAPSE native Trinity lineage: exact GVX incarnation, memberships and forgery refusals PASS');
  } finally { await ctx.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
