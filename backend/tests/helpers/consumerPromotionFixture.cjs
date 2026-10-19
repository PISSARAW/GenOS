'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET ||= require('node:crypto').randomBytes(32).toString('hex');

const fs = require('node:fs');
const path = require('node:path');
const contracts = require('../../src/services/strategyContractService');
const execution = require('../../src/services/strategyExecutionService');
const { getDatabase } = require('../../src/db');

async function prepare(root, settings = {}) {
  const { latencyMs = 30000 } = settings;
  const filename = path.join(root, 'promotion.db');
  const workspace = path.join(root, 'proof');
  const organizationId = settings.organizationId || 'consumer-org';
  const projectId = settings.projectId || 'consumer-project';
  for (const replica of ['a', 'b']) {
    const cwd = path.join(workspace, replica);
    fs.mkdirSync(cwd, { recursive: true });
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ name: `consumer-proof-${replica}`,
      version: '1.0.0', scripts: { test: 'node verify.cjs' } }));
    fs.writeFileSync(path.join(cwd, 'verify.cjs'), replica === 'a'
      ? "console.log('consumer proof');\n" : "console.log(['consumer', 'proof'].join(' '));\n");
  }
  const db = await getDatabase(filename);
  await db.run('INSERT INTO organizations (id, name) VALUES (?, ?)', organizationId, 'Consumer promotion');
  await db.run('INSERT INTO projects (id, organization_id, name) VALUES (?, ?, ?)',
    projectId, organizationId, 'Consumer promotion');
  await db.run(`INSERT INTO workspaces (id, name, path, organization_id, project_id)
    VALUES (?, ?, ?, ?, ?)`, 'consumer-ws', 'Consumer proof', workspace, organizationId, projectId);
  await db.run('INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES (?, ?, ?, ?, ?, ?)',
    'consumer-promotion-agent', 'Consumer promotion', 'orchestrator', 'running', 'orchestrator', 'consumer-ws');
  await require('../../src/services/missionIdentityService').create(db, {
    missionId: 'consumer-promotion-mission', objective: 'Qualify a consumer promotion.',
    orchestratorAgentId: 'consumer-promotion-agent'
  });
  const record = await contracts.saveContract(db, { agentId: 'consumer-promotion-agent', problem: 'High risk verification requiring human approval' });
  const contract = record.contract;
  contract.strategy_portfolio.push({ id: 'stdp_plasticity', primitives: ['stdp_update', 'cherry_pick_golden_path'] });
  contract.promotion.require_human_approval = true;
  if (settings.merge) contract.promotion.merge_workspace_automatically = true;
  const hash = contracts.hashContract(contract);
  await db.run('UPDATE strategy_contracts SET contract_json = ?, contract_hash = ? WHERE id = ?', JSON.stringify(contract), hash, record.id);
  const boundRecord = { ...record, contract };
  const run = await execution.createExecutionRun(db, { agentId: 'consumer-promotion-agent',
    missionId: 'consumer-promotion-mission',
    contractRecord: boundRecord, budget: { tokens: 10000, costUsd: 1, latencyMs, events: 50 } });
  await require('../../src/services/missionEnvelopeAuthority').seal({
    db, agentId: 'consumer-promotion-agent', executionRun: run, executable: process.execPath,
    contractRecord: boundRecord, autonomyPlan: {}, normalizedMission: {
      agentId: 'consumer-promotion-agent', missionId: 'consumer-promotion-mission',
      workspaceRoot: workspace, toolLease: [], timeoutMs: latencyMs
    }
  });
  await db.run("UPDATE strategy_execution_runs SET status = 'awaiting_approval' WHERE id = ?", run.id);
  await db.run("UPDATE strategy_execution_steps SET status = 'awaiting_approval' WHERE run_id = ? AND sequence = 7", run.id);
  const options = { report: { outcome: 'success', claims: [{ statement: 'npm test exits with code 0',
    evidence: [{ kind: 'reproducible_artifact', content: { fixture: 'consumer-promotion' } }],
    test: { command: 'npm test', replicas: { proof: { cwd: path.join(workspace, 'a') }, source: { cwd: path.join(workspace, 'b') } } } }] },
    humanApprovalReceipt: { approved: true, approvalId: `approval-${run.id}`, approverId: 'fixture-human',
      approvedAt: new Date().toISOString(), payloadHash: hash.replace(/^sha256:/, '') } };
  await db.run('UPDATE strategy_execution_steps SET evidence_json = ? WHERE run_id = ? AND sequence = 7',
    JSON.stringify([{ payload: { evidenceReport: options.report } }]), run.id);
  options.humanApprovalReceipt.payloadHash = await execution.getPromotionApprovalDigest(db, run.id);
  if (settings.merge) {
    for (const kind of ['winner', 'target', 'base']) {
      const directory = path.join(workspace, kind);
      fs.mkdirSync(directory);
      fs.writeFileSync(path.join(directory, 'one.txt'), kind === 'winner' ? 'new one' : 'old one');
      fs.writeFileSync(path.join(directory, 'two.txt'), kind === 'winner' ? 'new two' : 'old two');
    }
    options.winnerWorkspaceRoot = path.join(workspace, 'winner');
    options.targetWorkspaceRoot = path.join(workspace, 'target');
    options.causalBaseWorkspaceRoot = path.join(workspace, 'base');
  }
  return { db, filename, run, options };
}

module.exports = { prepare };
