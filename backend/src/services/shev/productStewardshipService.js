'use strict';

const { createHash } = require('node:crypto');
const { withTransaction } = require('../../db');
const { consumeAuthorization } = require('./authorityService');
const { requireActive } = require('./runtimeGuard');
const { recordObservation } = require('./observationService');
const { compilePending } = require('./initiativeService');
const { normalizeManifest, normalizeStage } = require('./productStewardshipContract');

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

function stageAllowed(stage, rows) {
  if (stage === 'preview') return !rows.some(row => row.stage === 'preview');
  const preview = rows.some(row => row.stage === 'preview' && row.result === 'confirmed');
  if (stage === 'deployed') return preview && !rows.some(row => row.stage === 'deployed');
  return preview && rows.some(row => row.stage === 'deployed' && row.result === 'confirmed');
}

function observationFor(manifest, receipt) {
  const suffix = digest([manifest.id, receipt.id]).slice(0, 48);
  const regressed = receipt.result === 'regressed';
  return { id: `product_${suffix}`, projectId: manifest.project_id, domain: 'product-stewardship',
    dimension: manifest.dimension, kind: regressed ? 'degradation'
      : receipt.result === 'confirmed' ? 'state' : 'blind_spot',
    epistemicStatus: receipt.result === 'inconclusive' ? 'inconclusive' : 'observed',
    source: receipt.sourceRef, observedAt: receipt.observedAt,
    summary: regressed ? 'Une derive post-deploiement a ete constatee.'
      : receipt.result === 'confirmed' ? 'Aucune derive post-deploiement n a ete constatee.'
        : 'L effet utilisateur reste inconclusif.', evidenceRefs: receipt.evidenceRefs };
}

async function persistStage(db, input) {
  const hash = digest(input.receipt);
  const existing = await db.get('SELECT * FROM shev_product_stage_receipts WHERE id = ?', [input.receipt.id]);
  if (existing) {
    if (existing.content_hash !== hash) throw new Error('SHEV product stage idempotency conflict.');
    return { row: existing, replayed: true };
  }
  const rows = await db.all(`SELECT stage, result FROM shev_product_stage_receipts
    WHERE manifest_id = ? ORDER BY observed_at, id`, [input.manifest.id]);
  if (!stageAllowed(input.receipt.stage, rows)) throw new Error('SHEV product stage order or evidence gate is not satisfied.');
  await db.run(`INSERT INTO shev_product_stage_receipts
    (id, manifest_id, stage, result, source_ref, evidence_json, observed_at, content_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [input.receipt.id, input.manifest.id,
    input.receipt.stage, input.receipt.result, input.receipt.sourceRef,
    JSON.stringify(input.receipt.evidenceRefs), input.receipt.observedAt, hash]);
  return { row: input.receipt, replayed: false };
}

async function productReaction(db, manifest, receipt) {
  if (receipt.stage !== 'user_effect') {
    return { action: receipt.stage === 'preview' ? 'AWAIT_DEPLOYMENT' : 'AWAIT_USER_EFFECT' };
  }
  const observation = await recordObservation(db, observationFor(manifest, receipt));
  if (receipt.result === 'confirmed') return { action: 'NO_CHANGE', observation };
  if (receipt.result === 'inconclusive') return { action: 'HOLD', observation };
  const compilation = await compilePending(db, { projectId: manifest.project_id,
    nowMs: Date.parse(receipt.observedAt) + 1 });
  return { action: 'INITIATIVE', observation, compilation };
}

async function recordProductStage(db, input) {
  if (typeof input?.verify !== 'function') throw new TypeError('SHEV product stage requires an external verifier.');
  const manifest = await db.get('SELECT * FROM shev_product_manifests WHERE id = ?', [input.manifestId]);
  if (!manifest) throw new Error('SHEV product manifest does not exist.');
  await requireActive(db, { projectId: manifest.project_id, expectedVersion: manifest.mandate_version });
  const assessment = await input.verify({ manifest: JSON.parse(manifest.manifest_json), stage: input.stage });
  const receipt = normalizeStage(input, assessment);
  return withTransaction(db, async () => {
    await requireActive(db, { projectId: manifest.project_id, expectedVersion: manifest.mandate_version });
    const persisted = await persistStage(db, { manifest, receipt });
    const reaction = await productReaction(db, manifest, receipt);
    return { ...persisted, ...reaction };
  });
}

module.exports = { registerProductManifest, recordProductStage, digest };
