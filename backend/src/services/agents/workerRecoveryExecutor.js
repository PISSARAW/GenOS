'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { methodInput, error, text, receipt, resultReport } = require('./workerNativeEvidence');
const { assertActive } = require('./workerNativeLifecycle');

const digest = (content) => createHash('sha256').update(content).digest('hex');
const isDigest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function assertRecoveryInput(method) {
  const input = methodInput(method, 'restore_checkpoint');
  if (!text(input.path, 1024) || path.isAbsolute(input.path)) throw error('WORKER_RECOVERY_INPUT_INVALID', 'A relative target path is required.');
  if (typeof input.content !== 'string' || Buffer.byteLength(input.content) > 1048576) {
    throw error('WORKER_RECOVERY_INPUT_INVALID', 'A checkpoint up to one MiB is required.');
  }
  if (!isDigest(input.checkpointDigest) || !isDigest(input.expectedCurrentDigest)) {
    throw error('WORKER_RECOVERY_INPUT_INVALID', 'Checkpoint and current-state SHA-256 digests are required.');
  }
  if (digest(input.content) !== input.checkpointDigest) throw error('WORKER_RECOVERY_INPUT_INVALID', 'Checkpoint digest mismatch.');
  return true;
}

function confined(root, target) {
  const relative = path.relative(root, target);
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function resolveTarget(mission, input) {
  const contract = mission.workerContract;
  const lease = contract?.mission?.recoveryLease;
  if (lease?.action !== 'restore_checkpoint' || lease.path !== input.path || contract.authority?.execute !== true) {
    throw error('WORKER_CONTRACT_DENIED', 'Restoration requires the persisted action and target lease.');
  }
  const root = await fs.realpath(mission.workspaceRoot);
  const scoped = await fs.realpath(contract.mission.scope);
  if (root !== scoped) throw error('WORKER_CONTRACT_DENIED', 'Recovery workspace differs from the persisted scope.');
  const target = path.resolve(root, input.path);
  if (!confined(root, target) || input.path.includes(':')) throw error('WORKER_CONTRACT_DENIED', 'Recovery target is outside the workspace.');
  const actual = await fs.realpath(target);
  if (actual !== target || (await fs.lstat(target)).isSymbolicLink()) {
    throw error('WORKER_CONTRACT_DENIED', 'Recovery through symbolic links or junctions is forbidden.');
  }
  if (!(await fs.stat(target)).isFile()) throw error('WORKER_RECOVERY_INPUT_INVALID', 'Recovery target must be a file.');
  return target;
}

async function checkCurrent(target, expected) {
  const stat = await fs.stat(target);
  if (stat.size > 1048576) throw error('WORKER_RECOVERY_INPUT_INVALID', 'Current state exceeds one MiB.');
  if (digest(await fs.readFile(target)) !== expected) {
    throw error('WORKER_RECOVERY_CONFLICT', 'Current state changed since the recovery was assigned.');
  }
}

async function restoreFile(target, input, context) {
  const { mission } = context;
  const temporary = `${target}.genos-${randomUUID()}.tmp`;
  const permissions = (await fs.stat(target)).mode;
  try {
    await fs.writeFile(temporary, input.content, { flag: 'wx', mode: permissions });
    await resolveTarget(mission, input);
    await checkCurrent(target, input.expectedCurrentDigest);
    assertActive(context);
    await fs.rename(temporary, target);
    const restoredDigest = digest(await fs.readFile(target));
    if (restoredDigest !== input.checkpointDigest) throw error('WORKER_RECOVERY_VERIFY_FAILED', 'Restored state does not match the checkpoint.');
    return restoredDigest;
  } finally {
    await fs.unlink(temporary).catch((failure) => { if (failure.code !== 'ENOENT') throw failure; });
  }
}

async function runRecovery(method, context) {
  assertRecoveryInput(method);
  const input = method.parameters;
  const target = await resolveTarget(context.mission, input);
  await checkCurrent(target, input.expectedCurrentDigest);
  const restoredDigest = await restoreFile(target, input, context);
  const executionReceipt = receipt(method, { path: input.path, restoredDigest, priorDigest: input.expectedCurrentDigest });
  return resultReport(method, { recoveryReceipt: { action: 'restore_checkpoint',
    restoredState: `sha256:${restoredDigest}`, receiptId: executionReceipt.id,
    evidence: [executionReceipt.id] }, checkpointReceipt: executionReceipt },
  { type: 'dossier', statement: `Checkpoint restored and verified for '${input.path}'.`, sourceRefs: [executionReceipt.id] });
}

module.exports = { assertRecoveryInput, runRecovery };
