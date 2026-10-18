'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { withTransaction } = require('../../db');
const { resolveContainedPathNoSymlinkSync } = require('../pathSafety');
const { createManifest } = require('./manifest');
const { blobPath, putBlob, readBlob, sha256 } = require('./objects');
const { canonicalJson, digest } = require('./replication');
const storage = require('./storage');

const PROTOCOL = 'gqwf-cas-repair-v1';
const REPLICATION_PROTOCOL = 'gqwf-cas-replication-v1';

function assertScope(source, target) {
  const sameOrganization = source.organization_id
    && source.organization_id === target.organization_id;
  if (!sameOrganization || source.project_id !== target.project_id) {
    throw new Error('GQWF repair requires source and target in the same tenant scope.');
  }
  if (source.id === target.id) throw new Error('GQWF repair target must differ from source.');
}

function uniqueBlobs(manifest) {
  const blobs = new Map();
  for (const file of manifest.files) blobs.set(file.hash, { hash: file.hash, size: file.size });
  return [...blobs.values()].sort((left, right) => left.hash.localeCompare(right.hash));
}

function isPrivateFile(stat) {
  return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1;
}

async function verifiedSourceBlob(workspacePath, blob) {
  const location = blobPath(workspacePath, blob.hash);
  const stat = await fs.lstat(location);
  if (!isPrivateFile(stat)) throw new Error(`GQWF repair source blob is unsafe: ${blob.hash}`);
  const bytes = await readBlob(workspacePath, blob.hash);
  const finalStat = await fs.lstat(location);
  const unchanged = isPrivateFile(finalStat) && stat.dev === finalStat.dev
    && stat.ino === finalStat.ino;
  if (!unchanged) throw new Error(`GQWF repair source blob changed: ${blob.hash}`);
  if (bytes.length !== blob.size) throw new Error(`GQWF repair source blob size mismatch: ${blob.hash}`);
  return bytes;
}

async function targetState(workspacePath, blob) {
  try {
    const location = blobPath(workspacePath, blob.hash);
    const stat = await fs.lstat(location);
    if (!isPrivateFile(stat)) throw new Error(`GQWF repair target blob is unsafe: ${blob.hash}`);
    const bytes = await fs.readFile(location);
    const finalStat = await fs.lstat(location);
    const unchanged = isPrivateFile(finalStat) && stat.dev === finalStat.dev
      && stat.ino === finalStat.ino;
    if (!unchanged) throw new Error(`GQWF repair target blob changed: ${blob.hash}`);
    const actualHash = sha256(bytes);
    const status = actualHash === blob.hash && bytes.length === blob.size
      ? 'healthy' : 'corrupt';
    return { ...blob, status, actualHash, actualSize: bytes.length };
  } catch (error) {
    if (error.code === 'ENOENT') return { ...blob, status: 'missing' };
    throw error;
  }
}

function verifyReplicationRow(row, input) {
  if (!row) throw new Error('GQWF repair requires a verified replication receipt.');
  const receipt = JSON.parse(row.receipt_json);
  const bindings = [
    [receipt.protocol, REPLICATION_PROTOCOL],
    [receipt.sourceWorkspaceId, input.sourceWorkspaceId],
    [receipt.targetWorkspaceId, input.targetWorkspaceId],
    [receipt.rootHash, input.rootHash],
    [receipt.planHash, row.plan_hash],
    [receipt.planHash, input.expectedReplicationPlanHash]
  ];
  const evidence = receipt.authorizationEvidenceId;
  const valid = digest(receipt) === row.receipt_hash
    && bindings.every(([actual, expected]) => actual === expected)
    && typeof evidence === 'string' && evidence.length > 0;
  if (!valid) throw new Error('GQWF repair replication receipt integrity check failed.');
  return row.receipt_hash;
}

async function replicationEvidence(db, input) {
  const row = await db.get(`SELECT plan_hash, receipt_hash, receipt_json
    FROM gqwf_replication_receipts WHERE source_workspace_id = ?
      AND target_workspace_id = ? AND root_hash = ? ORDER BY rowid DESC LIMIT 1`,
  input.sourceWorkspaceId, input.targetWorkspaceId, input.rootHash);
  return verifyReplicationRow(row, input);
}

async function buildPlan(db, input) {
  const [source, target] = await Promise.all([
    storage.workspace(db, input.sourceWorkspaceId),
    storage.workspace(db, input.targetWorkspaceId)
  ]);
  assertScope(source, target);
  const [sourceManifest, targetManifest] = await Promise.all([
    storage.root(db, source.id, input.rootHash), storage.root(db, target.id, input.rootHash)
  ]);
  const sourceRoot = createManifest(sourceManifest.files);
  const targetRoot = createManifest(targetManifest.files);
  if (sourceRoot.hash !== input.rootHash || targetRoot.hash !== input.rootHash) {
    throw new Error('GQWF repair root identity changed.');
  }
  const blobs = uniqueBlobs(sourceManifest);
  for (const blob of blobs) await verifiedSourceBlob(source.path, blob);
  const replicationPlan = { protocol: REPLICATION_PROTOCOL,
    sourceWorkspaceId: source.id, targetWorkspaceId: target.id,
    organizationId: source.organization_id, projectId: source.project_id ?? null,
    rootHash: input.rootHash, blobs };
  const replicationReceiptHash = await replicationEvidence(db,
    { ...input, expectedReplicationPlanHash: digest(replicationPlan) });
  const states = [];
  for (const blob of blobs) states.push(await targetState(target.path, blob));
  const beforeInventoryHash = digest({ rootHash: input.rootHash, blobs: states });
  const damaged = states.filter((blob) => blob.status !== 'healthy');
  const body = { protocol: PROTOCOL, sourceWorkspaceId: source.id,
    targetWorkspaceId: target.id, organizationId: source.organization_id,
    projectId: source.project_id ?? null, rootHash: input.rootHash,
    replicationReceiptHash, beforeInventoryHash, damagedBlobs: damaged };
  return { body, planHash: digest(body), source, target, blobs, damaged };
}

function authorizationRequest(plan, operation) {
  return { operation, protocol: PROTOCOL,
    sourceWorkspaceId: plan.body.sourceWorkspaceId,
    targetWorkspaceId: plan.body.targetWorkspaceId,
    organizationId: plan.body.organizationId, projectId: plan.body.projectId,
    rootHash: plan.body.rootHash, planHash: plan.planHash,
    beforeInventoryHash: plan.body.beforeInventoryHash,
    replicationReceiptHash: plan.body.replicationReceiptHash };
}

function assertAuthorization(request, verdict) {
  const fields = ['operation', 'protocol', 'sourceWorkspaceId', 'targetWorkspaceId',
    'organizationId', 'projectId', 'rootHash', 'planHash', 'beforeInventoryHash',
    'replicationReceiptHash'];
  const bound = verdict?.allowed === true
    && fields.every((field) => verdict[field] === request[field]);
  if (!bound || typeof verdict.evidenceId !== 'string' || !verdict.evidenceId.trim()) {
    throw new Error('GQWF repair lacks bound authorization evidence.');
  }
}

async function authorize(options, plan, operation) {
  if (typeof options.authorizeRepair !== 'function') {
    throw new Error('GQWF repair authorizer is unavailable.');
  }
  const request = authorizationRequest(plan, operation);
  const verdict = await options.authorizeRepair(request);
  assertAuthorization(request, verdict);
  return verdict;
}

function preview(plan, authorization) {
  return { protocol: PROTOCOL, mode: 'preview', planHash: plan.planHash,
    sourceWorkspaceId: plan.source.id, targetWorkspaceId: plan.target.id,
    rootHash: plan.body.rootHash, beforeInventoryHash: plan.body.beforeInventoryHash,
    repairBlobCount: plan.damaged.length,
    missingBlobCount: plan.damaged.filter((blob) => blob.status === 'missing').length,
    corruptBlobCount: plan.damaged.filter((blob) => blob.status === 'corrupt').length,
    authorizationEvidenceId: authorization.evidenceId };
}

async function inspectRepair(db, input, options = {}) {
  const plan = await buildPlan(db, input);
  return preview(plan, await authorize(options, plan, 'inspect'));
}

function quarantineLocation(workspacePath, hash) {
  const relative = `.genos/gqwf/quarantine/${hash}/${crypto.randomUUID()}.blob`;
  return resolveContainedPathNoSymlinkSync(workspacePath, relative, 'GQWF repair quarantine');
}

async function replaceDamaged(plan, blob) {
  const bytes = await verifiedSourceBlob(plan.source.path, blob);
  const state = await targetState(plan.target.path, blob);
  if (state.status === 'healthy') return { repaired: false, quarantined: false };
  if (digest(state) !== digest(blob)) throw new Error('GQWF repair plan changed during apply.');
  let quarantined = false;
  if (state.status === 'corrupt') {
    const quarantine = quarantineLocation(plan.target.path, blob.hash);
    await fs.mkdir(path.dirname(quarantine), { recursive: true });
    await fs.rename(blobPath(plan.target.path, blob.hash), quarantine);
    const quarantinedBytes = await fs.readFile(quarantine);
    if (sha256(quarantinedBytes) !== blob.actualHash
      || quarantinedBytes.length !== blob.actualSize) {
      throw new Error('GQWF repair target changed during quarantine.');
    }
    quarantined = true;
  }
  const storedHash = await putBlob(plan.target.path, bytes);
  if (storedHash !== blob.hash) throw new Error('GQWF repair changed blob identity.');
  return { repaired: true, quarantined };
}

async function repairBlobs(plan) {
  const totals = { repaired: 0, quarantined: 0 };
  for (const blob of plan.damaged) {
    const result = await replaceDamaged(plan, blob);
    if (result.repaired) totals.repaired += 1;
    if (result.quarantined) totals.quarantined += 1;
  }
  return totals;
}

function verifyReceiptRow(row, input) {
  const receipt = JSON.parse(row.receipt_json);
  const valid = digest(receipt) === row.receipt_hash && receipt.receiptId === row.id
    && receipt.protocol === PROTOCOL
    && receipt.sourceWorkspaceId === input.sourceWorkspaceId
    && receipt.targetWorkspaceId === input.targetWorkspaceId
    && receipt.rootHash === input.rootHash && receipt.planHash === input.expectedPlanHash;
  if (!valid) throw new Error('GQWF repair receipt integrity check failed.');
  return { ...receipt, receiptHash: row.receipt_hash, replayed: true };
}

async function storedReceipt(db, input) {
  const row = await db.get(`SELECT id, receipt_hash, receipt_json FROM gqwf_repair_receipts
    WHERE source_workspace_id = ? AND target_workspace_id = ? AND root_hash = ?
      AND plan_hash = ? ORDER BY rowid DESC LIMIT 1`, input.sourceWorkspaceId,
  input.targetWorkspaceId, input.rootHash, input.expectedPlanHash);
  return row ? verifyReceiptRow(row, input) : null;
}

function replayPlan(current, receipt) {
  return { ...current, planHash: receipt.planHash,
    body: { ...current.body, beforeInventoryHash: receipt.beforeInventoryHash,
      replicationReceiptHash: receipt.replicationReceiptHash } };
}

async function persistReceipt(db, state) {
  return withTransaction(db, async () => {
    const receiptId = crypto.randomUUID();
    const body = { receiptId, protocol: PROTOCOL,
      sourceWorkspaceId: state.plan.source.id, targetWorkspaceId: state.plan.target.id,
      organizationId: state.plan.body.organizationId, projectId: state.plan.body.projectId,
      rootHash: state.plan.body.rootHash, planHash: state.plan.planHash,
      replicationReceiptHash: state.plan.body.replicationReceiptHash,
      beforeInventoryHash: state.plan.body.beforeInventoryHash,
      afterInventoryHash: state.after.body.beforeInventoryHash,
      repairedBlobCount: state.totals.repaired,
      quarantinedBlobCount: state.totals.quarantined,
      authorizationEvidenceId: state.authorization.evidenceId };
    const receiptHash = digest(body);
    await db.run(`INSERT INTO gqwf_repair_receipts
      (id, source_workspace_id, target_workspace_id, root_hash, plan_hash,
        before_inventory_hash, after_inventory_hash, receipt_hash, receipt_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, receiptId, body.sourceWorkspaceId,
    body.targetWorkspaceId, body.rootHash, body.planHash, body.beforeInventoryHash,
    body.afterInventoryHash, receiptHash, canonicalJson(body));
    return { ...body, receiptHash, replayed: false };
  });
}

async function repairRoot(db, input, options = {}) {
  const previous = await storedReceipt(db, input);
  const plan = await buildPlan(db, input);
  if (previous && plan.damaged.length === 0) {
    await authorize(options, replayPlan(plan, previous), 'apply');
    return previous;
  }
  if (input.expectedPlanHash !== plan.planHash) {
    throw new Error('GQWF repair plan changed; run a new preview.');
  }
  const authorization = await authorize(options, plan, 'apply');
  const totals = await repairBlobs(plan);
  await storage.putRoot(db, plan.target.id, createManifest(
    (await storage.root(db, plan.target.id, plan.body.rootHash)).files));
  const after = await buildPlan(db, input);
  if (after.damaged.length) throw new Error('GQWF repair destination verification failed.');
  return persistReceipt(db, { plan, after, totals, authorization });
}

module.exports = { inspectRepair, repairRoot };
