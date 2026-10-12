'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { KINDS } = require('../src/services/agents/workerKindService');
const { verifiedResult } = require('./workerComplianceSummary.cjs');
const { inventory } = require('./workerQualificationInventory.cjs');

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(__dirname, 'run_worker_compliance_missions.cjs');
const NATIVE_FLAGS = Object.freeze({
  GENOS_COMPLIANCE_DETERMINISTIC_BOUNDED: '1',
  GENOS_COMPLIANCE_DETERMINISTIC_VERIFIER: '1',
  GENOS_COMPLIANCE_DETERMINISTIC_RED: '1',
  GENOS_COMPLIANCE_DETERMINISTIC_EXPERIMENT: '1',
  GENOS_COMPLIANCE_DETERMINISTIC_SYNTHESIS: '1',
  GENOS_COMPLIANCE_DETERMINISTIC_MONITOR: '1',
  GENOS_COMPLIANCE_DETERMINISTIC_FORENSIC: '1',
  GENOS_COMPLIANCE_DETERMINISTIC_SCOUT: '1',
  GENOS_COMPLIANCE_DETERMINISTIC_TEACHING: '1',
  GENOS_COMPLIANCE_DETERMINISTIC_RECOVERY: '1',
  GENOS_COMPLIANCE_DETERMINISTIC_HANDOFF: '1',
  GENOS_COMPLIANCE_DETERMINISTIC_SUBORCH: '1',
  GENOS_COMPLIANCE_DETERMINISTIC_ADAPTIVE: '1', GENOS_COMPLIANCE_DETERMINISTIC_SPECIALIST: '1',
  GENOS_COMPLIANCE_DETERMINISTIC_SYMBIOTIC: '1', GENOS_COMPLIANCE_DETERMINISTIC_CREATIVE: '1',
  GENOS_COMPLIANCE_DETERMINISTIC_MEDICAL: '1'
});

function leanVersion() {
  const executable = process.env.GENOS_LEAN_EXECUTABLE || 'lean';
  const checked = spawnSync(executable, ['--version'], { encoding: 'utf8', windowsHide: true });
  return checked.status === 0 ? checked.stdout.trim() : '';
}

function environment(input) {
  const secret = () => crypto.randomBytes(32).toString('hex');
  const codeWorker = process.env.GENOS_COMPLIANCE_BOUNDED_CODE === '1'
    && input.kind === 'bounded_worker';
  return { ...process.env, ...NATIVE_FLAGS,
    GENOS_COMPLIANCE_DETERMINISTIC_BOUNDED: codeWorker ? '0' : '1',
    GENOS_COMPLIANCE_BOUNDED_CODE: codeWorker ? '1' : '0',
    GENOS_ALLOW_LOCAL_CODE_WORKERS: codeWorker ? '1' : '0', GENOS_DISABLE_DOTENV: '1',
    GENOS_SKIP_BOOT_DB_BACKUP: '1', GENOS_COMPLIANCE_PERCEPTION: '0',
    GENOS_COMPLIANCE_ROOT: input.root, GENOS_DB_PATH: path.join(input.root, 'workers.db'),
    GENOS_WORKSPACE_ROOT: path.join(input.root, 'workspaces'),
    GENOS_CAPSULE_ROOT: path.join(input.root, 'capsules'),
    GENOS_STUDIO_ROOT: path.join(input.root, 'studio'),
    GENOS_ADMIN_PASSWORD: secret(), GENOS_EPISTEMIC_RECEIPT_SECRET: secret(),
    GENOS_GVX_LEDGER_HMAC_SECRET: secret(), GENOS_LOCAL_MODEL: input.model,
    GENOS_COMPLIANCE_LEAN_VERSION: process.env.GENOS_COMPLIANCE_LEAN_VERSION || leanVersion(),
    GENOS_COMPLIANCE_KIND: input.kind, GENOS_COMPLIANCE_RUN_ID: input.runId };
}

function readReport(input) {
  const reportPath = path.join(input.root, 'worker-compliance-report.json');
  if (!fs.existsSync(reportPath)) return { result: null, manifest: null };
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  return { result: report.results.find((entry) => entry.kind === input.kind
    && entry.runId === input.runId) || null, manifest: report.runs?.[input.runId] || null };
}

function removeRoot(root) {
  const resolved = path.resolve(root);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir())
    || !path.basename(resolved).startsWith('genos-worker-qualification-')) {
    throw new Error('Refusing to remove a path outside the dedicated temporary root.');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function runKind(kind, model) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-worker-qualification-'));
  const runId = `q-${crypto.randomBytes(6).toString('hex')}`;
  try {
    const executed = spawnSync(process.execPath, [SCRIPT], { cwd: ROOT,
      env: environment({ root, runId, kind, model }), encoding: 'utf8',
      timeout: 240000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
    const { result, manifest } = readReport({ root, runId, kind });
    const verified = executed.status === 0 && manifest?.runId === runId
      && verifiedResult(result);
    return { kind, runId, exitCode: executed.status, signal: executed.signal || null,
      launchError: executed.error?.message || null, verified,
      result, manifest, stdout: executed.stdout || '', stderr: executed.stderr || '' };
  } finally { removeRoot(root); }
}

function saveReport(output, report) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`);
  fs.renameSync(temporary, output);
}

function main() {
  const output = process.argv[2] && path.resolve(process.argv[2]);
  const selected = process.argv.slice(3);
  if (!output || selected.some((kind) => !Object.hasOwn(KINDS, kind))
    || new Set(selected).size !== selected.length) {
    throw new Error('Usage: node run_worker_qualification_campaign.cjs <output.json> [unique worker kinds...]');
  }
  const kinds = selected.length ? selected : Object.keys(KINDS);
  const model = process.env.GENOS_LOCAL_MODEL || '';
  const report = { schema: 'genos.worker-qualification-campaign/v1',
    capturedAt: new Date().toISOString(), benchmarkDigest: inventory().benchmarkDigest,
    requestedKinds: kinds, model: model || null, results: [] };
  for (const kind of kinds) {
    const item = runKind(kind, model);
    report.results.push(item);
    saveReport(output, report);
    process.stdout.write(`${JSON.stringify({ kind, runId: item.runId, verified: item.verified,
      status: item.result?.status || 'no_report', errorCode: item.result?.errorCode || null,
      exitCode: item.exitCode })}\n`);
  }
  const verified = report.results.filter((item) => item.verified).length;
  process.stdout.write(`${JSON.stringify({ verified, requested: kinds.length, report: output })}\n`);
  if (verified !== kinds.length) process.exitCode = 1;
}

main();
