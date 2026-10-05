'use strict';

/**
 * Runtime bridge for the consciousness-concept indicators.
 *
 * This module deliberately composes existing bounded services.  It is not a
 * consciousness claim: it emits an auditable runtime receipt and leaves
 * promotion to the evidence gate.  Missing measurements remain explicit.
 */

const crypto = require('node:crypto');
const ignition = require('./ignitionService');
const reverberation = require('./reverberationService');
const workspace = require('./selectiveSignalService');
const predictive = require('./predictiveHierarchyService');
const worldModel = require('./worldModelService');
const efference = require('./efferenceCopyService');
const metacognition = require('./metacognitionBenchService');
const bandit = require('./routingBanditService');
const valence = require('./valenceService');
const causal = require('./causalIntegrationService');
const semantic = require('./semanticReportService');
const { AdaptiveStateService } = require('./adaptiveStateService');

const SCOPE = 'concept_runtime';
const RECEIPT_LIMIT = 32;
const CONCEPTS = Object.freeze([
  'global_workspace', 'nonlinear_ignition', 'sustained_recurrence',
  'metacognition', 'predictive_inference', 'self_world_distinction',
  'world_model', 'flexible_agency', 'causal_integration',
  'valence_interoception', 'report_access'
]);

function hashReceipt(receipt) {
  return crypto.createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
}

function eventAction(event) {
  const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {};
  return String(payload.action || event?.action || event?.eventType || '').slice(0, 120);
}

function eventWeight(event) {
  const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {};
  const value = Number(payload.salience ?? payload.weight ?? payload.intensity);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
}

function stateVariables(event) {
  const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {};
  return payload.internalState || payload.variables || {};
}

async function attempt(operation, fallback) {
  try { return await operation(); } catch (_) { return fallback; }
}

async function observeEvent(db, agentId, event) {
  const action = eventAction(event);
  const success = !/FAIL|ERROR|HALT|BLOCK/i.test(String(event?.eventType || ''));
  const details = String(event?.detail || '').slice(0, 160);
  const result = {};
  result.reverberation = await attempt(
    () => reverberation.updateFromEvent(db, agentId, event), null
  );
  result.workspace = await attempt(
    () => workspace.dispatch(db, {
      agentId, origin: agentId, modality: 'arousal', signature: eventAction(event),
      intensity: eventWeight(event), content: String(event?.detail || '').slice(0, 160)
    }), null
  );
  result.efference = await attempt(
    () => efference.discharge(db, agentId, event), { matched: false }
  );
  result.world = await attempt(
    () => worldModel.observeTransition(db, agentId, {
      actionId: event?.payload?.actionId, success, detail: details,
      observedState: stateVariables(event)
    }), { matched: false, surprise: success ? 0 : 1 });
  result.hierarchy = await attempt(
    () => predictive.routeEvent(db, agentId, event), null
  );
  result.ignition = await attempt(
    () => ignition.charge(db, agentId, { weight: eventWeight(event) }), null
  );
  result.valence = valence.driveOf(stateVariables(event));
  result.agency = await attempt(
    () => bandit.recommend(db, { routes: event?.payload?.routes || [], isWorker: true }),
    { ordering: [], explored: false }
  );
  result.action = action;
  return result;
}

function statuses(observation) {
  const worldMeasured = observation.world?.matched === true;
  const agencyMeasured = observation.efference?.matched === true;
  const ignitionMeasured = Boolean(observation.ignition);
  return {
    global_workspace: observation.workspace ? 'measured' : 'not_run',
    nonlinear_ignition: ignitionMeasured ? 'measured' : 'not_run',
    sustained_recurrence: observation.reverberation ? 'measured' : 'not_run',
    metacognition: 'not_run',
    predictive_inference: observation.hierarchy ? 'measured' : 'not_run',
    self_world_distinction: agencyMeasured ? 'measured' : 'not_run',
    world_model: worldMeasured ? 'measured' : 'not_run',
    flexible_agency: observation.agency?.ordering?.length ? 'measured' : 'not_run',
    causal_integration: 'not_run',
    valence_interoception: observation.valence ? 'measured' : 'not_run',
    report_access: 'measured'
  };
}

function promotion(statusMap, evidence) {
  const required = ['local_causal_ablation', 'external_task_campaign', 'reserved_replication'];
  const supplied = new Set(Array.isArray(evidence) ? evidence : []);
  const missing = required.filter((item) => !supplied.has(item));
  const allMeasured = CONCEPTS.every((concept) => statusMap[concept] === 'measured');
  return { allowed: allMeasured && missing.length === 0, allMeasured, missing };
}

async function persist(db, agentId, receipt) {
  const store = new AdaptiveStateService(db);
  const state = (await store.restoreObject(SCOPE, agentId)) || {};
  const receipts = Array.isArray(state.receipts) ? state.receipts : [];
  const bounded = [...receipts, receipt].slice(-RECEIPT_LIMIT);
  await store.persistObject(SCOPE, agentId, { receipts: bounded }, bounded.length);
  return receipt;
}

async function processEvent(db, input = {}) {
  const { agentId, event, options = {} } = input;
  if (!db || !agentId || !event) return { status: 'insufficient_data', concepts: {} };
  const observation = await observeEvent(db, agentId, event);
  const conceptStatus = statuses(observation);
  if (event.eventType === 'AGENT_COMPLETED' || event.action === 'VERIFY') {
    const bench = await attempt(() => metacognition.runBenchSafe(db, agentId), null);
    const integration = await attempt(() => causal.analyzeCircuit(db, agentId, {}), null);
    conceptStatus.metacognition = bench?.status === 'measured' ? 'measured' : 'not_run';
    conceptStatus.causal_integration = integration?.status === 'measured' ? 'measured' : 'not_run';
  }
  const report = semantic.renderingContract({ propositions: [], uncertainties: [] });
  const receipt = {
    schema: 'genos.concept-runtime-receipt/v1',
    agentId,
    eventType: event.eventType || null,
    concepts: conceptStatus,
    observation: {
      ignition: observation.ignition,
      surprise: observation.world?.surprise ?? null,
      agencyMatched: observation.efference?.matched === true,
      reportContract: report.rules
    },
    causal: { status: 'not_established', limitation: 'A runtime observation is not a causal intervention.' },
    promotion: promotion(conceptStatus, options.evidence),
    createdAt: new Date().toISOString()
  };
  receipt.receiptHash = hashReceipt(receipt);
  await attempt(() => persist(db, agentId, receipt), null);
  return receipt;
}

module.exports = { CONCEPTS, processEvent, promotion, statuses };
