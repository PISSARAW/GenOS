'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const gate = require('./agentCapsuleGate');
const paths = require('./trinityCapsulePaths');
const store = require('./trinityCapsuleSealStore');

const MAX_FINGERPRINT_ENTRIES = 10000;

function recoveryError(message, code = 'TRINITY_CAPSULE_RECOVERY_AMBIGUOUS') {
  return Object.assign(new Error(message), { code });
}

function recoveryPaths(resolved) {
  const scopeHash = paths.hash(resolved.correlation);
  const runtimeRoot = paths.contained(resolved.capsuleRoot,
    path.join(resolved.capsuleRoot, '.genos-runtime'));
  return {
    lock: paths.assertPath(resolved.root + '.lock'),
    quarantine: paths.contained(runtimeRoot, path.join(runtimeRoot, 'trinity-quarantine', scopeHash)),
    receipt: paths.contained(runtimeRoot, path.join(runtimeRoot, 'trinity-recovery', `${scopeHash}.json`))
  };
}

async function exists(target) {
  try { await fs.lstat(target); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function collectEntries(root, relative = '', state = { count: 0 }) {
  const current = paths.contained(root, path.join(root, relative));
  const entries = [];
  for (const item of await fs.readdir(current, { withFileTypes: true })) {
    const child = path.join(relative, item.name);
    const stat = await fs.lstat(paths.contained(root, path.join(root, child)));
    state.count += 1;
    entries.push({ path: child.split(path.sep).join('/'), type: item.isDirectory() ? 'directory'
      : item.isSymbolicLink() ? 'link' : 'file', size: stat.size });
    if (state.count > MAX_FINGERPRINT_ENTRIES) {
      throw recoveryError('Partial capsule exceeds the bounded recovery inventory.',
        'TRINITY_CAPSULE_RECOVERY_LIMIT');
    }
    if (item.isDirectory()) entries.push(...await collectEntries(root, child, state));
  }
  return entries;
}

async function fingerprint(root) {
  const entries = await collectEntries(root);
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return {
    entryCount: entries.length,
    digest: crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex')
  };
}

function buildReceipt(resolved, recovery, inventory) {
  const payload = {
    schema: 'trinity.capsule-recovery/v1',
    correlation: resolved.correlation,
    decision: 'QUARANTINED',
    reason: 'UNSEALED_PARTIAL_CAPSULE',
    sourceRoot: resolved.root,
    quarantineRoot: recovery.quarantine,
    evidenceDigest: inventory.digest,
    evidenceEntries: inventory.entryCount,
    promotionEligible: false,
    independentReviewRequired: true,
    recoveredAt: new Date().toISOString()
  };
  return { ...payload, hash: paths.hash(payload) };
}

async function readReceipt(target) {
  try {
    const receipt = JSON.parse(await fs.readFile(target, 'utf8'));
    const { hash, ...payload } = receipt;
    if (receipt.schema !== 'trinity.capsule-recovery/v1' || paths.hash(payload) !== hash) {
      throw recoveryError('Capsule recovery receipt is invalid.');
    }
    return receipt;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function assertNoSealAnchor(context, resolved) {
  const anchor = await store.anchor(context, resolved.correlation);
  if (anchor) {
    throw recoveryError('A sealed capsule anchor exists; filesystem recovery requires escalation.');
  }
}

async function reconcileMovedCapsule(resolved, recovery) {
  const inventory = await fingerprint(recovery.quarantine);
  const receipt = buildReceipt(resolved, recovery, inventory);
  paths.ensureDirectory(path.dirname(recovery.receipt));
  await fs.writeFile(recovery.receipt, JSON.stringify(receipt, null, 2), { flag: 'wx', mode: 0o600 });
  return receipt;
}

function isReconciled(receipt, state) {
  return Boolean(receipt && !state.source && state.quarantine);
}

function isAmbiguous(receipt, state) {
  if (receipt) return true;
  return state.source === state.quarantine;
}

async function recoverLocked(context, resolved, recovery) {
  await assertNoSealAnchor(context, resolved);
  const receipt = await readReceipt(recovery.receipt);
  const state = {
    source: await exists(resolved.root),
    quarantine: await exists(recovery.quarantine)
  };
  if (state.source && await exists(path.join(resolved.root, 'capsule-seal.json'))) {
    throw recoveryError('A sealed capsule cannot enter partial recovery.');
  }
  if (isReconciled(receipt, state)) return receipt;
  if (isAmbiguous(receipt, state)) {
    throw recoveryError('Capsule recovery state is ambiguous and requires escalation.');
  }
  if (state.source) {
    paths.ensureDirectory(path.dirname(recovery.quarantine));
    await fs.rename(resolved.root, recovery.quarantine);
  }
  return reconcileMovedCapsule(resolved, recovery);
}

async function recover(context = {}) {
  const resolved = gate.resolveCapsulePaths(context);
  if (!resolved.correlation) throw recoveryError('Correlated capsule recovery is required.');
  const recovery = recoveryPaths(resolved);
  await fs.mkdir(recovery.lock);
  try { return await recoverLocked(context, resolved, recovery); }
  finally { await fs.rmdir(recovery.lock); }
}

module.exports = { recover };
