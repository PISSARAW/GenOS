'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { accounting } = require('./workerCooperationLiveAccounting.cjs');
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
  const ids = stage.recoveryWorkerIds || [stage.workerId];
  const runs = await db.all(`SELECT id,agent_id,status,metrics_json FROM strategy_execution_runs
    WHERE agent_id IN (${ids.map(() => '?').join(',')}) ORDER BY rowid`, ...ids);
  const run = runs.filter(item => item.agent_id === stage.workerId).at(-1);
  if (!run) throw new Error('Worker produced no execution run.');
  stage.runId = run.id;
  const authority = await require('../../src/services/missionEnvelopeAuthority').read(db, run.id);
  stage.runtimeAuthority = authority && { hash: authority.hash, toolLease: authority.envelope.toolLease,
    expiresAt: authority.envelope.expiresAt };
  stage.status = run.status;
  stage.attempts = await attemptEvidence(db, runs);
  const store = require('../../src/services/biologicalWorkerStore');
  stage.receipt = await store.receipt(db, run.id);
  const observations = await store.observations(db, run.id);
  stage.report = observations.filter(item => item.event.eventType === 'EVIDENCE_REPORT').at(-1)?.event.payload.evidenceReport;
  if (run.status !== 'completed' || stage.receipt?.result.verified !== true || !stage.report) {
    throw new Error(`${stage.kind}: ${stage.receipt?.result.reason || run.status}`);
  }
  return stage;
}

async function attemptEvidence(db, runs) {
  const attempts = [];
  for (const run of runs) attempts.push({ runId: run.id, workerId: run.agent_id, status: run.status,
    metrics: JSON.parse(run.metrics_json), receipt: await require('../../src/services/biologicalWorkerStore').receipt(db, run.id) });
  return attempts;
}

function claim(stage) { return JSON.parse(stage.report.claims[0].statement); }

module.exports = { verificationContract, preflight, stageEvidence, claim, accounting, hash };
