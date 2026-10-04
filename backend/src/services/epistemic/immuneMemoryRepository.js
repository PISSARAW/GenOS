'use strict';

const { withTransaction } = require('../../db');
const { canonicalStatement } = require('./claimVerificationContract');
const { readAssembly } = require('../aeisAssemblyStore');

const MEMORY_LIMIT = 1000;
const TABLE = 'epistemic_immune_memory_scoped';

function assertScope(scopeId) {
  if (typeof scopeId !== 'string' || !scopeId.trim()) throw new Error('AEIS memory scope is required.');
  return scopeId;
}

function parseJson(value, fallback) {
  try { return value === null ? fallback : JSON.parse(value); } catch (_) { return fallback; }
}

function hydrateEntry(row) {
  return {
    id: row.signature, signature: row.signature,
    pattern: parseJson(row.pattern_json, row.pattern_json), domain: row.domain,
    evidence: parseJson(row.evidence_json, null),
    effectiveResponse: parseJson(row.effective_response_json, null),
    affinity: row.affinity, failures: row.failures, successes: row.successes,
    pending: Boolean(row.pending), createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function load(db, scopeId, limit = MEMORY_LIMIT) {
  assertScope(scopeId);
  const bounded = Math.min(Math.max(Number(limit) || MEMORY_LIMIT, 1), MEMORY_LIMIT);
  const rows = await db.all(
    `SELECT * FROM ${TABLE} WHERE scope_id = ? ORDER BY affinity DESC, updated_at DESC LIMIT ?`,
    scopeId, bounded,
  );
  return rows.map(hydrateEntry);
}

function jsonOrNull(value) { return value == null ? null : JSON.stringify(value); }

async function insertPending(db, scopeId, entry) {
  await db.run(
    `INSERT INTO ${TABLE} (scope_id, signature, pattern_json, domain, evidence_json,
      effective_response_json, affinity, failures, successes, pending, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 1, ?, ?)
     ON CONFLICT(scope_id, signature) DO NOTHING`,
    scopeId, entry.signature, JSON.stringify(entry.pattern), entry.domain || 'general',
    jsonOrNull(entry.evidence), jsonOrNull(entry.effectiveResponse), entry.affinity,
    entry.createdAt, entry.updatedAt,
  );
}

async function enforceRetention(db, scopeId) {
  await db.run(
    `DELETE FROM ${TABLE} WHERE scope_id = ? AND signature NOT IN (
      SELECT signature FROM ${TABLE} WHERE scope_id = ?
      ORDER BY affinity DESC, updated_at DESC LIMIT ?)`,
    scopeId, scopeId, MEMORY_LIMIT,
  );
}

async function save(db, entries, scopeId) {
  assertScope(scopeId);
  await withTransaction(db, async () => {
    for (const entry of entries.slice(-MEMORY_LIMIT)) await insertPending(db, scopeId, entry);
    await enforceRetention(db, scopeId);
  });
}

async function resolve(db, input) {
  const scopeId = assertScope(input.scopeId);
  if (!input.assemblyId || !input.runId || !input.signature || !input.resultId) throw new Error('AEIS memory resolution requires persisted evidence.');
  const verdict = await outcomeFromAssembly(db, input);
  if (!verdict.outcome) return false;
  return withTransaction(db, async () => {
    const row = await db.get(`SELECT signature FROM ${TABLE} WHERE scope_id = ? AND signature = ?`, scopeId, input.signature);
    if (!row) throw new Error('AEIS memory pattern not found in scope.');
    const event = await db.run(
      `INSERT OR IGNORE INTO epistemic_immune_outcomes (scope_id, evidence_id, signature, outcome)
       VALUES (?, ?, ?, ?)`, scopeId, `${input.runId}:${input.resultId}`, input.signature, verdict.outcome,
    );
    if (!event.changes) return false;
    const success = verdict.outcome === 'success' ? 1 : 0;
    await db.run(
      `UPDATE ${TABLE} SET successes = successes + ?, failures = failures + ?,
       affinity = CAST(successes + ? AS REAL) / (successes + failures + 1),
       effective_response_json = COALESCE(?, effective_response_json),
       pending = 0, updated_at = ? WHERE scope_id = ? AND signature = ?`,
      success, 1 - success, success, jsonOrNull(verdict.effectiveResponse),
      new Date().toISOString(), scopeId, input.signature,
    );
    return true;
  });
}

function assertAssemblyScope(saved, input) {
  if (saved.runId !== input.runId || saved.scopeId !== input.scopeId) {
    throw new Error('AEIS assembly does not belong to this run and scope.');
  }
}

async function outcomeFromAssembly(db, input) {
  const saved = await readAssembly(db, input.assemblyId);
  assertAssemblyScope(saved, input);
  const formal = saved.evaluation.assembly.results.find((item) => item.resultId === input.resultId);
  if (!formal || canonicalStatement(input.test) !== formal.canonicalStatement) throw new Error('AEIS oracle does not match the claim.');
  const receipts = saved.evaluation.assembly.verifications.filter((receipt) => receipt.independent === true
    && receipt.resultId === formal.resultId && receipt.evidenceDigest === formal.evidence.digest);
  const outcome = resolvedOutcome(receipts, input.test, saved.evaluation.evaluation.eligible);
  const rows = saved.evaluation.holobionteResults.flatMap((item) => item.immune?.verifierResults?.results || []);
  const winner = rows.find((row) => row.status === 'verified' && row.receipt?.independent
    && receipts.some((receipt) => receipt.signature === row.receipt.signature));
  return { outcome, effectiveResponse: outcome === 'success' ? winner?.verifierType : null };
}

function executionRefutes(receipt, test) {
  if (receipt.status !== 'refuted') return false;
  return (receipt.executionEvidence || []).some((item) => {
    if (item.command !== test.command) return false;
    if (test.expectOutput === undefined) return item.exitCode !== 0;
    return item.success === true && String(item.stdout || '').trim() !== String(test.expectOutput).trim();
  });
}

function resolvedOutcome(receipts, test, eligible) {
  if (receipts.some((receipt) => executionRefutes(receipt, test))) return 'failure';
  if (eligible && receipts.filter((receipt) => receipt.status === 'verified').length >= 2) return 'success';
  return null;
}

module.exports = { load, save, resolve, MEMORY_LIMIT, resolvedOutcome };
