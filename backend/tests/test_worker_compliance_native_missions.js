'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(__dirname, 'run_worker_compliance_missions.cjs');

function isolatedEnvironment(root) {
  const secret = () => crypto.randomBytes(32).toString('hex');
  return { ...process.env, GENOS_DISABLE_DOTENV: '1', GENOS_SKIP_BOOT_DB_BACKUP: '1',
    GENOS_COMPLIANCE_ROOT: root, GENOS_DB_PATH: path.join(root, 'workers.db'),
    GENOS_WORKSPACE_ROOT: path.join(root, 'workspaces'),
    GENOS_CAPSULE_ROOT: path.join(root, 'capsules'),
    GENOS_STUDIO_ROOT: path.join(root, 'studio'),
    GENOS_ADMIN_PASSWORD: secret(), GENOS_EPISTEMIC_RECEIPT_SECRET: secret(),
    GENOS_GVX_LEDGER_HMAC_SECRET: secret(), GENOS_COMPLIANCE_DETERMINISTIC_BOUNDED: '1',
    GENOS_COMPLIANCE_LEAN_VERSION: '', GENOS_COMPLIANCE_PERCEPTION: '0',
    GENOS_LOCAL_MODEL: '' };
}

function runKind(environment, kind) {
  const runId = `c2-${crypto.randomBytes(6).toString('hex')}`;
  const executed = spawnSync(process.execPath, [SCRIPT], { cwd: ROOT, encoding: 'utf8',
    timeout: 120000, windowsHide: true, env: { ...environment,
      GENOS_COMPLIANCE_KIND: kind, GENOS_COMPLIANCE_RUN_ID: runId } });
  if (executed.error) throw executed.error;
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
  const promoted = runIsolated('bounded_worker');
  assertPromoted(promoted);
  const formal = runIsolated('formal_worker');
  assertPromoted(formal);
  console.log(JSON.stringify({ milestone: 'P2', benchmarkDigest: promoted.benchmarkDigest,
    missions: [promoted, formal].map(({ exitCode, result }) => ({ runId: result.runId,
      kind: result.kind, exitCode, status: result.status, terminalEvent: result.terminalEvent,
      executionRunBound: result.executionRunBound, artifactValidated: result.artifactValidated,
      oracleAccepted: result.oracleAccepted, oracle: result.oracle, errorCode: result.errorCode })) }));
}

main();
