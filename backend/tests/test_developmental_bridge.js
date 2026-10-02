'use strict';

const assert = require('assert');
const crypto = require('node:crypto');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateAdaptiveState } = require('../src/db/migrations/migrateAdaptiveState');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const { listEvents } = require('../src/services/gvxDevelopmentLedger');
const { recordOutcomeSignals } = require('../src/services/developmentalBridge/agowToGvxSignalAdapter');
const { creditVerifiedReceipt } = require('../src/services/developmentalBridge/gvxToAgowReceiptAdapter');
const { receiptClaim } = require('../src/services/developmentalBridge/developmentReceiptVerifier');
const { digest } = require('../src/services/epistemicAssuranceService');
const { deriveAgowPosture, canonicalMeasurements, recordCanonicalInteroception } = require('../src/services/developmentalBridge/interoceptionBridge');
const { recommendAction } = require('../src/services/developmentalBridge');
const { resolveDevelopmentalScope } = require('../src/services/developmentalBridge/developmentalScopeResolver');
const { update: updatePolicy } = require('../src/services/agow/agowMechanismPolicyService');
const plasticityCoordinator = require('../src/services/agow/plasticity/agowPlasticityCoordinator');
const { buildInteroceptiveState } = require('../src/services/gvxInteroception');

const receiptKeys = crypto.generateKeyPairSync('ed25519');
const receiptPublicKey = receiptKeys.publicKey.export({ type: 'spki', format: 'pem' });
process.env.GENOS_GVX_VERIFIER_PUBLIC_KEY = receiptPublicKey;
const receiptKeyId = `sha256:${crypto.createHash('sha256')
  .update(receiptKeys.publicKey.export({ type: 'spki', format: 'der' })).digest('hex')}`;

const scope = { organizationId: 'org', projectId: 'project' };
const evidence = [{ artifactHash: 'a'.repeat(64), verifierId: 'independent-test-v1' }];

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateGvxLedger(db);
    await migrateAdaptiveState(db);
    await checkAgowSignals(db);
    await checkReceiptCredits(db);
    checkInteroceptionBoundary();
    await checkCanonicalLedger(db);
    checkRoutingRecommendations();
    await checkScopeResolution();
  } finally { await db.close(); }
  console.log('Developmental bridge checks passed.');
}

async function checkAgowSignals(db) {
  const input = {
    scope, entityId: 'agent', agentId: 'agent', sourceEventId: 'agow-event-1',
    evidenceRefs: ['telemetry-1'], success: false, predictionError: 0.8,
    regret: 0.9, decompiled: true, context: { frameId: 'frame-1', secret: 'must-not-persist' }
  };
  const first = await recordOutcomeSignals(db, input);
  const replay = await recordOutcomeSignals(db, input);
  assert.strictEqual(first.length, 3);
  assert.ok(replay.every((event) => event.replayed));
  assert.ok(first.every((event) => event.payload.epistemicStatus === 'reported'));
  assert.ok(first.every((event) => !JSON.stringify(event.payload).includes('must-not-persist')));
}

async function checkReceiptCredits(db) {
  await updatePolicy({ agentId: 'agent', db, policy: { plasticity: 'bounded' } });
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'developmental-bridge-test-secret';
  await plasticityCoordinator.recordOutcome({ db, agentId: 'agent', pathwayId: 'route.alpha',
    success: true, predictionError: 0.1, reward: 1, evidenceStatus: 'verified', evidenceRefs: ['forged'] });
  const afterForgedClaim = await plasticityCoordinator.listPathways({ db, agentId: 'agent' });
  assert.strictEqual(afterForgedClaim.find((item) => item.pathwayId === 'route.alpha').supportCount, 0);
  const untrusted = receiptInput(db, 'bad-1');
  untrusted.signedReceipt.independent = false;
  await assert.rejects(creditVerifiedReceipt(db, untrusted), { code: 'GVX_RECEIPT_UNVERIFIED' });
  const tampered = receiptInput(db, 'tampered');
  tampered.success = false;
  await assert.rejects(creditVerifiedReceipt(db, tampered), { code: 'GVX_RECEIPT_UNVERIFIED' });
  for (let index = 1; index <= 3; index += 1) {
    const input = receiptInput(db, `receipt-${index}`);
    const result = await creditVerifiedReceipt(db, input);
    assert.strictEqual(result.credited, true);
    if (index === 3) assert.strictEqual(result.consolidation.consolidated, true);
  }
  const duplicate = await creditVerifiedReceipt(db, receiptInput(db, 'receipt-1'));
  assert.strictEqual(duplicate.reason, 'receipt-already-claimed');
  const duplicateDirect = receiptInput(db, 'receipt-1');
  await plasticityCoordinator.recordOutcome({ ...duplicateDirect, key: undefined });
  const pathway = (await plasticityCoordinator.listPathways({ db, agentId: 'agent' }))
    .find((item) => item.pathwayId === 'route.alpha' && item.contextHash === 'b'.repeat(64));
  assert.strictEqual(pathway.supportCount, 3);
  assert.strictEqual(pathway.verifiedReceiptIds.length, 3);
  const events = await listEvents(db, { ...scope, entityId: 'agent' });
  assert.strictEqual(events.filter((event) => event.payload.kind === 'developmental_credit_applied').length, 3);
}

function receiptInput(db, receiptId) {
  const input = { db, scope, entityId: 'agent', agentId: 'agent', receiptId,
    pathwayId: 'route.alpha', contextHash: 'b'.repeat(64), success: true,
    predictionError: 0.1, reward: 0.8, evidenceRefs: evidence };
  const receipt = { schema: 'genos.gvx.development-receipt/v2', resultId: receiptId,
    evidenceDigest: digest(receiptClaim(input)), verifierDigest: receiptKeyId,
    status: 'verified', independent: true, checkedAt: new Date().toISOString(),
    nonce: crypto.randomUUID(), evidenceCount: input.evidenceRefs.length };
  input.signedReceipt = { ...receipt,
    signature: crypto.sign(null, Buffer.from(JSON.stringify(receipt)), receiptKeys.privateKey).toString('base64') };
  return input;
}

function checkInteroceptionBoundary() {
  const measurements = canonicalMeasurements({ sampledAt: '2026-10-01T00:00:00.000Z', variables: {
    energy: 0.2, memory_pressure: 0.9, model_drift: 0.8, integrity: 0.2
  } });
  const state = buildInteroceptiveState({ scope, now: '2026-10-01T00:00:00.000Z', measurements });
  assert.strictEqual(state.dimensions.securityAnomalies.status, 'unknown');
  const posture = deriveAgowPosture(state);
  assert.strictEqual(posture.reduceAttention, true);
  assert.strictEqual(posture.increaseVerification, true);
  assert.strictEqual(posture.status, 'partial');
}

async function checkCanonicalLedger(db) {
  const sample = { sampledAt: '2026-10-01T00:00:00.000Z', variables: {
    energy: 0.6, memory_pressure: 0.3, model_drift: 0.1, integrity: 0.9
  } };
  const state = await recordCanonicalInteroception({ db, agentId: 'agent', scope, sample });
  const events = await listEvents(db, { ...scope, entityId: 'agent' });
  const event = events.find((item) => item.payload.kind === 'canonical_interoception');
  assert.ok(event);
  assert.strictEqual(event.payload.sampledAt, sample.sampledAt);
  assert.strictEqual(state.dimensions.securityAnomalies.status, 'unknown');
}

function checkRoutingRecommendations() {
  assert.strictEqual(recommendAction('unknown_signal'), 'ignore');
  assert.strictEqual(recommendAction('prediction_error'), 'observe');
  assert.strictEqual(recommendAction('prediction_error', 3), 'create_hypothesis');
  assert.strictEqual(recommendAction('active_query'), 'schedule_experiment');
}

async function checkScopeResolution() {
  const db = { get: async (_query, agentId) => agentId === 'agent'
    ? { organizationId: scope.organizationId, projectId: scope.projectId } : null };
  assert.deepStrictEqual(await resolveDevelopmentalScope(db, 'agent'), scope);
  assert.strictEqual(await resolveDevelopmentalScope(db, 'unknown-agent'), null);
  await assert.rejects(resolveDevelopmentalScope(db, 'agent', { organizationId: 'other', projectId: 'project' }),
    { code: 'DEVELOPMENTAL_SCOPE_MISMATCH' });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
