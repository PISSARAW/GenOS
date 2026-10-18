'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const { withTransaction } = require('../../db');
const { createManifest } = require('./manifest');
const { blobPath, putBlob, readBlob } = require('./objects');
const storage = require('./storage');

const HASH = /^[a-f0-9]{64}$/;
const PROTOCOL = 'gqwf-cas-replication-v1';

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) {
    const fields = Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${fields.join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function assertScope(source, target) {
  const sameOrganization = source.organization_id
    && source.organization_id === target.organization_id;
  const sameProject = source.project_id === target.project_id;
  if (!sameOrganization || !sameProject) {
    throw new Error('GQWF replication requires source and target in the same tenant scope.');
  }
  if (source.id === target.id) throw new Error('GQWF replication target must differ from source.');
}

function uniqueBlobs(manifest) {
  const blobs = new Map();
  for (const file of manifest.files) blobs.set(file.hash, { hash: file.hash, size: file.size });
  return [...blobs.values()].sort((left, right) => left.hash.localeCompare(right.hash));
}

async function buildPlan(db, input) {
  const [source, target] = await Promise.all([
    storage.workspace(db, input.sourceWorkspaceId),
    storage.workspace(db, input.targetWorkspaceId)
  ]);
  assertScope(source, target);
  if (!HASH.test(input.rootHash || '')) throw new Error('GQWF replication requires a root hash.');
  const manifest = await storage.root(db, source.id, input.rootHash);
  const built = createManifest(manifest.files);
  if (built.hash !== input.rootHash) throw new Error('GQWF replication source root changed.');
  const body = { protocol: PROTOCOL, sourceWorkspaceId: source.id,
    targetWorkspaceId: target.id, organizationId: source.organization_id,
    projectId: source.project_id ?? null, rootHash: built.hash,
    blobs: uniqueBlobs(manifest) };
  return { body, planHash: digest(body), source, target, built };
}

function authorizationRequest(plan, operation) {
  return { operation, protocol: PROTOCOL, sourceWorkspaceId: plan.source.id,
    targetWorkspaceId: plan.target.id, organizationId: plan.source.organization_id,
    projectId: plan.source.project_id ?? null, rootHash: plan.built.hash,
    planHash: plan.planHash };
}

function assertAuthorization(request, verdict) {
  const fields = ['operation', 'protocol', 'sourceWorkspaceId', 'targetWorkspaceId',
    'organizationId', 'projectId', 'rootHash', 'planHash'];
  const bound = verdict?.allowed === true
    && fields.every((field) => verdict[field] === request[field]);
  if (!bound || typeof verdict.evidenceId !== 'string' || !verdict.evidenceId.trim()) {
    throw new Error('GQWF replication lacks bound authorization evidence.');
  }
}

async function authorize(options, plan, operation) {
  if (typeof options.authorizeReplication !== 'function') {
    throw new Error('GQWF replication authorizer is unavailable.');
  }
  const request = authorizationRequest(plan, operation);
  const verdict = await options.authorizeReplication(request);
  assertAuthorization(request, verdict);
  return verdict;
}

async function targetHasBlob(target, blob) {
  try {
    const location = blobPath(target.path, blob.hash);
    const stat = await fs.lstat(location);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('unsafe');
    const bytes = await readBlob(target.path, blob.hash);
    if (bytes.length !== blob.size) throw new Error('size');
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw new Error(`GQWF replication target blob is corrupt or unsafe: ${blob.hash}`);
  }
}

async function classifyTarget(plan) {
  const reusable = new Set();
  for (const blob of plan.body.blobs) {
    if (await targetHasBlob(plan.target, blob)) reusable.add(blob.hash);
  }
  const transfer = plan.body.blobs.filter((blob) => !reusable.has(blob.hash));
  return { reusable, transfer, transferBytes: transfer.reduce((sum, blob) => sum + blob.size, 0) };
}

async function prepare(state) {
  const plan = await buildPlan(state.db, state.input);
  const authorization = await authorize(state.options, plan, state.operation);
  const targetState = await classifyTarget(plan);
  return { plan, authorization, targetState };
}

function preview(prepared) {
  const { plan, authorization, targetState } = prepared;
  return { protocol: PROTOCOL, mode: 'preview', planHash: plan.planHash,
    sourceWorkspaceId: plan.source.id, targetWorkspaceId: plan.target.id,
    rootHash: plan.built.hash, blobCount: plan.body.blobs.length,
    transferBlobCount: targetState.transfer.length,
    reusedBlobCount: targetState.reusable.size, transferBytes: targetState.transferBytes,
    authorizationEvidenceId: authorization.evidenceId };
}

async function inspectReplication(db, input, options = {}) {
  return preview(await prepare({ db, input, options, operation: 'inspect' }));
}

async function transferMissing(prepared) {
  for (const blob of prepared.targetState.transfer) {
    const bytes = await readBlob(prepared.plan.source.path, blob.hash);
    if (bytes.length !== blob.size) throw new Error('GQWF replication source blob size mismatch.');
    const storedHash = await putBlob(prepared.plan.target.path, bytes);
    if (storedHash !== blob.hash) throw new Error('GQWF replication changed blob identity.');
  }
}

function verifyStoredReceipt(row, plan) {
  const receipt = JSON.parse(row.receipt_json);
  if (digest(receipt) !== row.receipt_hash || receipt.planHash !== plan.planHash
    || receipt.rootHash !== plan.built.hash
    || receipt.sourceWorkspaceId !== plan.source.id
    || receipt.targetWorkspaceId !== plan.target.id) {
    throw new Error('GQWF replication receipt integrity check failed.');
  }
  return { ...receipt, receiptId: row.id, receiptHash: row.receipt_hash, replayed: true };
}

async function storedReceipt(db, plan) {
  const row = await db.get(`SELECT id, receipt_hash, receipt_json FROM gqwf_replication_receipts
    WHERE source_workspace_id = ? AND target_workspace_id = ? AND root_hash = ? AND plan_hash = ?`,
  plan.source.id, plan.target.id, plan.built.hash, plan.planHash);
  return row ? verifyStoredReceipt(row, plan) : null;
}

function receiptBody(prepared) {
  const { plan, authorization, targetState } = prepared;
  return { protocol: PROTOCOL, sourceWorkspaceId: plan.source.id,
    targetWorkspaceId: plan.target.id, organizationId: plan.source.organization_id,
    projectId: plan.source.project_id ?? null, rootHash: plan.built.hash,
    planHash: plan.planHash, blobCount: plan.body.blobs.length,
    transferredBlobCount: targetState.transfer.length,
    reusedBlobCount: targetState.reusable.size,
    transferredBytes: targetState.transferBytes,
    authorizationEvidenceId: authorization.evidenceId };
}

async function persistReceipt(db, prepared) {
  return withTransaction(db, async () => {
    const existing = await storedReceipt(db, prepared.plan);
    if (existing) return existing;
    const body = receiptBody(prepared);
    const id = crypto.randomUUID();
    const receiptHash = digest(body);
    await db.run(`INSERT INTO gqwf_replication_receipts
      (id, source_workspace_id, target_workspace_id, root_hash, plan_hash,
        receipt_hash, receipt_json) VALUES (?, ?, ?, ?, ?, ?, ?)`, id,
    body.sourceWorkspaceId, body.targetWorkspaceId, body.rootHash, body.planHash,
    receiptHash, canonicalJson(body));
    return { ...body, receiptId: id, receiptHash, replayed: false };
  });
}

async function replicateRoot(db, input, options = {}) {
  const prepared = await prepare({ db, input, options, operation: 'apply' });
  if (input.expectedPlanHash !== prepared.plan.planHash) {
    throw new Error('GQWF replication plan changed; run a new preview.');
  }
  await transferMissing(prepared);
  await storage.putRoot(db, prepared.plan.target.id, prepared.plan.built);
  const finalState = await classifyTarget(prepared.plan);
  if (finalState.transfer.length) throw new Error('GQWF replication destination verification failed.');
  return persistReceipt(db, prepared);
}

module.exports = { canonicalJson, digest, inspectReplication, replicateRoot };
