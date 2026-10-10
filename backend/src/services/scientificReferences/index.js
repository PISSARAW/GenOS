'use strict';

const { createHash } = require('node:crypto');
const { receiptDigest } = require('../epistemicScheduler/leanIncrementalGate');
const { globalRegistry } = require('../mathematical/verificationRegistry');
const { isReplayedAttestation } = require('../scientificReceiptAuthority');
const { naturalStatementFingerprint } = require('../mathematical/formalizationArtifact');
const { withTransaction } = require('../../db');

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const ID_FIELDS = ['organizationId', 'projectId', 'workspaceId', 'objectType', 'objectId'];

function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function identity(input) {
  if (!input || typeof input !== 'object') throw fail('SCI_REF_INVALID', 'Reference identity is required.');
  const ref = {};
  for (const key of ID_FIELDS) {
    if (typeof input[key] !== 'string' || !input[key].trim() ||
        input[key] !== input[key].trim() || input[key].length > 200) {
      throw fail('SCI_REF_INVALID', `${key} must be a nonempty bounded string.`);
    }
    ref[key] = input[key];
  }
  if (!Number.isSafeInteger(input.version) || input.version < 1) {
    throw fail('SCI_REF_INVALID', 'version must be a positive integer.');
  }
  ref.version = input.version;
  return ref;
}

function formatReference(input) {
  const ref = identity(input);
  const parts = ID_FIELDS.map((key) => encodeURIComponent(ref[key]));
  return `genos-science://reference/${parts.join('/')}/${ref.version}`;
}

function parseReference(uri) {
  if (typeof uri !== 'string') throw fail('SCI_REF_INVALID', 'Reference URI is required.');
  const match = /^genos-science:\/\/reference\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\/([1-9][0-9]*)$/.exec(uri);
  if (!match) throw fail('SCI_REF_INVALID', 'Reference URI is malformed.');
  let decoded;
  try { decoded = match.slice(1, 6).map(decodeURIComponent); } catch (_) {
    throw fail('SCI_REF_INVALID', 'Reference URI encoding is invalid.');
  }
  const ref = identity(Object.fromEntries([...ID_FIELDS.map((key, i) => [key, decoded[i]]),
    ['version', Number(match[6])]]));
  if (formatReference(ref) !== uri) throw fail('SCI_REF_INVALID', 'Reference URI is not canonical.');
  return ref;
}

function scopeOf(input) {
  if (!input || typeof input !== 'object') throw fail('SCI_REF_SCOPE_REQUIRED', 'Requester scope is required.');
  const scope = {};
  for (const key of ['organizationId', 'projectId', 'workspaceId']) {
    if (typeof input[key] !== 'string' || !input[key].trim()) {
      throw fail('SCI_REF_SCOPE_REQUIRED', `${key} is required.`);
    }
    scope[key] = input[key];
  }
  return scope;
}

function sameScope(left, right) {
  return left.organizationId === right.organizationId &&
    left.projectId === right.projectId && left.workspaceId === right.workspaceId;
}

async function assertWorkspace(db, ref) {
  const row = await db.get('SELECT organization_id, project_id FROM workspaces WHERE id = ?', ref.workspaceId);
  if (!row || row.organization_id !== ref.organizationId || row.project_id !== ref.projectId) {
    throw fail('SCI_REF_SCOPE_FORBIDDEN', 'Reference scope does not match its workspace.');
  }
}

function assertDigest(value, field) {
  if (!SHA256.test(value || '')) throw fail('SCI_REF_INVALID', `${field} must be a SHA-256 digest.`);
}

function normalizedDependencies(input) {
  if (!Array.isArray(input) || input.length > 1000) {
    throw fail('SCI_REF_INVALID', 'dependencies must be a bounded array.');
  }
  const seen = new Set();
  return input.map((item) => {
    const ref = identity(item);
    assertDigest(item.receiptDigest, 'dependency receiptDigest');
    const key = JSON.stringify(ref);
    if (seen.has(key)) throw fail('SCI_REF_INVALID', 'Duplicate dependency.');
    seen.add(key);
    return { ...ref, receiptDigest: item.receiptDigest };
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function normalizeReference(input) {
  const ref = identity(input);
  if (typeof input.canonicalStatement !== 'string' || !input.canonicalStatement.trim()) {
    throw fail('SCI_REF_INVALID', 'canonicalStatement is required.');
  }
  assertDigest(input.contentDigest, 'contentDigest');
  assertDigest(input.sourceDigest, 'sourceDigest');
  assertDigest(input.environmentDigest, 'environmentDigest');
  assertDigest(input.formalStatementDigest, 'formalStatementDigest');
  if (!Array.isArray(input.assumptions) || input.assumptions.some((item) => typeof item !== 'string')) {
    throw fail('SCI_REF_INVALID', 'assumptions must be an array of strings.');
  }
  if (typeof input.validityDomain !== 'string' || !input.validityDomain.trim()) {
    throw fail('SCI_REF_INVALID', 'validityDomain is required.');
  }
  return { ...ref, contentDigest: input.contentDigest, sourceDigest: input.sourceDigest,
    canonicalStatement: input.canonicalStatement, formalStatementDigest: input.formalStatementDigest,
    environmentDigest: input.environmentDigest, assumptions: input.assumptions,
    validityDomain: input.validityDomain, dependencies: normalizedDependencies(input.dependencies || []) };
}

function receiptIsAuthenticated(receipt, expectedDigest, attestation) {
  return Boolean(receipt) && receipt.status === 'passed' && receipt.receiptDigest === expectedDigest &&
    receiptDigest(receipt) === expectedDigest &&
    (globalRegistry.isReceiptValid(expectedDigest) || isReplayedAttestation(attestation));
}

function receiptMatchesReference(receipt, reference, canonicalDigest) {
  return receipt.canonicalStatementDigest === canonicalDigest &&
    receipt.formalStatementDigest === reference.formalStatementDigest &&
    receipt.sourceDigest === reference.sourceDigest &&
    receipt.environmentDigest === reference.environmentDigest;
}

function assertReceipt(reference, attestation, expectedDigest) {
  const receipt = attestation.receipt;
  if (!receiptIsAuthenticated(receipt, expectedDigest, attestation)) {
    throw fail('SCI_REF_RECEIPT_REJECTED', 'Independent Lean receipt is unavailable or invalid.');
  }
  const canonicalDigest = naturalStatementFingerprint(reference.canonicalStatement);
  if (!receiptMatchesReference(receipt, reference, canonicalDigest)) {
    throw fail('SCI_REF_RECEIPT_MISMATCH', 'Receipt does not bind the referenced statement and environment.');
  }
  // A Lean receipt proves its formal statement. Natural-to-formal equivalence
  // requires separate evidence, so this first contract accepts direct formal claims only.
  if (canonicalDigest !== reference.formalStatementDigest) {
    throw fail('SCI_REF_FORMALIZATION_UNVERIFIED', 'Natural-to-formal mapping requires independent verification.');
  }
  const expected = reference.dependencies.map((item) => item.receiptDigest).sort();
  const actual = receipt.dependencyReceiptDigests;
  if (!Array.isArray(actual) || JSON.stringify(actual.slice().sort()) !== JSON.stringify(expected)) {
    throw fail('SCI_REF_RECEIPT_MISMATCH', 'Receipt dependency bindings differ.');
  }
}

function publicationBindingDigest(ref, receiptDigestValue) {
  return digest(Buffer.from(JSON.stringify([formatReference(ref), receiptDigestValue]), 'utf8'));
}

function assertPublicationAttestation(reference, attestation, expectedDigest) {
  if (!attestation || !attestation.ref || !attestation.receipt ||
      formatReference(attestation.ref) !== formatReference(reference) ||
      attestation.receipt.nodeId !== reference.objectId) {
    throw fail('SCI_REF_PUBLICATION_BINDING', 'Receipt has no trusted binding to this reference version.');
  }
  assertReceipt(reference, attestation, expectedDigest);
  return publicationBindingDigest(reference, expectedDigest);
}

async function ensureTables(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS scientific_references (
    organization_id TEXT NOT NULL, project_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
    object_type TEXT NOT NULL, object_id TEXT NOT NULL, version INTEGER NOT NULL,
    content_digest TEXT NOT NULL, content_bytes BLOB NOT NULL,
    metadata_json TEXT NOT NULL, metadata_digest TEXT NOT NULL,
    receipt_digest TEXT NOT NULL, binding_digest TEXT NOT NULL,
    retraction_receipt_id TEXT, retraction_receipt_digest TEXT,
    status TEXT NOT NULL CHECK (status IN ('verified', 'stale')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (organization_id, project_id, workspace_id, object_type, object_id, version)
  );
  CREATE INDEX IF NOT EXISTS idx_scientific_references_receipt ON scientific_references(receipt_digest);`);
}

function encodedMetadata(reference) {
  const metadata = JSON.stringify(reference);
  return { metadata, metadataDigest: digest(Buffer.from(metadata, 'utf8')) };
}

async function assertDependencies(db, reference, verifyReceipt) {
  for (const dep of reference.dependencies) {
    if (!sameScope(reference, dep)) {
      throw fail('SCI_REF_DEPENDENCY_SCOPE', 'Dependency is outside reference scope.');
    }
    const row = await loadRow(db, dep);
    if (!row || row.status !== 'verified' || row.receipt_digest !== dep.receiptDigest) {
      throw fail('SCI_REF_DEPENDENCY_STALE', 'Dependency is absent, stale or bound to another receipt.');
    }
    const metadata = checkedMetadata(row, dep);
    checkedContent(row);
    const binding = assertPublicationAttestation(metadata,
      await verifyReceipt(dep.receiptDigest, dep), dep.receiptDigest);
    if (binding !== row.binding_digest) throw fail('SCI_REF_INTEGRITY', 'Dependency binding digest failed.');
  }
}

function inputRef(value) {
  return typeof value === 'string' ? parseReference(value) : identity(value);
}

async function loadRow(db, ref) {
  return db.get(`SELECT content_digest, content_bytes, metadata_json, metadata_digest,
      receipt_digest, binding_digest, retraction_receipt_id, retraction_receipt_digest,
      status FROM scientific_references
      WHERE organization_id = ? AND project_id = ? AND workspace_id = ?
      AND object_type = ? AND object_id = ? AND version = ?`,
  ref.organizationId, ref.projectId, ref.workspaceId, ref.objectType, ref.objectId, ref.version);
}

function checkedMetadata(row, ref) {
  if (digest(Buffer.from(row.metadata_json, 'utf8')) !== row.metadata_digest) {
    throw fail('SCI_REF_INTEGRITY', 'Reference metadata digest failed.');
  }
  const metadata = JSON.parse(row.metadata_json);
  if (formatReference(metadata) !== formatReference(ref) || metadata.contentDigest !== row.content_digest) {
    throw fail('SCI_REF_INTEGRITY', 'Reference metadata is inconsistent.');
  }
  return metadata;
}

function checkedContent(row) {
  const bytes = row.content_bytes;
  if (!Buffer.isBuffer(bytes) || digest(bytes) !== row.content_digest) {
    throw fail('SCI_REF_INTEGRITY', 'Reference content digest failed.');
  }
  return exactUtf8Content(bytes);
}

function exactUtf8Content(bytes) {
  const content = bytes.toString('utf8');
  if (!Buffer.from(content, 'utf8').equals(bytes)) {
    throw fail('SCI_REF_ENCODING', 'Referenced content is not exact UTF-8.');
  }
  return content;
}

async function insertVerified(db, input, reference) {
  const { metadata, metadataDigest } = encodedMetadata(reference);
  await db.run(`INSERT INTO scientific_references (
    organization_id, project_id, workspace_id, object_type, object_id, version,
    content_digest, content_bytes, metadata_json, metadata_digest,
    receipt_digest, binding_digest, status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified')`,
  reference.organizationId, reference.projectId, reference.workspaceId,
  reference.objectType, reference.objectId, reference.version,
  reference.contentDigest, input.contentBytes, metadata, metadataDigest,
  input.receiptDigest, publicationBindingDigest(reference, input.receiptDigest));
}

async function publishVerified(db, input, verifyReceipt) {
  const reference = normalizeReference(input.reference);
  if (!Buffer.isBuffer(input.contentBytes)) throw fail('SCI_REF_INVALID', 'contentBytes must be a Buffer.');
  exactUtf8Content(input.contentBytes);
  if (digest(input.contentBytes) !== reference.contentDigest) {
    throw fail('SCI_REF_CONTENT_MISMATCH', 'Content digest differs from supplied bytes.');
  }
  assertDigest(input.receiptDigest, 'receiptDigest');
  return withTransaction(db, async () => {
    await assertWorkspace(db, reference);
    assertPublicationAttestation(reference, await verifyReceipt(input.receiptDigest, reference),
      input.receiptDigest);
    await assertDependencies(db, reference, verifyReceipt);
    await insertVerified(db, input, reference);
    return { ref: identity(reference), uri: formatReference(reference), version: reference.version,
      digest: reference.contentDigest, receiptDigest: input.receiptDigest, status: 'verified' };
  });
}

async function resolveReference(db, query, verifyReceipt) {
  const ref = inputRef(query.ref);
  const scope = scopeOf(query.requesterScope);
  if (!sameScope(ref, scope)) throw fail('SCI_REF_SCOPE_FORBIDDEN', 'Reference is outside requester scope.');
  await assertWorkspace(db, ref);
  const row = await loadRow(db, ref);
  if (!row) throw fail('SCI_REF_NOT_FOUND', 'Reference is unavailable.');
  if (row.status !== 'verified') throw fail('SCI_REF_STALE', 'Reference is not currently verified.');
  const metadata = checkedMetadata(row, ref);
  const content = checkedContent(row);
  const binding = assertPublicationAttestation(metadata,
    await verifyReceipt(row.receipt_digest, ref), row.receipt_digest);
  if (binding !== row.binding_digest) throw fail('SCI_REF_INTEGRITY', 'Publication binding digest failed.');
  await assertDependencies(db, metadata, verifyReceipt);
  return { status: 'resolved', ref, version: ref.version, content, digest: row.content_digest };
}

async function updateStale(db, ref, retraction) {
  const result = await db.run(`UPDATE scientific_references
    SET status = 'stale', retraction_receipt_id = ?, retraction_receipt_digest = ?
    WHERE organization_id = ? AND project_id = ? AND workspace_id = ?
    AND object_type = ? AND object_id = ? AND version = ? AND status = 'verified'`,
  retraction.id, retraction.digest, ref.organizationId, ref.projectId, ref.workspaceId,
  ref.objectType, ref.objectId, ref.version);
  if (result.changes !== 1) throw fail('SCI_REF_STALE_CONFLICT', 'Reference was absent or already stale.');
  return { ref, version: ref.version, status: 'stale',
    retractionReceiptId: retraction.id, retractionReceiptDigest: retraction.digest };
}

async function markStale(db, input, verifyRetractionReceipt) {
  if (typeof verifyRetractionReceipt !== 'function') {
    throw fail('SCI_REF_RETRACTION_VERIFIER_REQUIRED', 'A trusted retraction verifier is required.');
  }
  const ref = inputRef(input.ref);
  if (typeof input.retractionReceiptId !== 'string' || !input.retractionReceiptId.trim()) {
    throw fail('SCI_REF_INVALID', 'retractionReceiptId is required.');
  }
  assertDigest(input.retractionReceiptDigest, 'retractionReceiptDigest');
  return withTransaction(db, async () => {
    await assertWorkspace(db, ref);
    const receipt = await verifyRetractionReceipt(input.retractionReceiptDigest);
    if (!receipt || receipt.status !== 'validated' || receipt.id !== input.retractionReceiptId ||
        receipt.receiptDigest !== input.retractionReceiptDigest ||
        formatReference(receipt.ref) !== formatReference(ref)) {
      throw fail('SCI_REF_RETRACTION_REJECTED', 'Independent retraction receipt is unavailable or mismatched.');
    }
    return updateStale(db, ref, { id: input.retractionReceiptId, digest: input.retractionReceiptDigest });
  });
}

function assertStaleCause(cause, input) {
  if (!cause || cause.status !== 'stale' ||
      cause.retraction_receipt_id !== input.retractionReceiptId ||
      cause.retraction_receipt_digest !== input.retractionReceiptDigest) {
    throw fail('SCI_REF_CAUSE_UNVERIFIED', 'Causal reference is not stale under this retraction.');
  }
}

function assertDirectDependency(metadata, causalRef) {
  if (!metadata.dependencies.some((dep) => formatReference(dep) === formatReference(causalRef))) {
    throw fail('SCI_REF_CAUSE_UNVERIFIED', 'Causal reference is not a direct dependency.');
  }
}

async function markDerivedStale(db, input) {
  const ref = inputRef(input.ref);
  const causalRef = inputRef(input.causalRef);
  if (typeof input.retractionReceiptId !== 'string' || !input.retractionReceiptId.trim()) {
    throw fail('SCI_REF_INVALID', 'retractionReceiptId is required.');
  }
  assertDigest(input.retractionReceiptDigest, 'retractionReceiptDigest');
  return withTransaction(db, async () => {
    if (!sameScope(ref, causalRef)) throw fail('SCI_REF_DEPENDENCY_SCOPE', 'Cause is outside reference scope.');
    await assertWorkspace(db, ref);
    assertStaleCause(await loadRow(db, causalRef), input);
    const row = await loadRow(db, ref);
    if (!row || row.status !== 'verified') throw fail('SCI_REF_STALE_CONFLICT', 'Derived reference is unavailable.');
    assertDirectDependency(checkedMetadata(row, ref), causalRef);
    return updateStale(db, ref, { id: input.retractionReceiptId, digest: input.retractionReceiptDigest });
  });
}

function createScientificReferenceStore(options = {}) {
  if (typeof options.verifyReceipt !== 'function') {
    throw fail('SCI_REF_VERIFIER_REQUIRED', 'A trusted receipt resolver is required at service bootstrap.');
  }
  return Object.freeze({
    publishVerified: (db, input) => publishVerified(db, input, options.verifyReceipt),
    resolveReference: (db, query) => resolveReference(db, query, options.verifyReceipt),
    markStale: (db, input) => markStale(db, input, options.verifyRetractionReceipt),
    markDerivedStale: (db, input) => markDerivedStale(db, input),
  });
}

module.exports = { ensureTables, createScientificReferenceStore, formatReference, parseReference };
