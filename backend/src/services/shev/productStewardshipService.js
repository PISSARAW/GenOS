'use strict';

const { createHash } = require('node:crypto');
const { withTransaction } = require('../../db');
const { consumeAuthorization } = require('./authorityService');
const { requireActive } = require('./runtimeGuard');
const { normalizeManifest } = require('./productStewardshipContract');

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function existingManifest(db, manifest) {
  const row = await db.get('SELECT * FROM shev_product_manifests WHERE id = ?', [manifest.id]);
  if (!row) return null;
  if (row.content_hash !== digest(manifest)) throw new Error('SHEV product manifest idempotency conflict.');
  return { ...row, manifest: JSON.parse(row.manifest_json), replayed: true };
}

async function registerProductManifest(db, input) {
  const manifest = normalizeManifest(input);
  const existing = await existingManifest(db, manifest);
  if (existing) return existing;
  const responsibility = await requireActive(db, { projectId: manifest.projectId,
    expectedVersion: input.expectedVersion, action: true });
  if (!responsibility.mandate.dimensions.some(item => item.name === manifest.dimension)) {
    throw new Error('SHEV product dimension is outside the mandate.');
  }
  const authorization = { ...input.authorization, operation: 'product-manifest-registration',
    projectId: manifest.projectId, subjectId: manifest.id,
    expectedVersion: responsibility.mandateVersion, details: manifest };
  return withTransaction(db, async () => {
    await consumeAuthorization(db, authorization);
    await requireActive(db, { projectId: manifest.projectId,
      expectedVersion: responsibility.mandateVersion, action: true });
    await db.run(`INSERT INTO shev_product_manifests
      (id, project_id, mandate_version, dimension, build_ref, manifest_json, content_hash, authorization_nonce)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [manifest.id, manifest.projectId,
      responsibility.mandateVersion, manifest.dimension, manifest.buildRef,
      JSON.stringify(manifest), digest(manifest), authorization.nonce]);
    return { ...(await db.get('SELECT * FROM shev_product_manifests WHERE id = ?', [manifest.id])),
      manifest, replayed: false };
  });
}

module.exports = { registerProductManifest, digest };
