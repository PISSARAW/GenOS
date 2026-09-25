'use strict';

const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const { spawn } = require('child_process');
const { verifySimpleMissionProof } = require('./simpleMissionProof.cjs');

const repo = path.resolve(__dirname, '../..');
const runId = `campaign-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const artifactRoot = path.resolve(process.env.GENOS_CAMPAIGN_OUTPUT_ROOT || path.join(repo, 'artifacts', 'topology-morphogenesis'));
const output = path.join(artifactRoot, runId);
const fixture = path.join(output, 'workspace');
const missions = [
  'orchestrateur-simple', 'topologie-trinity', 'topologie-a-team',
  'topologie-biome', 'topologie-biocenose', 'topologie-holobionte',
  'topologie-syncytium', 'topologie-rhizome', 'topologie-metapopulation',
  'morphogenese-plan', 'morphogenese-shadow', 'garde-preuve-negative'
];
const topologyMissions = new Set(missions.filter((name) => name.startsWith('topologie-')));
const missionVerifiers = {
  'orchestrateur-simple': verifySimpleMission,
  'morphogenese-plan': verifyMorphogenesisPlan,
  'morphogenese-shadow': verifyMorphogenesisShadow,
  'garde-preuve-negative': verifyNegativeControl,
};

function environment(name) {
  const missionPath = path.join(__dirname, 'missions', `${name}.json`);
  const mission = JSON.parse(fs.readFileSync(missionPath, 'utf8'));
  return {
    ...process.env,
    GENOS_DB_PATH: path.join(output, 'campaign.db'),
    GENOS_WORKSPACE_ROOT: fixture,
    GENOS_CAPSULE_ROOT: path.join(output, 'capsules'),
    GENOS_RUNNER_LOG_DIR: path.join(output, 'runner-logs'),
    GENOS_TOPOLOGY_AWAIT_WORKERS: '1',
    GENOS_AGENT_EXECUTOR: process.env.GENOS_AGENT_EXECUTOR || 'local',
    GENOS_LOCAL_MODEL: process.env.GENOS_LOCAL_MODEL || 'qwen2.5:14b',
    GENOS_LOCAL_MODEL_TIMEOUT_MS: process.env.GENOS_LOCAL_MODEL_TIMEOUT_MS || '30000',
    GENOS_SQLITE_BUSY_TIMEOUT_MS: '30000',
    GENOS_WORKTREE_GC_DELAY_MS: '5000',
    GENOS_MORPHOGENESIS_V2_SHADOW: name === 'morphogenese-shadow' ? '1' : '0',
    ...(name === 'topologie-syncytium' && mission.session_options?.schema
      ? { GENOS_SYNCYTIUM_SESSION_SCHEMA: JSON.stringify(mission.session_options.schema) } : {})
  };
}

function prepareMissionPayload(name, payload) {
  const requestedTimeout = Number(payload.timeoutMs) || 300000;
  const topologyTimeout = name === 'topologie-rhizome' ? 600000 : 360000;
  if (topologyMissions.has(name)) payload.timeoutMs = Math.max(requestedTimeout, topologyTimeout);
  if (name === 'orchestrateur-simple') payload.timeoutMs = Math.max(requestedTimeout, 300000);
  const budget = payload.execution_budget || {};
  const effectiveTimeout = Number(payload.timeoutMs) || requestedTimeout;
  payload.execution_budget = {
    ...budget,
    tokens: Number(budget.tokens) || 10000,
    latencyMs: Number(budget.latencyMs) || Math.max(10000, Math.min(effectiveTimeout - 10000, 300000))
  };
  if (name === 'orchestrateur-simple') payload.execution_budget.latencyMs = 240000;
  return payload;
}

function processTimeoutMs(name, payload) {
  const stages = name === 'topologie-metapopulation' ? 3 : 1;
  return Math.max(360000, payload.timeoutMs * stages + 30000);
}

function execute(name) {
  const missionPath = path.join(__dirname, 'missions', `${name}.json`);
  const payload = prepareMissionPayload(name, JSON.parse(fs.readFileSync(missionPath, 'utf8')));
  const log = fs.openSync(path.join(output, `${name}.log`), 'w');
  const started = Date.now();
  return new Promise((resolve) => {
    let timedOut = false;
    const child = spawn(process.execPath, ['backend/bin/genos-orchestrate.cjs', JSON.stringify(payload)], {
      cwd: repo, env: environment(name), stdio: ['ignore', log, log], windowsHide: true
    });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, processTimeoutMs(name, payload));
    child.once('error', (error) => resolve({ name, error: error.message, durationMs: Date.now() - started }));
    child.once('close', (exitCode) => {
      clearTimeout(timer);
      fs.closeSync(log);
      resolve({ name, exitCode, timedOut, durationMs: Date.now() - started });
    });
  });
}

function readReceipt(name) {
  const log = fs.readFileSync(path.join(output, `${name}.log`), 'utf8');
  const lines = log.trim().split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index--) {
    try {
      const candidate = JSON.parse(lines[index]);
      if (receiptMatchesMission(name, candidate)) return candidate;
    } catch (_) { /* diagnostic line */ }
  }
  return null;
}

function receiptMatchesMission(name, receipt) {
  if (!receipt?.orchestratorId) return false;
  if (!topologyMissions.has(name)) return Object.hasOwn(receipt, 'completionGate');
  if (name === 'topologie-trinity') return Boolean(receipt.trinity);
  if (name === 'topologie-a-team') return Boolean(receipt.aTeam || receipt.team);
  return Boolean(receipt.biologicalMode);
}

function verifyMissionExecution(options) {
  const { name, run, receipt } = options;
  const failures = [];
  if (run.timedOut) failures.push('mission timed out');
  if (!receipt?.orchestratorId) failures.push('orchestrator receipt missing');
  if (run.exitCode !== 0 && name !== 'garde-preuve-negative') failures.push(`process exited with code ${run.exitCode ?? 'unknown'}`);
  failures.push(...(missionVerifiers[name] || verifyTopology)(options));
  return { passed: failures.length === 0, failures };
}

function verifySimpleMission({ receipt, proof }) {
  const failures = [];
  if (receipt?.success !== true || receipt?.completionGate?.allowed !== true) failures.push('completion gate did not authorize the mission');
  if (proof?.verified !== true) failures.push('independent arithmetic proof missing or invalid');
  return failures;
}

function verifyTopology({ workers, receipt }) {
  const failures = [];
  if (workers.length === 0) failures.push('no persisted topology workers');
  const unfinished = workers.filter((worker) => worker.status !== 'completed');
  if (unfinished.length) failures.push(`${unfinished.length} topology worker(s) are not completed`);
  const mode = receipt?.trinity || receipt?.aTeam || receipt?.biologicalMode;
  if (mode?.status === 'partial' || mode?.complete === false) failures.push('topology dispatch is partial');
  return failures;
}

function verifyMorphogenesisPlan({ receipt }) {
  return receipt?.success === true && receipt?.completionGate?.allowed === true
    ? [] : ['morphogenesis plan did not pass the completion gate'];
}

function verifyMorphogenesisShadow({ receipt }) {
  const failures = [];
  const event = receipt?.telemetry?.find((entry) => entry.event_type === 'MORPHOGENESIS_V2_SHADOW');
  let decision = null;
  try { decision = JSON.parse(event?.payload_json || '{}'); } catch (_) {}
  if (decision?.decision !== 'SHADOWED') failures.push('V2 shadow decision missing');
  if (decision?.committed !== false) failures.push('shadow run committed or commit state is unproven');
  if (decision?.errors?.length) failures.push('shadow evaluation reported errors');
  if (receipt?.success !== true || receipt?.completionGate?.allowed !== true) failures.push('shadow mission completion gate did not pass');
  return failures;
}

function verifyNegativeControl({ receipt }) {
  const missingEvidence = receipt?.continuity?.missingEvidence || [];
  return receipt?.completionGate?.allowed === false && missingEvidence.length > 0
    ? [] : ['negative control did not prove an evidence-based block'];
}

function summarizeVerification(results, probes = null) {
  const failed = results.missions.filter((mission) => mission.verification?.passed !== true);
  const failedProbes = probes
    ? Object.entries(probes).filter(([, probe]) => probe?.verified !== true).map(([name]) => name)
    : [];
  return {
    passed: failed.length === 0 && probes !== null && failedProbes.length === 0,
    failedMissions: failed.map((mission) => mission.name),
    failedSessionProbes: failedProbes,
    sessionProbesPending: probes === null
  };
}

function classifyMissionLifecycle(options) {
  const { name, run, receipt, workers, verification } = options;
  if (verification.passed) return 'verified';
  if (run.timedOut) return 'timed_out';
  if (!receipt?.orchestratorId) return 'receipt_missing';
  if (topologyMissions.has(name) && workers.some((worker) => worker.status !== 'completed')) {
    return 'workers_incomplete';
  }
  if (run.exitCode !== 0 && name !== 'garde-preuve-negative') return 'execution_failed';
  return 'completed_unverified';
}

function getDispatchStatus(receipt, fallback = null) {
  for (const key of ['biologicalMode', 'trinity', 'team']) {
    if (receipt?.[key]?.status) return receipt[key].status;
  }
  return fallback;
}

async function workerStates(db, receipt) {
  if (!receipt?.orchestratorId) return [];
  const rows = await db.all(
    "SELECT id, status FROM agents WHERE parent_agent_id = ? AND execution_mode = 'worker' ORDER BY id",
    receipt.orchestratorId
  );
  return rows.map((row) => ({ id: row.id, status: row.status }));
}

async function recordMissionResult({ name, run, db, results }) {
  const receipt = readReceipt(name);
  const workers = await workerStates(db, receipt);
  const proof = verifySimpleMissionProof(receipt, name);
  const verification = verifyMissionExecution({ name, run, receipt, workers, proof });
  const lifecycle = classifyMissionLifecycle({ name, run, receipt, workers, verification });
  results.missions.push({ ...run, orchestratorId: receipt?.orchestratorId || null,
    verdict: receipt?.verdict || null, completionGate: receipt?.completionGate || null,
    dispatchStatus: getDispatchStatus(receipt),
    sessionId: receipt?.biologicalMode?.sessionId || receipt?.biologicalMode?.rhizomeId || null,
    workers, independentProof: proof, lifecycle, verification });
  results.verification = summarizeVerification(results);
  fs.writeFileSync(path.join(output, 'campaign-results.json'), JSON.stringify(results, null, 2));
  const dispatch = getDispatchStatus(receipt, 'not-applicable');
  process.stdout.write(`${name}: lifecycle=${lifecycle} dispatch=${dispatch} exit=${run.exitCode ?? 'error'} workers=${workers.length} verified=${verification.passed}\n`);
}

async function finalizeCampaign() {
  const probes = await runSessionProbes();
  process.stdout.write(`session-probes: exit=${probes.exitCode ?? 'error'}\n`);
  const resultsPath = path.join(output, 'campaign-results.json');
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  const probePath = path.join(output, 'session-probes.json');
  const probeReceipts = probes.exitCode === 0 && fs.existsSync(probePath)
    ? JSON.parse(fs.readFileSync(probePath, 'utf8')) : null;
  results.verification = summarizeVerification(results, probeReceipts);
  if (probes.exitCode !== 0) results.verification.failedSessionProbes.push('session-probe-runner');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  if (results.verification.passed !== true || probes.exitCode !== 0) process.exitCode = 1;
  process.stdout.write(`${output}\n`);
}

function runSessionProbes() {
  const log = fs.openSync(path.join(output, 'session-probes.log'), 'w');
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'session-probes.cjs'), output], {
      cwd: repo, env: process.env, stdio: ['ignore', log, log], windowsHide: true
    });
    child.once('error', (error) => resolve({ error: error.message }));
    child.once('close', (exitCode) => { fs.closeSync(log); resolve({ exitCode }); });
  });
}

async function main() {
  fs.mkdirSync(fixture, { recursive: true });
  fs.mkdirSync(path.join(output, 'runner-logs'), { recursive: true });
  fs.writeFileSync(path.join(fixture, 'README.md'), 'Isolated campaign workspace.\n');
  process.env.GENOS_DB_PATH = path.join(output, 'campaign.db');
  process.env.GENOS_WORKSPACE_ROOT = fixture;
  process.env.GENOS_CAPSULE_ROOT = path.join(output, 'capsules');
  process.env.GENOS_RUNNER_LOG_DIR = path.join(output, 'runner-logs');
  process.env.GENOS_LOCAL_MODEL = process.env.GENOS_LOCAL_MODEL || 'qwen2.5:14b';
  process.env.GENOS_SQLITE_BUSY_TIMEOUT_MS = '30000';
  process.env.GENOS_ADMIN_PASSWORD = randomBytes(32).toString('base64url');
  process.loadEnvFile(path.join(repo, '.env'));
  const { getDatabase, closeDatabase } = require('../../backend/src/db');
  const db = await getDatabase();
  const results = { suiteVersion: '1.0.0', runId, gitCommit: null,
    environment: { executor: 'local', model: process.env.GENOS_LOCAL_MODEL, database: 'isolated campaign database' }, missions: [] };
  try {
    const git = require('child_process').execFileSync;
    results.gitCommit = git('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    for (const name of missions) {
      const run = await execute(name);
      await recordMissionResult({ name, run, db, results });
    }
  } finally { await closeDatabase(); }
  await finalizeCampaign();
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
