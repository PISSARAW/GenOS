'use strict';

const crypto = require('node:crypto');
const gate = require('./consciousnessEvidence/indicatorPromotionGate');
const { AdaptiveStateService } = require('./adaptiveStateService');

const SCOPE = 'concept_runtime';
const CONCEPTS = Object.freeze([
  'global_workspace', 'nonlinear_ignition', 'sustained_recurrence',
  'metacognition', 'predictive_inference', 'self_world_distinction',
  'world_model', 'flexible_agency', 'causal_integration',
  'valence_interoception', 'report_access'
]);

// Inspect producer results; never discharge, charge or learn twice.
function statuses(observation = {}, agentId) {
  const perception = observation.agow?.prediction ? observation.agow : null;
  const cycle = observation.agow?.cycle || perception?.submission?.cycle;
  const measured = { ...cycleStatuses(cycle), ...actionStatuses(observation.actuation, agentId),
    sustained_recurrence: perception?.recurrence === true,
    predictive_inference: Boolean(perception || observation.predictive?.predictionErrors?.length) };
  if (observation.predictive?.selfTwinFeedback?.discrepancy?.status === 'measured') measured.self_world_distinction = true;
  return Object.fromEntries(CONCEPTS.map((id) => [id, measured[id] ? 'observed' : 'not_run']));
}

function cycleStatuses(cycle) {
  return { global_workspace: cycle?.broadcast?.deliveries?.some((receipt) => receipt.consumed === true),
    nonlinear_ignition: cycle?.ignition?.some((entry) => entry.ignited),
    flexible_agency: cycle?.modeResult?.executed === true,
    metacognition: cycle?.modeResult?.outcomeReceipt?.calibrated === true
      && Number.isFinite(cycle.modeResult.outcomeReceipt.predictionError) };
}

function actionStatuses(receipt, agentId) {
  if (!require('./conceptActionLifecycleService').isObserved(receipt, agentId)) return {};
  return { world_model: receipt.worldModel.sample?.samples > 0,
    self_world_distinction: receipt.efference.matched === true,
    valence_interoception: receipt.valence.status === 'observed' };
}

function promotion(statusMap, evidence = [], context = {}) {
  const reports = CONCEPTS.map((indicatorId) => gate.evaluate({ indicatorId, scope: context.scope,
    contextHash: context.contextHash, receipts: evidence }));
  return {
    allowed: reports.every((report) => report.promotionAllowed),
    allObserved: CONCEPTS.every((id) => statusMap[id] === 'observed'),
    missing: reports.filter((report) => !report.promotionAllowed)
      .map((report) => ({ indicatorId: report.indicatorId, requirements: report.missingRequirements }))
  };
}

async function persist(db, agentId, receipt) {
  const store = new AdaptiveStateService(db);
  const state = (await store.restoreObject(SCOPE, agentId)) || {};
  const receipts = Array.isArray(state.receipts) ? state.receipts : [];
  const bounded = [...receipts, receipt].slice(-32);
  await store.persistObject(SCOPE, agentId, { receipts: bounded }, bounded.length);
}

async function processEvent(db, input = {}) {
  const { agentId, event, observation = {} } = input;
  if (!db || !agentId || !event) return { status: 'insufficient_data', concepts: {} };
  const concepts = statuses(observation, agentId);
  const receipt = {
    schema: 'genos.concept-runtime-receipt/v2', agentId,
    eventId: event.eventId || event.id || null, eventType: event.eventType || null,
    concepts,
    observation: observationSummary(observation),
    causal: { status: 'not_established', limitation: 'Observation is not a causal intervention.' },
    // Event payloads are deliberately excluded from the trust boundary.
    promotion: promotion(concepts, input.verifiedReceipts, input), createdAt: new Date().toISOString()
  };
  receipt.receiptHash = crypto.createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
  try {
    await persist(db, agentId, receipt);
    return { ...receipt, persistence: { status: 'stored' } };
  } catch (error) {
    return { ...receipt, persistence: { status: 'failed', reason: error.code || 'storage_failed' } };
  }
}

function observationSummary(observation) {
  return { frameId: observation.agow?.cycle?.frame?.frameId || null,
    perceptualStateHash: observation.agow?.stateHash || null,
    predictionErrors: observation.predictive?.predictionErrors?.length || 0,
    actionId: observation.actuation?.actionId || null,
    actionReceiptHash: observation.actuation?.receiptHash || null };
}

module.exports = { CONCEPTS, processEvent, promotion, statuses };
