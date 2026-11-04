'use strict';

const native = require('./missionProtocolFixture');
const { digest } = require('../../src/services/biologicalIntegrity');

async function create() {
  const ctx = await native.create();
  await require('../../src/db/migrations/migrateMedicalTables').migrateMedicalTables(ctx.db);
  await ctx.db.exec(`ALTER TABLE agents ADD COLUMN updated_at TEXT;
    CREATE TABLE lineage_nodes (id TEXT PRIMARY KEY, workspace_id TEXT, metadata TEXT DEFAULT '{}');`);
  await ctx.db.exec('ALTER TABLE workspaces ADD COLUMN path TEXT');
  await ctx.db.run('UPDATE workspaces SET path=?', ctx.workspace);
  const contract = ctx.contractRecord.contract;
  await ctx.db.run('INSERT INTO strategy_contracts VALUES(?,?,?,?,?)', 'contract-parent', 'parent', 1,
    JSON.stringify(contract), `sha256:${digest(contract)}`);
  const input = { db: ctx.db, id: 'parent', missionId: ctx.normalizedMission.missionId,
    task: { id: 'task-windows' }, enhancedPrompt: 'Inspect native protocol barriers for {{AGENT_ID}}.',
    request: { localModel: 'fixture-local', workspaceRoot: ctx.workspace },
    missionBudget: { tokens: 100, costUsd: 0.1, latencyMs: 300000 }, requestTimeoutMs: 300000,
    allowedCommands: [], allowFileEdits: false, morphology: {}, nceEnhancements: null,
    evaluateMissionContinuity: async () => ({}), gatherTelemetryAndCoverage: async () => ({}),
    finalizeOrchestratedMission: async () => {} };
  return { ctx, input };
}

module.exports = { create };
