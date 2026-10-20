'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(__dirname, 'run_worker_compliance_missions.cjs');
const MISSION_TIMEOUT_MS = Number(process.env.GENOS_COMPLIANCE_MISSION_TIMEOUT_MS) || 300000;
const LEAN = leanRuntime();

function leanRuntime() {
  const executable = process.env.GENOS_LEAN_EXECUTABLE || 'lean';
  const checked = spawnSync(executable, ['--version'], { encoding: 'utf8', windowsHide: true });
  return checked.status === 0 ? { executable, version: checked.stdout.trim() } : { executable: '', version: '' };
}

function isolatedEnvironment(root) {
  const secret = () => crypto.randomBytes(32).toString('hex');
  return { ...process.env, GENOS_DISABLE_DOTENV: '1', GENOS_SKIP_BOOT_DB_BACKUP: '1',
    GENOS_COMPLIANCE_ROOT: root, GENOS_DB_PATH: path.join(root, 'workers.db'),
    GENOS_WORKSPACE_ROOT: path.join(root, 'workspaces'),
    GENOS_CAPSULE_ROOT: path.join(root, 'capsules'),
    GENOS_STUDIO_ROOT: path.join(root, 'studio'),
    GENOS_WORKSPACE_COPY_HEADROOM_BYTES: String(64 * 1024 * 1024),
    GENOS_ADMIN_PASSWORD: secret(), GENOS_EPISTEMIC_RECEIPT_SECRET: secret(),
    GENOS_GVX_LEDGER_HMAC_SECRET: secret(), GENOS_COMPLIANCE_DETERMINISTIC_BOUNDED: '1',
    GENOS_COMPLIANCE_DETERMINISTIC_SCOUT: '1', GENOS_COMPLIANCE_DETERMINISTIC_MONITOR: '1',
    GENOS_COMPLIANCE_DETERMINISTIC_FORENSIC: '1', GENOS_COMPLIANCE_DETERMINISTIC_EXPERIMENT: '1',
    GENOS_COMPLIANCE_DETERMINISTIC_SYNTHESIS: '1', GENOS_COMPLIANCE_DETERMINISTIC_VERIFIER: '1',
    GENOS_COMPLIANCE_DETERMINISTIC_RED: '1', GENOS_COMPLIANCE_DETERMINISTIC_TEACHING: '1',
    GENOS_COMPLIANCE_DETERMINISTIC_RECOVERY: '1', GENOS_COMPLIANCE_DETERMINISTIC_HANDOFF: '1',
    GENOS_COMPLIANCE_DETERMINISTIC_SUBORCH: '1',
    GENOS_COMPLIANCE_DETERMINISTIC_ADAPTIVE: '1', GENOS_COMPLIANCE_DETERMINISTIC_SPECIALIST: '1',
    GENOS_COMPLIANCE_DETERMINISTIC_SYMBIOTIC: '1', GENOS_COMPLIANCE_DETERMINISTIC_CREATIVE: '1',
    GENOS_COMPLIANCE_DETERMINISTIC_MEDICAL: '1',
    GENOS_COMPLIANCE_LEAN_VERSION: LEAN.version, GENOS_LEAN_EXECUTABLE: LEAN.executable,
    GENOS_COMPLIANCE_PERCEPTION: '0',
    GENOS_LOCAL_MODEL: '' };
}

function runKind(environment, kind) {
  const runId = `c2-${crypto.randomBytes(6).toString('hex')}`;
  const executed = spawnSync(process.execPath, [SCRIPT], { cwd: ROOT, encoding: 'utf8',
    timeout: MISSION_TIMEOUT_MS, windowsHide: true, env: { ...environment,
      GENOS_COMPLIANCE_KIND: kind, GENOS_COMPLIANCE_RUN_ID: runId } });
  if (executed.error) {
    throw new Error(`${kind} compliance process failed: ${executed.error.message}`, {
      cause: executed.error });
  }
  const reportPath = path.join(environment.GENOS_COMPLIANCE_ROOT, 'worker-compliance-report.json');
  assert.ok(fs.existsSync(reportPath), `Missing ${reportPath}; exit=${executed.status}\n${executed.stderr}`);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const result = report.results.find((entry) => entry.runId === runId && entry.kind === kind);
  assert.ok(result, `Missing ${kind} result: ${executed.stderr}`);
  assert.ok(report.runs[runId]?.benchmarkDigest?.startsWith('sha256:'));
  return { exitCode: executed.status, result, stderr: executed.stderr,
    benchmarkDigest: report.runs[runId].benchmarkDigest };
}

function assertPromoted({ exitCode, result, stderr }) {
  assert.equal(exitCode, 0, `${JSON.stringify(result)}\n${stderr}`);
  assert.equal(result.passed, true);
  assert.equal(result.status, 'completed');
  assert.equal(result.terminalEvent, 'AGENT_COMPLETED');
  assert.equal(result.executionRunBound, true);
  assert.equal(result.artifactValidated, true);
  assert.equal(result.oracleAccepted, true);
  assert.deepEqual([result.oracle.status, result.oracle.processes, result.oracle.complete,
    result.oracle.decisionStatus], ['accepted_at_decision', 2, true, 'completed']);
  assert.match(result.oracle.decisionHash, /^[a-f0-9]{64}$/);
}

function assertRefused({ exitCode, result, stderr }) {
  const diagnostic = `${JSON.stringify(result)}\n${stderr}`;
  assert.equal(exitCode, 1, diagnostic);
  assert.equal(result.persistedContract, true, diagnostic);
  assert.equal(result.parentBound, true, diagnostic);
  assert.equal(result.runtimeStarted, true, diagnostic);
  assert.equal(result.executionRunBound, true, diagnostic);
  assert.equal(result.nativeExecution, true, diagnostic);
  assert.equal(result.passed, false, diagnostic);
  assert.equal(result.oracleAccepted, false, diagnostic);
  assert.equal(result.terminalEvent, 'AGENT_FAILED', diagnostic);
  assert.equal(result.errorCode, 'ORACLE_DOMAIN_UNAVAILABLE', diagnostic);
  assert.notEqual(result.status, 'completed', diagnostic);
}

function removeIsolatedRoot(root) {
  const resolved = path.resolve(root);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir())
    || !path.basename(resolved).startsWith('genos-worker-c2-')) {
    throw new Error('Refusing to remove a path outside the dedicated temporary root.');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function runIsolated(kind) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-worker-c2-'));
  try {
    return runKind(isolatedEnvironment(root), kind);
  } finally { removeIsolatedRoot(root); }
}

function main() {
  const formal = runIsolated('formal_worker');
  if (LEAN.version) assertPromoted(formal);
  else assertRefused(formal);
  const promoted = runIsolated('bounded_worker');
  assertPromoted(promoted);
  const procedural = runIsolated('procedural_executor');
  assertPromoted(procedural);
  const scout = runIsolated('scout_cell');
  assertPromoted(scout);
  const daemon = runIsolated('resident_daemon');
  assertPromoted(daemon);
  const forensic = runIsolated('forensic_worker');
  assertPromoted(forensic);
  const experiment = runIsolated('experimental_worker');
  assertPromoted(experiment);
  const synthesis = runIsolated('synthesis_worker');
  assertPromoted(synthesis);
  const verifier = runIsolated('verifier_worker');
  assertPromoted(verifier);
  const red = runIsolated('red_worker');
  assertPromoted(red);
  const teaching = runIsolated('teaching_worker');
  assertPromoted(teaching);
  const recovery = runIsolated('recovery_worker');
  assertPromoted(recovery);
  const liaison = runIsolated('liaison_worker');
  assertPromoted(liaison);
  const subOrchestrator = runIsolated('sub_orchestrator');
  assertPromoted(subOrchestrator);
  const adaptive = runIsolated('adaptive_worker');
  assertPromoted(adaptive);
  const specialist = runIsolated('specialist');
  assertPromoted(specialist);
  const symbiotic = runIsolated('symbiotic_worker');
  assertPromoted(symbiotic);
  const creative = runIsolated('creative_worker');
  assertPromoted(creative);
  const medical = runIsolated('medical_worker');
  assertPromoted(medical);
  console.log(JSON.stringify({ milestone: 'native-worker-oracles', benchmarkDigest: promoted.benchmarkDigest,
    missions: [formal, promoted, procedural, scout, daemon, forensic, experiment, synthesis, verifier, red,
      teaching, recovery, liaison, subOrchestrator, adaptive, specialist, symbiotic, creative, medical].map(({ exitCode, result }) => ({ runId: result.runId,
      kind: result.kind, exitCode, status: result.status, terminalEvent: result.terminalEvent,
      executionRunBound: result.executionRunBound, artifactValidated: result.artifactValidated,
      oracleAccepted: result.oracleAccepted, oracle: result.oracle, errorCode: result.errorCode })) }));
}

main();
