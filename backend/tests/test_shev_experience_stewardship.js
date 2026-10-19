'use strict';

const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');
const fixture = require('./ontogenesisFixture');
const store = require('../src/services/ontogenesis/projectStore');
const { migrateShevExperienceStewardship } = require('../src/db/migrations/migrateShevExperienceStewardship');
const { authorizationPayload } = require('../src/services/shev/authorityService');
const { registerResponsibility, reviseResponsibility } = require('../src/services/shev/responsibilityService');
const { recordObservation } = require('../src/services/shev/observationService');
const { compilePending } = require('../src/services/shev/initiativeService');
const { recordProjectEffect } = require('../src/services/shev/effectService');
const { calibrateEvaluator, recordQualitativeJudgment } = require('../src/services/shev/qualitativeService');
const { registerExperienceProtocol, recordExperienceCheckpoint,
  decideExperienceDirection, protocolAuthorizationDetails,
  decisionAuthorizationDetails } = require('../src/services/shev/experienceStewardshipService');

const projectId = 'shev-experience';
const keyPair = generateKeyPairSync('ed25519');
const mandate = { purpose: 'Maintenir une expérience vérifiable',
  autoDiagnose: true, autoInstrument: false,
  dimensions: [{ name: 'reservation', expected: 'Parcours compréhensible',
    acceptance: ['Le résultat utilisateur est mesuré séparément du rendu.'] }] };
const protocol = { rubricVersion: 'experience-v1', audiences: ['novices', 'experts'],
  minEvaluators: 3, minWindows: 3, consecutiveDriftWindows: 2,
  maxVisualDrift: 0.2, maxCalibrationError: 0.75, regressionScoreMax: 1,
  maxCheckpointAgeMs: 86400000 };
let nonce = 0;

function authorize(input) {
  nonce += 1;
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  const value = `shev-experience-${nonce.toString().padStart(6, '0')}`;
  const payload = authorizationPayload({ ...input, projectId, nonce: value, expiresAt });
  return { nonce: value, expiresAt,
    signature: sign(null, Buffer.from(JSON.stringify(payload)), keyPair.privateKey).toString('base64') };
}

function signed(operation, subjectId, expectedVersion, details) {
  return authorize({ operation, subjectId, expectedVersion, details });
}

async function setup(db) {
  await migrateShevExperienceStewardship(db);
  await store.createProject(db, { id: projectId, rootPath: 'C:/experience',
    branch: 'codex/experience', objective: 'Préserver le parcours', config: fixture.testConfig() });
  await registerResponsibility(db, { projectId, authorityRef: 'owner:experience', mandate,
    authorityPublicKey: keyPair.publicKey.export({ type: 'spki', format: 'pem' }) });
  await reviseResponsibility(db, { projectId, expectedVersion: 1, stage: 'assisted', mandate,
    authorization: signed('mandate-revision', projectId, 1, { mandate, stage: 'assisted' }) });
  const input = { id: 'experience-protocol', projectId, dimension: 'reservation', protocol };
  await registerExperienceProtocol(db, { ...input,
    authorization: signed('experience-protocol-registration', input.id, 2,
      protocolAuthorizationDetails(input)) });
}

async function checkpoint(db, index, drift) {
  const input = { id: `checkpoint-${index}`, projectId, protocolId: 'experience-protocol',
    period: `week-${index}`, observedAt: new Date(Date.now() - (10000 - index * 1000)).toISOString(),
    visualDrift: drift, screenshotRefs: [`screenshot:sha256:week-${index}`],
    testRefs: [`playwright:run:week-${index}`] };
  return recordExperienceCheckpoint(db, input);
}

async function calibration(db, evaluatorId) {
  const references = [0, 1, 2].map((score) => ({ id: `${evaluatorId}-${score}`,
    referenceScore: score, evaluatorScore: score, evidenceRef: `reference:${evaluatorId}:${score}` }));
  return calibrateEvaluator(db, { projectId, evaluatorId, rubricVersion: protocol.rubricVersion,
    references, verifyReferences: async () => ({ verified: true,
      verifierRef: `calibration-oracle:${evaluatorId}`,
      evidenceRefs: references.map((item) => item.evidenceRef) }) });
}

async function panel(db, checkpointId) {
  const reviewers = [
    { evaluatorId: 'novice-reader-a', audience: 'novices', score: 0 },
    { evaluatorId: 'novice-reader-b', audience: 'novices', score: 1 },
    { evaluatorId: 'expert-reader', audience: 'experts', score: 4 }
  ];
  for (const reviewer of reviewers) {
    const calibrated = await calibration(db, reviewer.evaluatorId);
    await recordQualitativeJudgment(db, { id: `${checkpointId}-${reviewer.evaluatorId}`,
      projectId, observationId: `experience_checkpoint:${checkpointId}`,
      calibrationId: calibrated.id, evaluatorId: reviewer.evaluatorId,
      audience: reviewer.audience, score: reviewer.score,
      rationale: 'Lecture liée au public déclaré, sans prétention esthétique universelle.',
      evidenceRefs: [`review:${checkpointId}:${reviewer.evaluatorId}`] });
  }
}

function reviewInput(id, checkpointId, effectInitiativeId) {
  return { id, projectId, protocolId: 'experience-protocol', checkpointId,
    ...(effectInitiativeId ? { effectInitiativeId } : {}) };
}

async function decide(db, input) {
  return decideExperienceDirection(db, { ...input,
    authorization: signed('experience-direction-review', input.id, 2,
      decisionAuthorizationDetails(input)) });
}

async function measuredRegression(db, initiative) {
  await db.run("UPDATE ontogenesis_backlog SET status = 'done' WHERE id = ?", [initiative.task_id]);
  const before = await db.get('SELECT observed_at, source FROM shev_observations WHERE project_id = ? AND id = ?',
    [projectId, initiative.observation_id]);
  const observedAt = new Date(Math.max(Date.now(), Date.parse(before.observed_at) + 10)).toISOString();
  await recordObservation(db, { id: 'user-effect-after-refine', projectId,
    domain: 'product-experience', dimension: 'reservation', kind: 'degradation',
    epistemicStatus: 'observed', source: before.source, observedAt,
    summary: 'La mesure utilisateur indépendante régresse après intégration.',
    evidenceRefs: ['analytics:conversion:after-refine'] });
  return recordProjectEffect(db, { projectId, initiativeId: initiative.id,
    postObservationId: 'user-effect-after-refine', verify: async () => ({ result: 'regressed',
      verifierRef: 'user-outcome-oracle:v1', evidenceRefs: ['analytics:conversion:after-refine'] }) });
}

async function main() {
  const db = await fixture.memoryDb();
  try {
    await setup(db);
    await checkpoint(db, 1, 0.1);
    await checkpoint(db, 2, 0.35);
    await checkpoint(db, 3, 0.4);
    await panel(db, 'checkpoint-3');
    const refineInput = reviewInput('review-refine', 'checkpoint-3');
    const refine = await decide(db, refineInput);
    assert.equal(refine.decision, 'REFINE');
    assert.equal(refine.review.userEffect.result, 'not_tested');
    assert.equal(refine.review.disputed, true, 'minority dissent remains visible');
    await compilePending(db, { projectId });
    const initiative = await db.get('SELECT * FROM shev_initiatives WHERE observation_id = ?',
      [refine.observation.id]);
    assert.equal(initiative.status, 'queued', 'review creates a diagnostic, not a deployment');
    await measuredRegression(db, initiative);

    await checkpoint(db, 4, 0.45);
    await panel(db, 'checkpoint-4');
    const change = await decide(db, reviewInput('review-change', 'checkpoint-4', initiative.id));
    assert.equal(change.decision, 'CHANGE_DIRECTION');
    assert.equal(change.review.userEffect.result, 'regressed');
    assert.equal(change.review.userEffect.verifierRef, 'user-outcome-oracle:v1');

    await checkpoint(db, 5, 0.05);
    const noChangeInput = reviewInput('review-no-change', 'checkpoint-5');
    const noChange = await decide(db, noChangeInput);
    assert.equal(noChange.decision, 'NO_CHANGE');
    assert.equal(noChange.observation, null);
    assert.equal(await db.get('SELECT observation_id FROM shev_experience_decisions WHERE id = ?',
      [noChangeInput.id]).then((row) => row.observation_id), null);

    const forged = reviewInput('review-forged', 'checkpoint-5');
    await assert.rejects(decideExperienceDirection(db, { ...forged,
      authorization: signed('experience-direction-review', forged.id, 2,
        { ...decisionAuthorizationDetails(forged), effectInitiativeId: initiative.id }) }), /signature is invalid/);
    assert.equal(await db.get('SELECT id FROM shev_experience_decisions WHERE id = ?', [forged.id]), undefined);
    await assert.rejects(db.run("UPDATE shev_experience_decisions SET decision = 'REFINE' WHERE id = ?",
      [noChangeInput.id]), /immutable/);
    console.log('SHEV experience stewardship: longitudinal drift, plural calibration, dissent, permissions and separated user effect passed.');
  } finally { await db.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
