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

function tenantBridgeRoot(req) {
  const scope = req.tenant;
  const root = cli.studioBridgeRoot();
  const safe = (value) => String(value).replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(root, 'tenants', safe(scope.organizationId), safe(scope.projectId));
}

function isUnavailable(run) {
  return ['BIN_NOT_FOUND', 'SPAWN_FAILED', 'TIMEOUT'].includes(run.code);
}

function resultPayload(operation, run) {
  return {
    operation,
    exitCode: run.exitCode,
    result: run.json !== null ? run.json : run.stdout.trim(),
    stderr: run.stderr.trim() || undefined
  };
}

function addSpecValidation(payload, validated, run) {
  if (validated && run.json && typeof run.json === 'object' && !Array.isArray(run.json)) {
    payload.specValidation = validateSpec(validated, run.json);
  }
}

function sendResult({ res, operation, run, validated } = {}) {
  if (isUnavailable(run)) return res.status(503).json({ error: { code: run.code, message: run.error }, operation });
  const payload = resultPayload(operation, run);
  addSpecValidation(payload, validated, run);

  if (!run.ok || (Number.isInteger(run.exitCode) && run.exitCode !== 0)) {
    return res.status(502).json({ error: { code: 'CLI_COMMAND_FAILED', message: run.stderr?.trim() || `CLI exited with code ${run.exitCode}.` }, ...payload });
  }
  res.json(payload);
}

async function getStatus(req, res) {
  const root = tenantBridgeRoot(req);
  const binPath = cli.resolveGenosBin();
  const available = fs.existsSync(binPath);
  const status = {
    binary: binPath,
    available,
    root
  };
  if (!available) {
    status.hint = 'Build the CLI with: cargo build -p genos-cli';
    return res.json(status);
  }
  const run = await cli.runGenos(['--version'], { timeoutMs: 10000, root });
  if (!run.ok) return res.status(503).json({ error: { code: 'CLI_UNAVAILABLE', message: run.stderr?.trim() || run.error || 'Unable to execute genos --version.' }, ...status });
  status.version = run.ok ? run.stdout.trim() : null;
  res.json(status);
}

async function createSnapshot(req, res) {
  const name = String(req.body?.name || 'studio-agent').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40);
  const role = String(req.body?.role || 'worker').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40);

  const agentFile = `${name}-genome.yaml`;
  const snapshotFile = path.join('snapshots', `${name}-${Date.now()}.json`);

  const root = tenantBridgeRoot(req);
  const createAgent = await cli.runGenos([
    'agent', 'create', '--name', name, '--role', role, '--out', agentFile
  ], { root });
  if (!createAgent.ok) {
    return sendResult({ res, operation: 'agent_create', run: createAgent });
  }

  const snapshot = await cli.runGenos([
    'snapshot', 'create', '--agent', agentFile, '--out', snapshotFile
  ], { root });

  // The CLI prints a plain confirmation line; validate the actual written
  // snapshot against spec/snapshot.schema.json instead of parsing stdout.
  const written = cli.resolveInRoot(snapshotFile, root);
  if (snapshot.ok && written && fs.existsSync(written)) {
    try {
      const snapshotObject = JSON.parse(fs.readFileSync(written, 'utf8'));
      return res.json({
        operation: 'snapshot_create',
        exitCode: snapshot.exitCode,
        result: { reference: snapshotFile, snapshot: snapshotObject },
        specValidation: validateSpec(SNAPSHOT_SCHEMA, snapshotObject)
      });
    } catch {}
  }

  return sendResult({ res, operation: 'snapshot_create', run: snapshot });
}

function listSnapshotsDir(req) {
  const dir = path.join(tenantBridgeRoot(req), 'snapshots');
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
  res.json({ root: tenantBridgeRoot(req), snapshots: listSnapshotsDir(req) });
}

const HALLUCINATION_OPS = ['detect', 'analyze', 'extract'];

function isSnapshotReferenceValid(reference, root) {
  const resolved = cli.resolveInRoot(reference, root);
  return Boolean(reference && resolved && fs.existsSync(resolved));
}

async function runHallucination(req, res) {
  const op = req.params.op;
  if (!HALLUCINATION_OPS.includes(op)) {
    return res.status(400).json({ error: { code: 'UNSUPPORTED_OP', message: `op must be one of ${HALLUCINATION_OPS.join(', ')}` } });
  }
  const reference = String(req.body?.snapshot || '');
  const root = tenantBridgeRoot(req);
  if (!isSnapshotReferenceValid(reference, root)) {
    return res.status(400).json({ error: { code: 'SNAPSHOT_NOT_FOUND', message: `snapshot '${reference}' does not exist in the bridge root` } });
  }
  const run = await cli.runGenos(['hallucination', op, '--snapshot', reference], { root });
  return sendResult({ res, operation: `hallucination_${op}`, run });
}

async function simulateHallucination(req, res) {
  const reference = String(req.body?.snapshot || '');
  const root = tenantBridgeRoot(req);
  if (!isSnapshotReferenceValid(reference, root)) {
    return res.status(400).json({ error: { code: 'SNAPSHOT_NOT_FOUND', message: `snapshot '${reference}' does not exist in the bridge root` } });
  }
  const model = String(req.body?.model || 'studio-simulation').slice(0, 60);
  const run = await cli.runGenos(['hallucination', 'simulate', '--model', model, '--snapshot', reference], { root });
  return sendResult({ res, operation: 'hallucination_simulate', run });
}

async function replayBranch(req, res) {
  const reference = String(req.body?.snapshot || '');
  const root = tenantBridgeRoot(req);
  if (!isSnapshotReferenceValid(reference, root)) {
    return res.status(400).json({ error: { code: 'SNAPSHOT_NOT_FOUND', message: `snapshot '${reference}' does not exist in the bridge root` } });
  }
  const run = await cli.runGenos(['replay', 'basic', '--snapshot', reference], { root });
  return sendResult({ res, operation: 'replay_basic', run });
}

async function diffSnapshots(req, res) {
  const a = String(req.body?.a || '');
  const b = String(req.body?.b || '');
  const root = tenantBridgeRoot(req);
  if (!isSnapshotReferenceValid(a, root) || !isSnapshotReferenceValid(b, root)) {
    return res.status(400).json({ error: { code: 'SNAPSHOT_NOT_FOUND', message: 'both a and b must be existing snapshot references in the bridge root' } });
  }
  const run = await cli.runGenos(['diff', a, b], { root });
  return sendResult({ res, operation: 'diff', run });
}

async function generateModel(req, res, next) {
  try {
    const { prompt, agentId } = req.body;
    if (!prompt) return res.status(400).json({ error: { code: 'MISSING_PROMPT', message: 'prompt is required.' } });
    const modelRouter = require('../services/modelRouter');
    const generated = await modelRouter.generate({ db: null, agentId: agentId || 'world_runner', prompt, timeoutMs: 90000 });
    res.json({ text: generated });
  } catch (error) {
    if (next) return next(error);
    throw error;
  }
}

module.exports = {
  getStatus,
  createSnapshot,
  listSnapshots,
  runHallucination,
  simulateHallucination,
  replayBranch,
  diffSnapshots,
  generateModel
};
