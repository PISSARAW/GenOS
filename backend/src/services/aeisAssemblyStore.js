"use strict";
const crypto = require('node:crypto');
const { digest } = require('./verifierImplementationManifest');
async function ensureTable(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS aeis_assurance_assemblies (
    id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, manifest_json TEXT NOT NULL, signature TEXT NOT NULL)`);
}
function seal(id, payload, manifest) {
  const secret = process.env.GENOS_EPISTEMIC_RECEIPT_SECRET;
  if (!secret) throw new Error('AEIS persistence requires the receipt secret');
  return crypto.createHmac('sha256', secret).update([id, digest(payload), digest(manifest)].join('\0')).digest('hex');
}
async function saveAssembly(db, evaluation) {
  await ensureTable(db);
  const id = crypto.randomUUID();
  const payload = JSON.stringify(evaluation);
  const registry = require('./verifierTrustRegistry');
  const manifest = JSON.stringify({ implementation: registry.deploymentManifest, trustedDigests: registry.listVerifierDigests() });
  await db.run('INSERT INTO aeis_assurance_assemblies VALUES (?, ?, ?, ?)', id, payload, manifest, seal(id, payload, manifest));
  return id;
}
async function readAssembly(db, id) {
  const row = await db.get('SELECT * FROM aeis_assurance_assemblies WHERE id = ?', id);
  if (!row) throw new Error('AEIS assembly not found');
  const expected = seal(id, row.payload_json, row.manifest_json);
  if (row.signature !== expected) throw new Error('AEIS assembly integrity failure');
  const evaluation = JSON.parse(row.payload_json);
  const manifest = JSON.parse(row.manifest_json);
  const { validateReceipt } = require('./epistemicVerifierReceiptService');
  const receipts = evaluation.assembly.verifications;
  if (!receipts.every((receipt) => validateReceipt(receipt, manifest.trustedDigests))) throw new Error('AEIS receipt integrity failure');
  return { evaluation, manifest };
}
module.exports = { saveAssembly, readAssembly };
