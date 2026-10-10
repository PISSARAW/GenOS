'use strict';

const { createHash } = require('node:crypto');
const { receiptDigest, PLACEHOLDER_PROOF } = require('./epistemicScheduler/leanIncrementalGate');
const { executeLeanCheck } = require('./epistemicScheduler/leanProcessExecutor');
const { FormalizationArtifact, naturalStatementFingerprint } = require('./mathematical/formalizationArtifact');

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const replayed = new WeakSet();

function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function referenceUri(ref) {
  return require('./scientificReferences').formatReference(ref);
}

function assertConfiguration(options) {
  if (!options.db || typeof options.db.get !== 'function' || typeof options.db.run !== 'function') {
    throw fail('SCI_RECEIPT_CONFIG', 'A database is required.');
  }
  if (!String(options.toolchainVersion || '').trim() || !SHA256.test(options.environmentDigest || '')) {
    throw fail('SCI_RECEIPT_CONFIG', 'Pinned Lean toolchain and environment are required.');
  }
  if (options.executor !== undefined && typeof options.executor !== 'function') {
    throw fail('SCI_RECEIPT_CONFIG', 'Lean executor must be a function.');
  }
}

function assertReceiptShape(input, options) {
  const { receipt, source, canonicalStatement, ref } = input;
  if (!receipt || receipt.status !== 'passed' || receipt.reason !== null ||
      !SHA256.test(receipt.receiptDigest || '') || receiptDigest(receipt) !== receipt.receiptDigest) {
    throw fail('SCI_RECEIPT_INVALID', 'Passing Lean receipt and digest are required.');
  }
  assertPinnedBinding(input, options);
  assertSource(input);
  assertStatement(input);
  assertLists(receipt);
}

function assertPinnedBinding(input, options) {
  const { receipt, ref } = input;
  if (receipt.nodeId !== ref.objectId || receipt.toolchainVersion !== options.toolchainVersion ||
      receipt.environmentDigest !== options.environmentDigest) {
    throw fail('SCI_RECEIPT_BINDING', 'Receipt differs from the pinned node or Lean environment.');
  }
}

function assertSource(input) {
  const { receipt, source } = input;
  if (typeof source !== 'string' || !source.trim() || Buffer.byteLength(source, 'utf8') > 4 * 1024 * 1024 ||
      PLACEHOLDER_PROOF.test(source) || digest(Buffer.from(source, 'utf8')) !== receipt.sourceDigest) {
    throw fail('SCI_RECEIPT_SOURCE', 'Exact bounded Lean source does not match the receipt.');
  }
}

function assertStatement(input) {
  const { receipt, source, canonicalStatement } = input;
  if (typeof canonicalStatement !== 'string' || !canonicalStatement.trim() ||
      naturalStatementFingerprint(canonicalStatement) !== receipt.canonicalStatementDigest ||
      receipt.formalStatementDigest !== receipt.canonicalStatementDigest) {
    throw fail('SCI_RECEIPT_BINDING', 'Direct formal statement does not match the receipt.');
  }
  const formalization = new FormalizationArtifact({ naturalStatement: canonicalStatement,
    formalStatement: canonicalStatement });
  if (!formalization.checkSourceBinding(source).matched) {
    throw fail('SCI_RECEIPT_BINDING', 'Lean source does not prove the declared statement.');
  }
}

function assertLists(receipt) {
  if (!Array.isArray(receipt.dependencyReceiptDigests) ||
      receipt.dependencyReceiptDigests.some((item) => !SHA256.test(item)) ||
      new Set(receipt.dependencyReceiptDigests).size !== receipt.dependencyReceiptDigests.length ||
      !Array.isArray(receipt.axioms) || receipt.axioms.some((item) => typeof item !== 'string')) {
    throw fail('SCI_RECEIPT_INVALID', 'Receipt dependency or axiom list is invalid.');
  }
}

async function replayLean(input, options) {
  assertReceiptShape(input, options);
  const { receipt, source } = input;
  const execution = await (options.executor || executeLeanCheck)({
    nodeId: receipt.nodeId, source, toolchainVersion: options.toolchainVersion,
    environmentDigest: options.environmentDigest,
    dependencyReceiptDigests: receipt.dependencyReceiptDigests,
    leanExecutable: options.leanExecutable, timeoutMs: options.timeoutMs || 30000,
    strictToolchainVersion: true,
  });
  const expectedAxioms = receipt.axioms.slice().sort();
  const actualAxioms = Array.isArray(execution?.axioms) ? execution.axioms.slice().sort() : null;
  const allowed = new Set(options.allowedAxioms || []);
  if (execution?.exitCode !== 0 || execution.toolchainVersion !== options.toolchainVersion ||
      !actualAxioms || JSON.stringify(actualAxioms) !== JSON.stringify(expectedAxioms) ||
      actualAxioms.some((item) => !allowed.has(item))) {
    throw fail('SCI_RECEIPT_REPLAY_FAILED', 'Pinned Lean replay failed or axioms changed.');
  }
}

function attestation(input) {
  const receipt = { ...input.receipt, axioms: Object.freeze(input.receipt.axioms.slice()),
    dependencyReceiptDigests: Object.freeze(input.receipt.dependencyReceiptDigests.slice()) };
  const result = Object.freeze({ receipt: Object.freeze(receipt), ref: Object.freeze({ ...input.ref }) });
  replayed.add(result);
  return result;
}

function isReplayedAttestation(value) {
  return Boolean(value) && replayed.has(value);
}

async function ensureTables(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS scientific_receipt_authority (
    receipt_digest TEXT NOT NULL, reference_uri TEXT NOT NULL,
    receipt_json TEXT NOT NULL, source_bytes BLOB NOT NULL,
    canonical_statement TEXT NOT NULL, record_digest TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (receipt_digest, reference_uri)
  );`);
}

function persistedRecord(input) {
  const receiptJson = JSON.stringify(input.receipt);
  const sourceBytes = Buffer.from(input.source, 'utf8');
  const uri = referenceUri(input.ref);
  const recordDigest = digest(Buffer.from(JSON.stringify([uri, receiptJson,
    digest(sourceBytes), input.canonicalStatement]), 'utf8'));
  return { uri, receiptJson, sourceBytes, recordDigest };
}

function restoreRecord(row, ref) {
  if (!row || !Buffer.isBuffer(row.source_bytes)) return null;
  const source = row.source_bytes.toString('utf8');
  if (!Buffer.from(source, 'utf8').equals(row.source_bytes)) {
    throw fail('SCI_RECEIPT_INTEGRITY', 'Lean source encoding changed.');
  }
  const expected = digest(Buffer.from(JSON.stringify([referenceUri(ref), row.receipt_json,
    digest(row.source_bytes), row.canonical_statement]), 'utf8'));
  if (expected !== row.record_digest) {
    throw fail('SCI_RECEIPT_INTEGRITY', 'Persisted receipt record changed.');
  }
  let receipt;
  try { receipt = JSON.parse(row.receipt_json); } catch (_) {
    throw fail('SCI_RECEIPT_INTEGRITY', 'Persisted receipt JSON is invalid.');
  }
  return { receipt, ref, source, canonicalStatement: row.canonical_statement };
}

function createScientificReceiptAuthority(options = {}) {
  assertConfiguration(options);
  const cache = new Map();
  async function attest(input) {
    const ref = require('./scientificReferences').parseReference(referenceUri(input.ref));
    const candidate = { ...input, ref };
    await replayLean(candidate, options);
    await ensureTables(options.db);
    const row = persistedRecord(candidate);
    await options.db.run(`INSERT OR IGNORE INTO scientific_receipt_authority
      (receipt_digest, reference_uri, receipt_json, source_bytes, canonical_statement, record_digest)
      VALUES (?, ?, ?, ?, ?, ?)`, input.receipt.receiptDigest, row.uri, row.receiptJson,
    row.sourceBytes, input.canonicalStatement, row.recordDigest);
    const persisted = await options.db.get(`SELECT record_digest FROM scientific_receipt_authority
      WHERE receipt_digest = ? AND reference_uri = ?`, input.receipt.receiptDigest, row.uri);
    if (persisted?.record_digest !== row.recordDigest) {
      throw fail('SCI_RECEIPT_CONFLICT', 'Receipt identity is already bound to different evidence.');
    }
    cache.set(`${input.receipt.receiptDigest}|${row.uri}`, row.recordDigest);
    return attestation(candidate);
  }
  async function verifyReceipt(receiptId, requestedRef) {
    if (!SHA256.test(receiptId || '')) return null;
    const ref = require('./scientificReferences').parseReference(referenceUri(requestedRef));
    await ensureTables(options.db);
    const uri = referenceUri(ref);
    const row = await options.db.get(`SELECT receipt_json, source_bytes, canonical_statement, record_digest
      FROM scientific_receipt_authority WHERE receipt_digest = ? AND reference_uri = ?`, receiptId, uri);
    const candidate = restoreRecord(row, ref);
    if (!candidate) return null;
    if (candidate.receipt.receiptDigest !== receiptId) {
      throw fail('SCI_RECEIPT_INTEGRITY', 'Persisted receipt digest differs from query.');
    }
    const key = `${receiptId}|${uri}`;
    if (cache.get(key) !== row.record_digest) {
      await replayLean(candidate, options);
      cache.set(key, row.record_digest);
    }
    return attestation(candidate);
  }
  return Object.freeze({ attest, verifyReceipt, ensureTables: () => ensureTables(options.db) });
}

module.exports = { createScientificReceiptAuthority, isReplayedAttestation };
