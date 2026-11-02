'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const fixture = require('./missionProtocolFixture');
const native = require('../../src/services/gqwf/missionExecution');
const { migrateGqwf } = require('../../src/services/gqwf/schema');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const journal = require('../../src/services/promotionExecutionJournal');

async function create(options = {}) {
  const ctx = await fixture.create();
  try {
    await ctx.db.exec('ALTER TABLE workspaces ADD COLUMN path TEXT');
    await ctx.db.run('UPDATE workspaces SET path=? WHERE id=?', ctx.workspace, ctx.normalizedMission.workspaceId);
    await migrateGqwf(ctx.db);
    await fs.writeFile(path.join(ctx.workspace, 'candidate.cjs'), 'module.exports = 1;\n');
    ctx.normalizedMission.executionPolicy = { gqwfV2: true, gqwfMaterializer: 'portable-copy-v1' };
    await native.prepareMissionWorkspace(ctx);
    const binding = await fixture.seal(ctx);
    await fs.writeFile(path.join(ctx.normalizedMission.workspaceRoot, 'candidate.cjs'), options.content || 'module.exports = 7;\n');
    if (options.extra) await fs.writeFile(path.join(ctx.normalizedMission.workspaceRoot, options.extra.name), options.extra.content);
    if (options.inProcess) {
      await ctx.db.run("UPDATE strategy_execution_runs SET status='awaiting_approval' WHERE id=?", ctx.executionRun.id);
      await require('../../src/services/missionProtocols/gqwf').finishInProcess(ctx.db, { runId: ctx.executionRun.id });
    } else await native.finalizeMissionWorkspace({ db: ctx.db, executionRunId: ctx.executionRun.id, outcomeStatus: 'completed' });
    const report = { summary: 'Fixture candidate is ready for a receiver syntax predicate.', claims: [] };
    const promotion = { runId: ctx.executionRun.id, agentId: ctx.agentId, workspaceId: binding.workspaceId,
      contract: ctx.contractRecord.contract, contractId: ctx.contractRecord.id, report,
      approvalDigest: digest(report), turns: [], rejectedBranches: [] };
    const gateContext = { report };
    return { ctx, binding, promotion, gateContext, close: () => ctx.close() };
  } catch (error) { await ctx.close(); throw error; }
}

async function reserve(value) {
  await value.ctx.db.run("UPDATE strategy_execution_runs SET status='awaiting_approval' WHERE id=?", value.binding.runId);
  return journal.reserve(value.ctx.db, { promotion: value.promotion, gateContext: value.gateContext,
    options: { approvedBy: 'fixture-operator-intent-only' }, primitives: [] });
}

module.exports = { create, reserve };
