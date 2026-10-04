'use strict';

const crypto = require('node:crypto');
const { digest } = require('./verifierImplementationManifest');
const { currentKeyId, keyFor } = require('./epistemicReceiptKeyring');

async function ensureTable(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS aeis_assurance_assemblies (
    id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, manifest_json TEXT NOT NULL,
    signature TEXT NOT NULL, key_id TEXT NOT NULL DEFAULT 'legacy',
    signature_version INTEGER NOT NULL DEFAULT 1,
    run_id TEXT, scope_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
}

function seal(input) {
  const { id, payload, manifest } = input;
  const keyId = input.keyId || 'legacy';
  const fields = [id, digest(payload), digest(manifest)];
  if (input.version >= 2) fields.push(keyId);
  if (input.version >= 3) fields.push(input.runId || '', input.scopeId || '');
  return crypto.createHmac('sha256', keyFor(keyId)).update(fields.join('\0')).digest('hex');
}

async function pruneAssemblies(db, maxAgeDays = 90, maxRows = 10000) {
  const days = Math.min(3650, Math.max(1, Math.floor(Number(maxAgeDays) || 90)));
  const rows = Math.min(100000, Math.max(100, Math.floor(Number(maxRows) || 10000)));
  await db.run("DELETE FROM aeis_assurance_assemblies WHERE created_at < datetime('now', ?)", `-${days} days`);
  await db.run(`DELETE FROM aeis_assurance_assemblies WHERE id NOT IN (
    SELECT id FROM aeis_assurance_assemblies ORDER BY created_at DESC, rowid DESC LIMIT ?)`, rows);
}

async function saveAssembly(db, evaluation, context = {}) {
  await ensureTable(db);
  const id = crypto.randomUUID();
  const payload = JSON.stringify(evaluation);
  const registry = require('./verifierTrustRegistry');
  const manifest = JSON.stringify({ implementation: registry.deploymentManifest,
    trustedDigests: registry.listVerifierDigests() });
  const keyId = currentKeyId();
  await db.run(`INSERT INTO aeis_assurance_assemblies
    (id, payload_json, manifest_json, signature, key_id, signature_version, run_id, scope_id, created_at)
    VALUES (?, ?, ?, ?, ?, 3, ?, ?, CURRENT_TIMESTAMP)`,
  id, payload, manifest, seal({ id, payload, manifest, keyId, version: 3,
    runId: context.runId, scopeId: context.scopeId }), keyId, context.runId || null, context.scopeId || null);
  await pruneAssemblies(db);
  return id;
}

async function readAssembly(db, id) {
  const row = await db.get('SELECT * FROM aeis_assurance_assemblies WHERE id = ?', id);
  if (!row) throw new Error('AEIS assembly not found');
  const expected = seal({ id, payload: row.payload_json, manifest: row.manifest_json,
    keyId: row.key_id || 'legacy', version: row.signature_version || 1,
    runId: row.run_id, scopeId: row.scope_id });
  if (row.signature !== expected) throw new Error('AEIS assembly integrity failure');
  const evaluation = JSON.parse(row.payload_json);
  const manifest = JSON.parse(row.manifest_json);
  const { validateReceipt } = require('./epistemicVerifierReceiptService');
  const receipts = evaluation.assembly.verifications;
  if (!receipts.every((receipt) => validateReceipt(receipt, manifest.trustedDigests))) {
    throw new Error('AEIS receipt integrity failure');
  }
  return { evaluation, manifest, runId: row.run_id, scopeId: row.scope_id };
}

module.exports = { saveAssembly, readAssembly, pruneAssemblies };
