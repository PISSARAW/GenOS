/**
 * Rust Core Bridge Controller
 *
 * Exposes real genos-cli operations to Studio: snapshot lifecycle,
 * hallucination analysis, replay assertions and state diffing. Every
 * response carries the CLI exit code; JSON payloads additionally get a
 * spec/ schema validation receipt when a matching contract exists.
 */

const fs = require('fs');
const path = require('path');
const cli = require('../services/genosCli');
const { validateSpec } = require('../services/specValidator');

const SNAPSHOT_SCHEMA = 'snapshot.schema.json';

function sendResult(res, operation, run, { validated } = {}) {
  if (run.code === 'BIN_NOT_FOUND' || run.code === 'SPAWN_FAILED' || run.code === 'TIMEOUT') {
    return res.status(503).json({ error: { code: run.code, message: run.error }, operation });
  }

  const payload = {
    operation,
    exitCode: run.exitCode,
    result: run.json !== null ? run.json : run.stdout.trim(),
    stderr: run.stderr.trim() || undefined
  };

  if (validated && run.json && typeof run.json === 'object' && !Array.isArray(run.json)) {
    payload.specValidation = validateSpec(validated, run.json);
  }

  res.json(payload);
}

async function getStatus(req, res) {
  const binPath = cli.resolveGenosBin();
  const available = fs.existsSync(binPath);
  const status = {
    binary: binPath,
    available,
    root: cli.studioBridgeRoot()
  };
  if (!available) {
    status.hint = 'Build the CLI with: cargo build -p genos-cli';
    return res.json(status);
  }
  const run = await cli.runGenos(['--version'], { timeoutMs: 10000 });
  status.version = run.ok ? run.stdout.trim() : null;
  res.json(status);
}

async function createSnapshot(req, res) {
  const name = String(req.body?.name || 'studio-agent').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40);
  const role = String(req.body?.role || 'worker').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40);

  const agentFile = `${name}-genome.yaml`;
  const snapshotFile = path.join('snapshots', `${name}-${Date.now()}.json`);

  const createAgent = await cli.runGenos([
    'agent', 'create', '--name', name, '--role', role, '--out', agentFile
  ]);
  if (!createAgent.ok) {
    return sendResult(res, 'agent_create', createAgent);
  }

  const snapshot = await cli.runGenos([
    'snapshot', 'create', '--agent', agentFile, '--out', snapshotFile
  ]);
  return sendResult(res, 'snapshot_create', snapshot, { validated: SNAPSHOT_SCHEMA });
}

function listSnapshotsDir() {
  const dir = path.join(cli.studioBridgeRoot(), 'snapshots');
  fs.mkdirSync(dir, { recursive: true });
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => ({
      reference: path.join('snapshots', file),
      file,
      sizeBytes: fs.statSync(path.join(dir, file)).size
    }));
}

async function listSnapshots(req, res) {
  res.json({ root: cli.studioBridgeRoot(), snapshots: listSnapshotsDir() });
}

const HALLUCINATION_OPS = ['detect', 'analyze', 'extract'];

async function runHallucination(req, res) {
  const op = req.params.op;
  if (!HALLUCINATION_OPS.includes(op)) {
    return res.status(400).json({ error: { code: 'UNSUPPORTED_OP', message: `op must be one of ${HALLUCINATION_OPS.join(', ')}` } });
  }
  const reference = String(req.body?.snapshot || '');
  const resolved = cli.resolveInRoot(reference);
  if (!reference || !resolved || !fs.existsSync(resolved)) {
    return res.status(400).json({ error: { code: 'SNAPSHOT_NOT_FOUND', message: `snapshot '${reference}' does not exist in the bridge root` } });
  }
  const run = await cli.runGenos(['hallucination', op, '--snapshot', reference]);
  return sendResult(res, `hallucination_${op}`, run);
}

async function simulateHallucination(req, res) {
  const reference = String(req.body?.snapshot || '');
  const resolved = cli.resolveInRoot(reference);
  if (!reference || !resolved || !fs.existsSync(resolved)) {
    return res.status(400).json({ error: { code: 'SNAPSHOT_NOT_FOUND', message: `snapshot '${reference}' does not exist in the bridge root` } });
  }
  const model = String(req.body?.model || 'studio-simulation').slice(0, 60);
  const run = await cli.runGenos(['hallucination', 'simulate', '--model', model, '--snapshot', reference]);
  return sendResult(res, 'hallucination_simulate', run);
}

async function replayBranch(req, res) {
  const reference = String(req.body?.snapshot || '');
  const resolved = cli.resolveInRoot(reference);
  if (!resolved || !fs.existsSync(resolved)) {
    return res.status(400).json({ error: { code: 'SNAPSHOT_NOT_FOUND', message: `snapshot '${reference}' does not exist in the bridge root` } });
  }
  const run = await cli.runGenos(['replay', 'basic', '--snapshot', reference]);
  return sendResult(res, 'replay_basic', run);
}

async function diffSnapshots(req, res) {
  const a = String(req.body?.a || '');
  const b = String(req.body?.b || '');
  const resolvedA = cli.resolveInRoot(a);
  const resolvedB = cli.resolveInRoot(b);
  if (!a || !b || !resolvedA || !resolvedB || !fs.existsSync(resolvedA) || !fs.existsSync(resolvedB)) {
    return res.status(400).json({ error: { code: 'SNAPSHOT_NOT_FOUND', message: 'both a and b must be existing snapshot references in the bridge root' } });
  }
  const run = await cli.runGenos(['diff', a, b]);
  return sendResult(res, 'diff', run);
}

module.exports = {
  getStatus,
  createSnapshot,
  listSnapshots,
  runHallucination,
  simulateHallucination,
  replayBranch,
  diffSnapshots
};
