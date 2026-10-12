'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { KINDS } = require('../src/services/agents/workerKindService');
const gate = require('../src/services/workerMissionQualificationIntegration');
const { inventory } = require('./workerQualificationInventory.cjs');

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(__dirname, 'run_worker_compliance_missions.cjs');
const FLAGS = Object.freeze({
  GENOS_COMPLIANCE_DETERMINISTIC_BOUNDED: '1', GENOS_COMPLIANCE_DETERMINISTIC_VERIFIER: '1',
  GENOS_COMPLIANCE_DETERMINISTIC_RED: '1', GENOS_COMPLIANCE_DETERMINISTIC_EXPERIMENT: '1',
  GENOS_COMPLIANCE_DETERMINISTIC_SYNTHESIS: '1', GENOS_COMPLIANCE_DETERMINISTIC_MONITOR: '1',
  GENOS_COMPLIANCE_DETERMINISTIC_FORENSIC: '1', GENOS_COMPLIANCE_DETERMINISTIC_SCOUT: '1',
  GENOS_COMPLIANCE_DETERMINISTIC_TEACHING: '1', GENOS_COMPLIANCE_DETERMINISTIC_RECOVERY: '1',
  GENOS_COMPLIANCE_DETERMINISTIC_HANDOFF: '1', GENOS_COMPLIANCE_DETERMINISTIC_SUBORCH: '1',
  GENOS_COMPLIANCE_DETERMINISTIC_ADAPTIVE: '1', GENOS_COMPLIANCE_DETERMINISTIC_SPECIALIST: '1',
  GENOS_COMPLIANCE_DETERMINISTIC_SYMBIOTIC: '1', GENOS_COMPLIANCE_DETERMINISTIC_CREATIVE: '1',
  GENOS_COMPLIANCE_DETERMINISTIC_MEDICAL: '1'
});

function leanVersion() {
  const executable = process.env.GENOS_LEAN_EXECUTABLE || 'lean';
  const checked = spawnSync(executable, ['--version'], { encoding: 'utf8', windowsHide: true });
  return checked.status === 0 ? checked.stdout.trim() : '';
}

function environment(root, kind, runId) {
  const secret = () => crypto.randomBytes(32).toString('hex');
  const codeWorker = process.env.GENOS_COMPLIANCE_BOUNDED_CODE === '1' && kind === 'bounded_worker';
  return { ...process.env, ...FLAGS,
    GENOS_COMPLIANCE_DETERMINISTIC_BOUNDED: codeWorker ? '0' : '1',
    GENOS_COMPLIANCE_BOUNDED_CODE: codeWorker ? '1' : '0',
    GENOS_ALLOW_LOCAL_CODE_WORKERS: codeWorker ? '1' : '0', GENOS_DISABLE_DOTENV: '1', GENOS_SKIP_BOOT_DB_BACKUP: '1',
    GENOS_COMPLIANCE_PERCEPTION: '0', GENOS_COMPLIANCE_ROOT: root,
    GENOS_DB_PATH: path.join(root, 'workers.db'),
    GENOS_WORKSPACE_ROOT: path.join(root, 'workspaces'),
    GENOS_CAPSULE_ROOT: path.join(root, 'capsules'),
    GENOS_STUDIO_ROOT: path.join(root, 'studio'), GENOS_ADMIN_PASSWORD: secret(),
    GENOS_EPISTEMIC_RECEIPT_SECRET: secret(), GENOS_GVX_LEDGER_HMAC_SECRET: secret(),
    GENOS_COMPLIANCE_LEAN_VERSION: process.env.GENOS_COMPLIANCE_LEAN_VERSION || leanVersion(),
    GENOS_COMPLIANCE_KIND: kind, GENOS_COMPLIANCE_RUN_ID: runId };
}

function missionReport(root, kind, runId) {
  const filename = path.join(root, 'worker-compliance-report.json');
  if (!fs.existsSync(filename)) return { result: null, manifest: null };
  const report = JSON.parse(fs.readFileSync(filename, 'utf8'));
  return { result: report.results?.find((entry) => entry.kind === kind && entry.runId === runId) || null,
    manifest: report.runs?.[runId] || null };
}

function removeRoot(root) {
  const resolved = path.resolve(root);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir())
    || !path.basename(resolved).startsWith('genos-worker-gate-')) {
    throw new Error('Refusing to remove a path outside the dedicated temporary root.');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function timeoutFor(options) {
  return options.timeoutMs || Number(process.env.GENOS_COMPLIANCE_TIMEOUT_MS) || 240000;
}

async function runKind(kind, seenNonces, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-worker-gate-'));
  const runId = `q-${crypto.randomBytes(6).toString('hex')}`;
  try {
    const env = environment(root, kind, runId);
    const executed = spawnSync(process.execPath, [options.script || SCRIPT], { cwd: ROOT,
      env, encoding: 'utf8',
      timeout: timeoutFor(options),
      maxBuffer: 16 * 1024 * 1024, windowsHide: true });
    const saved = missionReport(root, kind, runId);
    const item = { kind, runId, exitCode: executed.status, signal: executed.signal || null,
      launchError: executed.error?.message || null, ...saved };
    let qualification = { status: 'inconclusive', reason: 'mission_evidence_missing' };
    const databasePath = path.join(root, 'workers.db');
    if (saved.result && fs.existsSync(databasePath)) {
      const db = await open({ filename: databasePath, driver: sqlite3.Database });
      try {
        if (options.beforeQualification) await options.beforeQualification(db, item);
        qualification = await withEvidenceSecrets(env, () => gate.evaluate(db, item, seenNonces));
      }
      finally { await db.close(); }
    }
    return { ...item, qualification, verified: qualification.status === 'verified',
      stdout: executed.stdout || '', stderr: executed.stderr || '' };
  } finally { removeRoot(root); }
}

async function withEvidenceSecrets(env, action) {
  const names = ['GENOS_EPISTEMIC_RECEIPT_SECRET', 'GENOS_GVX_LEDGER_HMAC_SECRET'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) process.env[name] = env[name];
  try { return await action(); }
  finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

function saveReport(output, report) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`);
  fs.renameSync(temporary, output);
}

async function main() {
  const output = process.argv[2] && path.resolve(process.argv[2]);
  const selected = process.argv.slice(3);
  if (!output || selected.some((kind) => !Object.hasOwn(KINDS, kind))
    || new Set(selected).size !== selected.length) {
    throw new Error('Usage: node run_worker_gate_campaign.cjs <output.json> [unique worker kinds...]');
  }
  const kinds = selected.length ? selected : Object.keys(KINDS);
  const report = { schema: 'genos.worker-gate-campaign/v1', capturedAt: new Date().toISOString(),
    benchmarkDigest: inventory().benchmarkDigest, requestedKinds: kinds, results: [] };
  const seenNonces = new Set();
  for (const kind of kinds) {
    const item = await runKind(kind, seenNonces);
    report.results.push(item);
    saveReport(output, report);
    process.stdout.write(`${JSON.stringify({ kind, runId: item.runId,
      qualification: item.qualification, verified: item.verified })}\n`);
  }
  report.verified = report.results.filter((item) => item.verified).length;
  saveReport(output, report);
  if (report.verified !== kinds.length) process.exitCode = 1;
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { runKind };
