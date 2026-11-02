'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.NODE_ENV = 'test';
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.GENOS_COMPLIANCE_BOUNDED_CODE = '1';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = crypto.randomBytes(32).toString('hex');
const database = require('../src/db');
const contracts = require('../src/services/strategyContractService');
const parent = require('./workerComplianceParent.cjs');
const bounded = require('./boundedCodeWorkerQualification.cjs');
const budgets = require('../src/services/missionModelBudgetScope');

async function setup(root) {
  const db = await database.getDatabase(path.join(root, 'control.sqlite'));
  await db.run("INSERT INTO organizations(id,name) VALUES('compliance-org','Compliance')");
  await db.run("INSERT INTO projects(id,name,organization_id) VALUES('compliance-project','Compliance','compliance-org')");
  await db.run(`INSERT INTO workspaces(id,name,path,organization_id,project_id)
    VALUES('compliance-ws','Compliance',?,'compliance-org','compliance-project')`, root);
  await db.run(`INSERT INTO agents(id,name,role,status,execution_mode,workspace_id)
    VALUES('compliance-parent','Controller','compliance','idle','orchestrator','compliance-ws')`);
  await contracts.saveContract(db, { agentId: 'compliance-parent', workspaceId: 'compliance-ws',
    contract: contracts.buildStrategyContract({ mission: 'Dispatch the bounded compliance worker.', allowPrototype: true }),
    createdBy: 'compliance-parent-test' });
  return { db, parentId: 'compliance-parent', workspaceId: 'compliance-ws', rootWorkspace: root,
    missionId: 'compliance-native-mission', kind: 'bounded_worker' };
}

async function rejectsFalseBindings(input, control) {
  await assert.rejects(bounded.bindModelBudget(input), /actual parent/);
  await assert.rejects(bounded.bindModelBudget({ ...input, parentContext: control.ctx,
    missionId: 'another-mission' }), /actual parent/);
  await assert.rejects(bounded.bindModelBudget({ ...input, parentContext: { ...control.ctx,
    executionRun: { ...control.run, id: 'synthetic-parent-run' } } }), /mission|budget/);
  await assert.rejects(bounded.bindModelBudget({ ...input, parentContext: { ...control.ctx,
    normalizedExecutionBudget: { ...control.run.budget, tokens: 50000 } } }), /native budget/);
  const scope = control.modelBudgetScope;
  await assert.rejects(budgets.routeBudget({ orchestratorAgentId: input.parentId,
    executionBudget: { costUsd: 0.2 }, modelBudgetScope: { ...scope, projectId: 'foreign-project' } }, input.db),
  /scope|persisted/);
  await assert.rejects(parent.prepare({ ...input, rootWorkspace: path.dirname(input.rootWorkspace),
    missionId: 'wrong-root-mission' }), /workspace changed/);
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-compliance-parent-'));
  let db;
  try {
    const input = await setup(root); db = input.db;
    const control = await parent.prepare(input);
    const row = await db.get('SELECT * FROM mission_model_budget_scopes WHERE scope_id=?', control.modelBudgetScope.id);
    assert.equal(row.parent_run_id, control.run.id);
    assert.equal(row.scope_id, `execution-run:${control.run.id}`);
    assert.equal(row.parent_agent_id, input.parentId);
    assert.equal(row.token_ceiling, control.run.budget.tokens);
    assert.equal(row.cost_ceiling_usd, control.run.budget.costUsd);
    const sealed = await require('../src/services/missionEnvelopeAuthority').assertRun(db, {
      agentId: input.parentId, runId: control.run.id, mission: control.ctx.normalizedMission });
    assert.equal(sealed.envelope.missionId, input.missionId);
    assert.equal(sealed.envelope.executable.path, await fs.realpath(path.join(__dirname, 'run_worker_compliance_missions.cjs')));
    assert.equal(sealed.envelope.budgets.tokens, row.token_ceiling);
    assert.equal(sealed.envelope.budgets.costUsd, row.cost_ceiling_usd);
    await rejectsFalseBindings(input, control);
    assert.equal((await db.all('SELECT * FROM mission_model_budget_scopes')).length, 1);
    console.log('Compliance parent: actual GVX control, sealed budget, native model scope and forgery refusals PASS');
  } finally {
    if (db) await require('../src/services/garageRuntimeService').stop(db);
    await require('../src/services/telemetryObserver').flush(5000).catch(() => undefined);
    await database.closeDatabase();
    if (path.dirname(root) !== path.resolve(os.tmpdir())) throw new Error('Unexpected compliance fixture cleanup path');
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
