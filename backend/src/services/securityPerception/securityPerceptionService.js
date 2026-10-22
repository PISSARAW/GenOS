'use strict';

const { AdaptiveStateService } = require('../adaptiveStateService');
const { requiredText, ensureState } = require('./securityPerceptionPrimitives');
const sensors = require('./securitySensorRegistry');
const baseline = require('./securityBaselineEngine');
const detector = require('./securityAnomalyDetector');
const hypotheses = require('./securityHypothesisEngine');
const scheduler = require('./securityInvestigationScheduler');
const calibrator = require('./securityConfidenceCalibrator');
const deduplicator = require('./securityAlertDeduplicator');
const incidents = require('./securityIncidentMemory');
const world = require('./securityWorldModel');
const immuneSurveillance = require('./securityImmuneSurveillanceCycle');

const SCOPE = 'security_perception_v1';

function tenantKey(tenant) {
  return `${requiredText(tenant.organizationId, 'ASP_ORGANIZATION_REQUIRED', 128)}::${requiredText(tenant.projectId, 'ASP_PROJECT_REQUIRED', 128)}`;
}

async function load(db, tenant) {
  const store = new AdaptiveStateService(db);
  const key = tenantKey(tenant);
  return { store, key, state: ensureState(await store.restoreObject(SCOPE, key)) };
}

async function persist(context) {
  await context.store.persistObject(SCOPE, context.key, context.state, Date.now());
  return context.state;
}

async function registerSensor(db, tenant, input) {
  const context = await load(db, tenant);
  const sensor = sensors.register(context.state, input || {});
  await persist(context);
  return sensor;
}

function normalizeObservation(input) {
  const observedAt = input.observedAt || new Date().toISOString();
  if (!Number.isFinite(Date.parse(observedAt))) throw new Error('ASP_OBSERVATION_TIME_INVALID');
  return { sensorId: requiredText(input.sensorId, 'ASP_SENSOR_ID_REQUIRED', 128),
    subject: requiredText(input.subject, 'ASP_SUBJECT_REQUIRED', 256), signal: requiredText(input.signal, 'ASP_SIGNAL_REQUIRED', 128),
    value: input.value, facts: input.facts, evidenceRefs: input.evidenceRefs,
    signals: input.signals, ruleMatches: input.ruleMatches,
    correlation: input.correlation, observedAt };
}

function assess(state, observation, context) {
  const { sensor, options } = context;
  const detection = detector.detect(state, observation, sensor);
  const confidence = calibrator.calibrate(state, detection.classification, detection.confidence);
  const decision = scheduler.schedule({ ...detection, confidence: confidence.calibrated }, options);
  const proposed = hypotheses.build(detection, observation);
  return { detection: { ...detection, confidence: confidence.calibrated, rawConfidence: detection.confidence,
    abstain: confidence.abstain }, decision, hypotheses: proposed };
}

async function observe(db, tenant, input) {
  const context = await load(db, tenant);
  const observation = normalizeObservation(input || {});
  const sensor = sensors.authorize(context.state, observation.sensorId);
  const result = assess(context.state, observation, { sensor, options: input });
  const deduplicated = deduplicator.upsert(context.state, result.detection, observation);
  baseline.learn(context.state, observation, { confirmedNormal: input.confirmedNormal === true });
  context.state.observations.push({ ...observation, sourceQuality: sensor.quality,
    detection: result.detection, decision: result.decision, alertId: deduplicated.alert.id });
  context.state.observations = context.state.observations.slice(-2000);
  context.state.hypotheses.push(...result.hypotheses.map((item) => ({ ...item, observationHash: result.detection.observationHash,
    createdAt: observation.observedAt })));
  context.state.hypotheses = context.state.hypotheses.slice(-2000);
  if (result.decision.action === 'investigate' || result.decision.action === 'escalate') {
    context.state.investigations.push({ id: `inv_${result.detection.observationHash.slice(0, 20)}`,
      action: result.decision.action, budgetCost: result.decision.cost, evidenceRefs: result.detection.evidence,
      hypotheses: result.hypotheses.map((item) => item.id), scheduledAt: observation.observedAt });
    context.state.investigations = context.state.investigations.slice(-1000);
  }
  await persist(context);
  return { ...result, alert: deduplicated.alert, duplicateAlert: deduplicated.duplicate };
}

async function getState(db, tenant) {
  return (await load(db, tenant)).state;
}

async function recordIncident(db, tenant, input) {
  const context = await load(db, tenant);
  const incident = incidents.record(context.state, input || {});
  await persist(context);
  return incident;
}

async function recordCalibrationOutcome(db, tenant, input) {
  const context = await load(db, tenant);
  const state = calibrator.recordOutcome(context.state, requiredText(input?.classification,
    'ASP_CLASSIFICATION_REQUIRED', 64), input?.correct === true);
  await persist(context);
  return state;
}

async function updateWorld(db, tenant, input) {
  const context = await load(db, tenant);
  const result = input?.relation
    ? world.addRelation(context.state.world, input.relation)
    : world.upsertEntity(context.state.world, input?.entity || {});
  await persist(context);
  return result;
}

async function getWorld(db, tenant, query = {}) {
  const state = await getState(db, tenant);
  return world.query(state.world, query);
}

const serviceApi = {
  SCOPE,
  registerSensor,
  observe,
  getState,
  recordIncident,
  recordCalibrationOutcome,
  updateWorld,
  getWorld
};

async function runImmuneSurveillanceWindow(db, tenant, windowSpec = {}) {
  return immuneSurveillance.runImmuneSurveillanceWindow(serviceApi, { db, tenant }, windowSpec);
}

async function runImmuneSurveillanceCampaign(db, tenant, campaignSpec = {}) {
  return immuneSurveillance.runImmuneSurveillanceCampaign(serviceApi, { db, tenant }, campaignSpec);
}

module.exports = {
  ...serviceApi,
  runImmuneSurveillanceWindow,
  runImmuneSurveillanceCampaign,
  runAutonomousWindow: runImmuneSurveillanceWindow,
  runAutonomousCampaign: runImmuneSurveillanceCampaign
};
