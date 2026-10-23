'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { resolveContainedPathNoSymlinkSync, resolveWorkspaceRoot } = require('./pathSafety');
const { digest: evidenceDigest } = require('./evidenceContractService');

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function genesis(snapshot) {
  return digest(`genesis|${snapshot.snapshot_id}|${snapshot.agent_id}|${snapshot.branch_id}|${snapshot.world_id}`);
}

function stepHash(previous, action, payload) {
  return digest(`${previous}|1|${action}|0.0000000000|0.0000000000|${JSON.stringify(payload)}`);
}

function makeSnapshot(base, input) {
  const source = base || {};
  const workerId = String(input.workerId || '');
  const runId = String(input.runId || '');
  const reportHash = evidenceDigest(input.evidenceReport);
  const snapshotId = `snap-${digest(`${workerId}|${runId}|${reportHash}`).slice(0, 32)}`;
  const snapshot = {
    snapshot_id: snapshotId,
    agent_id: source.agent_id || workerId,
    branch_id: source.branch_id || `branch-${digest(workerId).slice(0, 8)}`,
    world_id: source.world_id || input.worldId || 'world-main',
    created_at: new Date().toISOString(),
    genome: source.genome || {},
    state: { ...(source.state || {}), execution_status: 'completed',
      working_memory: [] }
  };
  const genesisHash = genesis(snapshot);
  snapshot.state.genesis_hash = genesisHash;
  const previous = snapshot.state.working_memory.at(-1)?.step_hash || genesisHash;
  const action = 'worker_evidence_report';
  const payload = { evidenceReportHash: reportHash, executionRunId: runId };
  snapshot.state.working_memory.push({ step: snapshot.state.working_memory.length + 1,
    action, delta_entropy: 0, delta_dissonance: 0, payload, prev_hash: previous,
    step_hash: stepHash(previous, action, payload) });
  return { snapshot, reportHash };
}

async function createReplaySnapshot(input) {
  const root = resolveWorkspaceRoot(input.workspaceRoot, 'worker workspace');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(String(input.runId || ''))) {
    throw Object.assign(new Error('Worker replay runId is invalid.'), { code: 'WORKER_REPLAY_RUN_INVALID' });
  }
  const relative = path.posix.join('.genos', 'evidence-snapshots', `${input.runId}.json`);
  const output = resolveContainedPathNoSymlinkSync(root, relative, 'evidence snapshot');
  const directory = path.dirname(output);
  await fs.mkdir(directory, { recursive: true });
  resolveContainedPathNoSymlinkSync(root, relative, 'evidence snapshot');
  const base = input.sourceSnapshot
    ? JSON.parse(await fs.readFile(input.sourceSnapshot, 'utf8')) : {};
  const { snapshot, reportHash } = makeSnapshot(base, input);
  const temporary = `${output}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(snapshot, null, 2), { flag: 'wx', mode: 0o600 });
    await fs.link(temporary, output);
    await fs.rm(temporary, { force: true });
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    if (error.code !== 'EEXIST' && error.code !== 'EPERM') throw error;
    const existing = JSON.parse(await fs.readFile(output, 'utf8'));
    const last = existing.state?.working_memory?.at(-1);
    if (existing.snapshot_id !== snapshot.snapshot_id || last?.action !== 'worker_evidence_report'
        || last.payload?.executionRunId !== input.runId
        || last.payload?.evidenceReportHash !== reportHash) throw error;
  }
  return { snapshotPath: output, reportHash };
}

module.exports = { createReplaySnapshot, makeSnapshot, genesis, stepHash };
