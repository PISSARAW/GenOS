'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex');

async function verificationContract(workspace, mode) {
  const files = { problem: 'problem.json', allocation: 'allocation.json' };
  if (mode === 'verification') files.candidate = 'candidate.json';
  const sources = [];
  for (const file of Object.values(files)) {
    sources.push({ path: file, sha256: hash(await fs.readFile(path.join(workspace, file))) });
  }
  const contract = { version: 1, kind: 'resource_allocation', indexBase: 0, mode, files, sources };
  require('../../src/services/epistemic/workspaceVerificationContract').assertContract(contract);
  return contract;
}

function preflight(task) {
  if (task.kind === 'recovery_worker') {
    return require('../../src/services/agents/workerExecutorRegistry').assertNativeInput(task.kind, task.methodContract);
  }
  if (!task.verificationContract) throw new Error('A source-bound semantic verification contract is required before calling the model.');
  const mode = { resident_daemon: 'observation', specialist: 'candidate', verifier_worker: 'verification' }[task.kind];
  if (!mode || task.verificationContract.mode !== mode) throw new Error('The verification contract must match the worker responsibility.');
  require('../../src/services/epistemic/workspaceVerificationContract').assertContract(task.verificationContract);
}

async function stageEvidence(db, stage) {
  const runs = await db.all('SELECT id,status,metrics_json FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid', stage.workerId);
  if (!runs.length) throw new Error('Worker produced no execution run.');
  const run = runs.at(-1);
  stage.runId = run.id;
  const authority = await require('../../src/services/missionEnvelopeAuthority').read(db, run.id);
  stage.runtimeAuthority = authority && { hash: authority.hash, toolLease: authority.envelope.toolLease,
    expiresAt: authority.envelope.expiresAt };
  stage.status = run.status;
  stage.attempts = runs.map(item => ({ runId: item.id, status: item.status, metrics: JSON.parse(item.metrics_json) }));
  const store = require('../../src/services/biologicalWorkerStore');
  stage.receipt = await store.receipt(db, run.id);
  const observations = await store.observations(db, run.id);
  stage.report = observations.filter(item => item.event.eventType === 'EVIDENCE_REPORT').at(-1)?.event.payload.evidenceReport;
  if (run.status !== 'completed' || stage.receipt?.result.verified !== true || !stage.report) {
    throw new Error(`${stage.kind}: ${stage.receipt?.result.reason || run.status}`);
  }
  return stage;
}

function claim(stage) { return JSON.parse(stage.report.claims[0].statement); }

async function accounting(db, context) {
  const rows = await db.all(`SELECT r.id,r.agent_id,r.status,r.metrics_json FROM strategy_execution_runs r
    JOIN agents a ON a.id=r.agent_id WHERE a.parent_agent_id=? ORDER BY r.rowid`, context.id);
  const attempts = rows.map(row => ({ runId: row.id, workerId: row.agent_id, status: row.status,
    metrics: JSON.parse(row.metrics_json) }));
  const workerTokens = attempts.reduce((sum, item) => sum + item.metrics.tokens, 0);
  const providerAttempts = await db.all(`SELECT id,agent_id,model,status,provider_called,input_tokens,output_tokens,
    token_usage_source,error_code FROM model_attempt_ledger
    WHERE agent_id=? OR agent_id IN (SELECT id FROM agents WHERE parent_agent_id=?) ORDER BY rowid`, context.id, context.id);
  const complete = providerAttempts.every(row => !row.provider_called || row.token_usage_source === 'provider'
    && Number.isSafeInteger(row.input_tokens) && row.input_tokens >= 0
    && Number.isSafeInteger(row.output_tokens) && row.output_tokens >= 0);
  return { attempts, workerTokens, providerAttempts, complete, planningTokens: context.planningTokens,
    modelTokens: !complete ? null : providerAttempts.reduce((sum, row) => sum + (row.input_tokens || 0) + (row.output_tokens || 0), 0),
    scope: 'parent_planning_and_all_child_runs_including_failed_and_recovered_workers' };
}

module.exports = { verificationContract, preflight, stageEvidence, claim, accounting, hash };
