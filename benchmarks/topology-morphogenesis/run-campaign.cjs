'use strict';

const fs = require('fs');
const path = require('path');
const { createHash, randomBytes } = require('crypto');
const { spawn } = require('child_process');
const { verifySimpleMissionProof } = require('./simpleMissionProof.cjs');

const repo = path.resolve(__dirname, '../..');
const suite = JSON.parse(fs.readFileSync(path.join(__dirname, 'suite.json'), 'utf8'));
const runId = `campaign-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const artifactRoot = path.resolve(process.env.GENOS_CAMPAIGN_OUTPUT_ROOT || path.join(repo, 'artifacts', 'topology-morphogenesis'));
const output = path.join(artifactRoot, runId);
const fixture = path.join(output, 'workspace');
const missions = suite.tasks.map((task) => task.id);
const tasksById = new Map(suite.tasks.map((task) => [task.id, task]));
const sessionProbeByTask = Object.freeze({
  'topologie-trinity': 'topologie-trinity',
  'topologie-a-team': 'topologie-a-team',
  'topologie-biome': 'topologie-biome',
  'topologie-biocenose': 'topologie-biocenose',
  'topologie-holobionte': 'topologie-holobionte',
  'topologie-syncytium': 'topologie-syncytium',
  'topologie-rhizome': 'topologie-rhizome',
  'topologie-metapopulation': 'topologie-metapopulation'
});
const topologyMissions = new Set(missions.filter((name) => name.startsWith('topologie-')));
const missionVerifiers = {
  'orchestrateur-simple': verifySimpleMission,
  'morphogenese-plan': verifyMorphogenesisPlan,
  'morphogenese-shadow': verifyMorphogenesisShadow,
  'garde-preuve-negative': verifyNegativeControl,
};

function validateSuiteManifest() {
  const ids = new Set();
  for (const task of suite.tasks) {
    const file = path.resolve(__dirname, task.missionFile);
    if (ids.has(task.id)) throw new Error(`Duplicate suite task: ${task.id}`);
    if (!file.startsWith(`${__dirname}${path.sep}`) || !fs.existsSync(file)) throw new Error(`Invalid suite mission file: ${task.missionFile}`);
    if (task.comparisonEligible && task.oracle.status !== 'independent') throw new Error(`Task lacks an independent oracle: ${task.id}`);
    ids.add(task.id);
  }
}

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
    GENOS_LOCAL_MODEL_TIMEOUT_MS: process.env.GENOS_LOCAL_MODEL_TIMEOUT_MS || '120000',
    GENOS_SQLITE_BUSY_TIMEOUT_MS: '10000',
    GENOS_SQLITE_MAX_RETRIES: '8',
    GENOS_WORKTREE_GC_DELAY_MS: '5000',
    GENOS_MORPHOGENESIS_V2_SHADOW: name === 'morphogenese-shadow' ? '1' : '0',
    ...(name === 'topologie-syncytium' && mission.session_options?.schema
      ? { GENOS_SYNCYTIUM_SESSION_SCHEMA: JSON.stringify(mission.session_options.schema) } : {})
  };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function missionDigest(name) {
  const task = tasksById.get(name);
  const file = path.join(__dirname, task.missionFile);
  return sha256(fs.readFileSync(file));
}

function campaignIdentityFailures(results) {
  const failures = [];
  if (results.schemaVersion !== 1 || !results.suiteId || !/^[a-f0-9]{40}$/i.test(results.gitCommit || '')) failures.push('campaign identity or source commit missing');
  if (!/^[a-f0-9]{64}$/.test(results.suiteSha256 || '')) failures.push('suite digest missing');
  if (!results.sourceState || typeof results.sourceState.confirmatoryEligible !== 'boolean') failures.push('source tree state missing');
  return failures;
}

function hasMissionProvenance(mission) {
  return Boolean(mission.missionFile) && /^[a-f0-9]{64}$/.test(mission.missionSha256 || '');
}

function hasValidReceiptDigest(mission) {
  return mission.receiptObjectSha256 === null || /^[a-f0-9]{64}$/.test(mission.receiptObjectSha256 || '');
}

function hasExecutionEvidence(mission) {
  return Array.isArray(mission.workers) && typeof mission.verification?.passed === 'boolean';
}

function missionEvidenceFailures(mission) {
  const failures = [];
  if (!hasMissionProvenance(mission)) failures.push(`${mission.name}: mission provenance missing`);
  if (!hasValidReceiptDigest(mission)) failures.push(`${mission.name}: invalid receipt digest`);
  if (!hasExecutionEvidence(mission)) failures.push(`${mission.name}: execution evidence incomplete`);
  if (!mission.oracleVerification?.status) failures.push(`${mission.name}: oracle scope missing`);
  if (!mission.mechanismEvidence?.status) failures.push(`${mission.name}: mechanism evidence scope missing`);
  return failures;
}

function validateCampaignEvidence(results) {
  const failures = campaignIdentityFailures(results);
  for (const mission of results.missions) failures.push(...missionEvidenceFailures(mission));
  if (failures.length) throw new Error(`Invalid campaign evidence: ${failures.join('; ')}`);
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
  const startedAt = new Date(started).toISOString();
  return new Promise((resolve) => {
    let timedOut = false;
    const child = spawn(process.execPath, ['backend/bin/genos-orchestrate.cjs', JSON.stringify(payload)], {
      cwd: repo, env: environment(name), stdio: ['ignore', log, log], windowsHide: true
    });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, processTimeoutMs(name, payload));
    child.once('error', (error) => resolve({ name, startedAt, endedAt: new Date().toISOString(), error: error.message, durationMs: Date.now() - started }));
    child.once('close', (exitCode) => {
      clearTimeout(timer);
      fs.closeSync(log);
      resolve({ name, startedAt, endedAt: new Date().toISOString(), exitCode, timedOut, durationMs: Date.now() - started });
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

function initialMechanismEvidence(task) {
  const status = task.mechanismProbe?.startsWith('not-instrumented:') ? 'not-instrumented'
    : task.mechanismProbe ? 'pending' : 'not-applicable';
  return { probeId: task.mechanismProbe, status, passed: null, receiptFile: null, receiptSha256: null };
}

function applyMechanismProbeResults(results, probes) {
  for (const mission of results.missions) {
    const probeName = sessionProbeByTask[mission.name];
    if (!probeName) continue;
    const receipt = probes?.[probeName];
    mission.mechanismEvidence = {
      probeId: tasksById.get(mission.name).mechanismProbe,
      status: receipt?.verified === true ? 'verified' : receipt?.verified === false ? 'failed' : 'missing',
      passed: receipt?.verified === true,
      receiptFile: 'session-probes.json',
      receiptSha256: receipt ? sha256(JSON.stringify(receipt)) : null
    };
  }
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
  const task = tasksById.get(name);
  const workers = await workerStates(db, receipt);
  const proof = verifySimpleMissionProof(receipt, name);
  const verification = verifyMissionExecution({ name, run, receipt, workers, proof });
  const lifecycle = classifyMissionLifecycle({ name, run, receipt, workers, verification });
  results.missions.push({ ...run, missionFile: task.missionFile, missionSha256: missionDigest(name),
    mechanism: task.mechanism, mechanismEvidence: initialMechanismEvidence(task), oracleVerification: { status: task.oracle.status,
      passed: task.oracle.status === 'independent' ? proof?.verified === true : null },
    receiptObjectSha256: receipt ? sha256(JSON.stringify(receipt)) : null,
    receiptLogFile: `${name}.log`,
    orchestratorId: receipt?.orchestratorId || null,
    verdict: receipt?.verdict || null, completionGate: receipt?.completionGate || null,
    dispatchStatus: getDispatchStatus(receipt),
    sessionId: receipt?.biologicalMode?.sessionId || receipt?.biologicalMode?.rhizomeId || null,
    workers, independentProof: proof, lifecycle, verification });
  results.verification = summarizeVerification(results);
  validateCampaignEvidence(results);
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
  applyMechanismProbeResults(results, probeReceipts);
  results.verification = summarizeVerification(results, probeReceipts);
  if (probes.exitCode !== 0) results.verification.failedSessionProbes.push('session-probe-runner');
  results.completedAt = new Date().toISOString();
  validateCampaignEvidence(results);
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
  validateSuiteManifest();
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
  const results = { schemaVersion: 1, suiteId: suite.suiteId, suiteStatus: suite.status, suiteSha256: sha256(fs.readFileSync(path.join(__dirname, 'suite.json'))),
    runId, startedAt: new Date().toISOString(), gitCommit: null,
    environment: { executor: 'local', requestedModel: process.env.GENOS_LOCAL_MODEL, servedModel: null,
      toolPolicy: suite.controls.toolPolicy, budgetPolicy: suite.controls.budgetPolicy, database: 'isolated campaign database' }, missions: [] };
  try {
    const git = require('child_process').execFileSync;
    results.gitCommit = git('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    const changedPaths = git('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
    results.sourceState = { workingTreeClean: changedPaths.length === 0,
      changedPathCount: changedPaths.length,
      confirmatoryEligible: changedPaths.length === 0 };
    for (const name of missions) {
      const run = await execute(name);
      await recordMissionResult({ name, run, db, results });
    }
  } finally { await closeDatabase(); }
  await finalizeCampaign();
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
