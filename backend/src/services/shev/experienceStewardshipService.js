'use strict';

const { createHash } = require('node:crypto');
const { withTransaction } = require('../../db');
const { migrateShevExperienceStewardship } = require('../../db/migrations/migrateShevExperienceStewardship');
const { consumeAuthorization } = require('./authorityService');
const { recordObservation } = require('./observationService');
const { requireActive } = require('./runtimeGuard');

const SAFE_ID = /^[A-Za-z0-9._:-]{1,100}$/;

function strings(value, minimum, maximum) {
  return Array.isArray(value) && value.length >= minimum && value.length <= maximum
    && value.every((item) => typeof item === 'string' && item.trim() && item.length <= 512);
}

function uniqueStrings(value, minimum, maximum) {
  return strings(value, minimum, maximum) && new Set(value).size === value.length;
}

function validProtocolIdentity(input) {
  return SAFE_ID.test(input?.id || '') && typeof input?.dimension === 'string'
    && SAFE_ID.test(input?.protocol?.rubricVersion || '');
}

function validPanelPolicy(protocol) {
  return uniqueStrings(protocol?.audiences, 2, 6)
    && Number.isInteger(protocol.minEvaluators) && protocol.minEvaluators >= 3
    && protocol.minEvaluators <= 7 && protocol.minEvaluators >= protocol.audiences.length;
}

function validWindowPolicy(protocol) {
  return Number.isInteger(protocol?.minWindows) && protocol.minWindows >= 3
    && protocol.minWindows <= 12 && Number.isInteger(protocol.consecutiveDriftWindows)
    && protocol.consecutiveDriftWindows >= 2
    && protocol.consecutiveDriftWindows <= protocol.minWindows;
}

function validThresholdPolicy(protocol) {
  return Number.isFinite(protocol?.maxVisualDrift) && protocol.maxVisualDrift >= 0
    && protocol.maxVisualDrift <= 1 && Number.isFinite(protocol.maxCalibrationError)
    && protocol.maxCalibrationError >= 0 && protocol.maxCalibrationError <= 1;
}

function validDecisionPolicy(protocol) {
  return Number.isInteger(protocol?.regressionScoreMax) && protocol.regressionScoreMax >= 0
    && protocol.regressionScoreMax <= 2 && Number.isSafeInteger(protocol.maxCheckpointAgeMs)
    && protocol.maxCheckpointAgeMs >= 60000 && protocol.maxCheckpointAgeMs <= 7776000000;
}

function normalizeProtocol(input) {
  const protocol = input?.protocol;
  const valid = [validProtocolIdentity(input), validPanelPolicy(protocol),
    validWindowPolicy(protocol), validThresholdPolicy(protocol),
    validDecisionPolicy(protocol)].every(Boolean);
  if (!valid) {
    throw new TypeError('SHEV experience protocol is invalid.');
  }
  return { rubricVersion: protocol.rubricVersion, audiences: [...protocol.audiences],
    minEvaluators: protocol.minEvaluators, minWindows: protocol.minWindows,
    consecutiveDriftWindows: protocol.consecutiveDriftWindows,
    maxVisualDrift: protocol.maxVisualDrift, maxCalibrationError: protocol.maxCalibrationError,
    regressionScoreMax: protocol.regressionScoreMax,
    maxCheckpointAgeMs: protocol.maxCheckpointAgeMs };
}

function protocolAuthorizationDetails(input) {
  return { dimension: input.dimension, protocol: normalizeProtocol(input) };
}

async function registerExperienceProtocol(db, input) {
  await migrateShevExperienceStewardship(db);
  const details = protocolAuthorizationDetails(input);
  return withTransaction(db, async () => {
    const responsibility = await requireActive(db, { projectId: input.projectId });
    if (!responsibility.mandate.dimensions.some((item) => item.name === input.dimension)) {
      throw new Error('SHEV experience dimension is outside the mandate.');
    }
    await consumeAuthorization(db, { ...input.authorization,
      operation: 'experience-protocol-registration', projectId: input.projectId,
      subjectId: input.id, expectedVersion: responsibility.mandateVersion, details });
    await db.run(`INSERT INTO shev_experience_protocols
      (id, project_id, dimension, protocol_json, authorization_nonce)
      VALUES (?, ?, ?, ?, ?)`, [input.id, input.projectId, input.dimension,
      JSON.stringify(details.protocol), input.authorization.nonce]);
    return db.get('SELECT * FROM shev_experience_protocols WHERE id = ?', [input.id]);
  });
}

function validCheckpointIdentity(input) {
  return SAFE_ID.test(input?.id || '') && SAFE_ID.test(input?.period || '');
}

function validCheckpointTiming(input) {
  const observedAt = Date.parse(input?.observedAt);
  return Number.isFinite(observedAt) && observedAt <= Date.now() + 1000;
}

function validVisualDrift(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function validCheckpointEvidence(input) {
  return uniqueStrings(input?.screenshotRefs, 1, 10)
    && uniqueStrings(input?.testRefs, 1, 10);
}

function checkpointInput(input) {
  const valid = [validCheckpointIdentity(input), validCheckpointTiming(input),
    validVisualDrift(input?.visualDrift), validCheckpointEvidence(input)].every(Boolean);
  if (!valid) {
    throw new TypeError('SHEV experience checkpoint is invalid.');
  }
  return { id: input.id, period: input.period,
    observedAt: new Date(input.observedAt).toISOString(), visualDrift: input.visualDrift,
    screenshotRefs: [...input.screenshotRefs], testRefs: [...input.testRefs] };
}

function checkpointObservation(input, checkpoint, protocol) {
  return { id: `experience_checkpoint:${checkpoint.id}`, projectId: input.projectId,
    domain: 'product-experience', dimension: protocol.dimension, kind: 'state',
    epistemicStatus: 'observed', source: `experience-protocol:${input.protocolId}`,
    observedAt: checkpoint.observedAt,
    summary: `Point de trajectoire visuelle ${checkpoint.period}; dérive mesurée ${checkpoint.visualDrift}.`,
    evidenceRefs: [...checkpoint.screenshotRefs, ...checkpoint.testRefs] };
}

function checkpointHash(input, checkpoint) {
  return createHash('sha256').update(JSON.stringify({ projectId: input.projectId,
    protocolId: input.protocolId, ...checkpoint })).digest('hex');
}

async function recordExperienceCheckpoint(db, input) {
  await migrateShevExperienceStewardship(db);
  const checkpoint = checkpointInput(input);
  return withTransaction(db, async () => {
    await requireActive(db, { projectId: input.projectId });
    const protocol = await db.get(`SELECT * FROM shev_experience_protocols
      WHERE id = ? AND project_id = ?`, [input.protocolId, input.projectId]);
    if (!protocol) throw new Error('SHEV experience protocol is unavailable.');
    const observation = checkpointObservation(input, checkpoint, protocol);
    const hash = checkpointHash(input, checkpoint);
    const existing = await db.get('SELECT * FROM shev_experience_checkpoints WHERE id = ?', [checkpoint.id]);
    if (existing && existing.content_hash !== hash) throw new Error('SHEV experience checkpoint idempotency conflict.');
    if (!existing) {
      await recordObservation(db, observation);
      await db.run(`INSERT INTO shev_experience_checkpoints
        (id, project_id, protocol_id, observation_id, period, observed_at, visual_drift,
          screenshot_json, test_json, content_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [checkpoint.id, input.projectId, input.protocolId, observation.id, checkpoint.period,
        checkpoint.observedAt, checkpoint.visualDrift, JSON.stringify(checkpoint.screenshotRefs),
        JSON.stringify(checkpoint.testRefs), hash]);
    }
    return { ...(existing || await db.get('SELECT * FROM shev_experience_checkpoints WHERE id = ?', [checkpoint.id])),
      replayed: Boolean(existing) };
  });
}

function decisionAuthorizationDetails(input) {
  return { protocolId: input.protocolId, checkpointId: input.checkpointId,
    effectInitiativeId: input.effectInitiativeId || null };
}

function parsedProtocol(row) {
  return { ...row, protocol: JSON.parse(row.protocol_json) };
}

async function reviewContext(db, input) {
  const protocolRow = await db.get(`SELECT * FROM shev_experience_protocols
    WHERE id = ? AND project_id = ?`, [input.protocolId, input.projectId]);
  if (!protocolRow) throw new Error('SHEV experience protocol is unavailable.');
  const protocol = parsedProtocol(protocolRow);
  const windows = await db.all(`SELECT * FROM shev_experience_checkpoints
    WHERE project_id = ? AND protocol_id = ? ORDER BY observed_at, id`,
  [input.projectId, input.protocolId]);
  const checkpoint = windows.at(-1);
  if (!checkpoint || checkpoint.id !== input.checkpointId) {
    throw new Error('SHEV experience decision must target the latest checkpoint.');
  }
  if (Date.now() - Date.parse(checkpoint.observed_at) > protocol.protocol.maxCheckpointAgeMs) {
    throw new Error('SHEV experience checkpoint is stale.');
  }
  return { protocol, windows, checkpoint };
}

async function calibratedPanel(db, context) {
  const rows = await db.all(`SELECT j.*, c.mean_absolute_error, c.rubric_version
    FROM shev_qualitative_judgments j JOIN shev_qualitative_calibrations c
      ON c.id = j.calibration_id AND c.project_id = j.project_id
      AND c.evaluator_id = j.evaluator_id
    WHERE j.project_id = ? AND j.observation_id = ? ORDER BY j.created_at, j.id`,
  [context.protocol.project_id, context.checkpoint.observation_id]);
  const policy = context.protocol.protocol;
  const eligible = rows.filter((row) => row.rubric_version === policy.rubricVersion
    && row.mean_absolute_error <= policy.maxCalibrationError
    && policy.audiences.includes(row.audience));
  const distinct = [...new Map(eligible.map((row) => [row.evaluator_id, row])).values()];
  const audiences = new Set(distinct.map((row) => row.audience));
  const complete = distinct.length >= policy.minEvaluators
    && policy.audiences.every((audience) => audiences.has(audience));
  const regressions = distinct.filter((row) => row.score <= policy.regressionScoreMax).length;
  const quorum = Math.ceil(distinct.length * 2 / 3);
  return { judgments: rows, eligible: distinct, complete,
    regressions, quorum, disputed: distinct.some((row) =>
      row.score > policy.regressionScoreMax) && regressions > 0 };
}

async function userEffect(db, input, dimension) {
  if (!input.effectInitiativeId) return { result: 'not_tested', evidenceRefs: [] };
  const row = await db.get(`SELECT e.*, i.project_id, o.dimension FROM shev_effects e
    JOIN shev_initiatives i ON i.id = e.initiative_id
    JOIN shev_observations o ON o.project_id = i.project_id AND o.id = i.observation_id
    WHERE e.initiative_id = ? AND i.project_id = ?`, [input.effectInitiativeId, input.projectId]);
  if (!row || row.dimension !== dimension) {
    throw new Error('SHEV user effect is absent or outside the experience dimension.');
  }
  return { result: row.project_result, verifierRef: row.verifier_ref,
    evidenceRefs: JSON.parse(row.evidence_json), initiativeId: row.initiative_id };
}

function directionOf(context, panel, effect) {
  const policy = context.protocol.protocol;
  const trailing = context.windows.slice(-policy.consecutiveDriftWindows);
  const longitudinal = context.windows.length >= policy.minWindows
    && trailing.length === policy.consecutiveDriftWindows
    && trailing.every((row) => row.visual_drift > policy.maxVisualDrift);
  if (!longitudinal) return { decision: 'NO_CHANGE', reason: 'no_longitudinal_visual_drift', visualVerdict: 'stable' };
  if (!panel.complete) return { decision: 'NO_CHANGE', reason: 'plural_review_incomplete', visualVerdict: 'inconclusive' };
  if (panel.regressions < panel.quorum) return { decision: 'NO_CHANGE', reason: 'calibrated_disagreement', visualVerdict: 'disputed' };
  if (effect.result === 'regressed') return { decision: 'CHANGE_DIRECTION',
    reason: 'visual_and_user_effect_regression', visualVerdict: 'regressed' };
  return { decision: 'REFINE', reason: 'visual_regression_without_regressed_user_effect',
    visualVerdict: 'regressed' };
}

function decisionObservation(input, context, review) {
  const { panel, direction } = review;
  const id = `experience_drift:${createHash('sha256').update(input.id).digest('hex')}`;
  return { id, projectId: input.projectId, domain: 'product-experience',
    dimension: context.protocol.dimension, kind: 'degradation', epistemicStatus: 'observed',
    source: `experience-review:${input.protocolId}`, observedAt: new Date().toISOString(),
    validUntil: new Date(Date.now() + context.protocol.protocol.maxCheckpointAgeMs).toISOString(),
    summary: `Revue pluraliste: ${direction.decision}; ${panel.regressions}/${panel.eligible.length} évaluateurs calibrés signalent une régression.`,
    evidenceRefs: [`shev-experience-review:${input.id}`] };
}

async function decideExperienceDirection(db, input) {
  await migrateShevExperienceStewardship(db);
  if (!SAFE_ID.test(input?.id || '')) throw new TypeError('SHEV experience decision id is invalid.');
  return withTransaction(db, async () => {
    const responsibility = await requireActive(db, { projectId: input.projectId, action: true });
    const context = await reviewContext(db, input);
    const panel = await calibratedPanel(db, context);
    const effect = await userEffect(db, input, context.protocol.dimension);
    const details = decisionAuthorizationDetails(input);
    await consumeAuthorization(db, { ...input.authorization, operation: 'experience-direction-review',
      projectId: input.projectId, subjectId: input.id,
      expectedVersion: responsibility.mandateVersion, details });
    const direction = directionOf(context, panel, effect);
    let observation = null;
    if (direction.decision !== 'NO_CHANGE') {
      observation = await recordObservation(db,
        decisionObservation(input, context, { panel, direction }));
    }
    const review = { protocolVersion: context.protocol.protocol.rubricVersion,
      windows: context.windows.map((row) => ({ id: row.id, period: row.period,
        observedAt: row.observed_at, visualDrift: row.visual_drift })),
      panel: panel.judgments.map((row) => ({ judgmentId: row.id,
        evaluatorId: row.evaluator_id, audience: row.audience, score: row.score,
        calibrationId: row.calibration_id, calibrationError: row.mean_absolute_error })),
      eligibleEvaluators: panel.eligible.length, regressions: panel.regressions,
      quorum: panel.quorum, disputed: panel.disputed, userEffect: effect };
    await db.run(`INSERT INTO shev_experience_decisions
      (id, project_id, protocol_id, checkpoint_id, decision, reason, visual_verdict,
        user_effect_result, review_json, observation_id, authorization_nonce)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [input.id, input.projectId,
      input.protocolId, input.checkpointId, direction.decision, direction.reason,
      direction.visualVerdict, effect.result, JSON.stringify(review), observation?.id || null,
      input.authorization.nonce]);
    return { ...direction, observation, review };
  });
}

module.exports = { registerExperienceProtocol, recordExperienceCheckpoint,
  decideExperienceDirection, protocolAuthorizationDetails, decisionAuthorizationDetails };
