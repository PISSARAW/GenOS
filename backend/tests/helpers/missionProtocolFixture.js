'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('./biologyDatabase');
const fixture = require('./biologicalWorkerFixture');

async function create() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-mission-protocols-'));
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'input.txt'), 'mission input');
  const db = openDatabase(path.join(root, 'control.sqlite'));
  await fixture.workerSchema(db);
  await db.exec(`ALTER TABLE agents ADD COLUMN status TEXT;
    ALTER TABLE agents ADD COLUMN isolation_mode TEXT;
    ALTER TABLE mission_agents ADD COLUMN role TEXT;
    CREATE TABLE aeis_agent_dissonance (agent_id TEXT PRIMARY KEY, authority_level INTEGER);`);
  const contract = await fixture.addWorker(db);
  await require('../../src/services/missionExecutionAuthority').rotate(db, {
    missionId: 'worker-mission', agentId: 'parent', forceRotate: true });
  const run = await require('../../src/services/strategyExecutionService').createExecutionRun(db, {
    agentId: 'worker', contractRecord: contract, missionId: 'worker-mission',
    budget: { tokens: 100, costUsd: 1, latencyMs: 300000 } });
  const ctx = { db, agentId: 'worker', executionRun: run, executable: process.execPath,
    contractRecord: contract, autonomyPlan: {}, runtimeBudget: run.budget,
    dispatchedAgent: { workspace_id: 'worker-workspace', execution_mode: 'worker' },
    normalizedMission: { agentId: 'worker', missionId: 'worker-mission',
      workspaceRoot: workspace, workspaceId: 'worker-workspace', toolLease: [], timeoutMs: 300000 } };
  return { ...ctx, root, workspace, async close() {
    await db.close();
    await fs.rm(root, { recursive: true, force: true });
  } };
}

async function seal(ctx) {
  await require('../../src/services/missionEnvelopeAuthority').seal(ctx);
  return require('../../src/services/missionProtocols/context').build(ctx);
}

module.exports = { create, seal };
