const { emit } = require('../agentOrchestrationState');
const swarmSentinel = require('../swarmSentinelService');
const { NaturalSearchController, SEARCH_PROCESS } = require('./naturalSearchController');
const { NaturalSearchActuator } = require('./naturalSearchActuatorService');
const { HypothesisLedger } = require('./hypothesisLedgerService');
const { CausalProgressService } = require('./causalProgressService');
const { SearchPersistence } = require('./searchPersistenceService');
const { SearchIntegration } = require('./searchIntegrationService');
const { handlePostReceiptMemory } = require('./naturalSearchMemory');
const { getDatabase } = require('../../db');
const { ActuatorModules } = require('./actuatorModules');
const { handleHypothesisProtocol } = require('./hypothesisEventProtocol');
const { flushCheckpoint, restoreCheckpoint, receiveCulture } = require('./searchRuntimeCheckpoint');
const { ingestEvidence, ingestFailureEvidence, buildSearchSignals } = require('./naturalSearchEvidence');

const agentSearchState = new Map();
const pendingSearchState = new Map();
const operations = new Map();
let cachedDb = null;
const NATURAL_SEARCH_INPUT_EVENTS = new Set([
  'AGENT_STEP', 'AGENT_MESSAGE', 'TOOL_EXECUTED', 'TOOL_RESULT', 'TOOL_CALL_COMPLETED',
  'EVIDENCE_REPORT', 'AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED',
  'HYPOTHESIS_PROPOSED', 'HYPOTHESIS_TEST_STARTED', 'HYPOTHESIS_PROGRESS',
  'HYPOTHESIS_FALSIFIED', 'HYPOTHESIS_SUSPENDED'
]);
const NON_PROGRESS_STEP_ACTIONS = new Set(['THINK', 'VERIFY']);

async function ensureDb() {
  if (!cachedDb) cachedDb = await getDatabase();
  return cachedDb;
}

function enqueue(agentId, action) {
  const previous = operations.get(agentId) || Promise.resolve();
  const next = previous.catch(() => {}).then(action);
  operations.set(agentId, next);
  return next.finally(() => { if (operations.get(agentId) === next) operations.delete(agentId); });
}

async function getOrCreateSearchState(agentId, ctxDb = null) {
  if (pendingSearchState.has(agentId)) return pendingSearchState.get(agentId);
  if (agentSearchState.has(agentId)) return agentSearchState.get(agentId);
  const pending = createSearchState(agentId, ctxDb);
  pendingSearchState.set(agentId, pending);
  try { return await pending; } finally { pendingSearchState.delete(agentId); }
}

async function createSearchState(agentId, ctxDb) {
  const db = ctxDb || await ensureDb();
  if (!db) throw new Error('Natural Search requires durable storage');
  const persistence = new SearchPersistence(db);
  const ledger = new HypothesisLedger({ budgetRatioThreshold: 0.8 });
  const controller = new NaturalSearchController({ ledger });
  const modules = new ActuatorModules({ ledger });
  const actuator = new NaturalSearchActuator({ db, persistence, ledger, modules });
  const integration = new SearchIntegration({ negativeMemory: modules.negativeMemory, culture: modules.cultureService });
  const state = { agentId, ledger, controller, actuator, persistence, integration,
    causalProgress: new CausalProgressService(), stepCount: 0, lastProgressStep: 0, causalEvents: [] };
  await persistence.initTables();
  await restoreCheckpoint(state);
  await receiveCulture(state);
  // Establish an authoritative checkpoint before the first event can partially write projections.
  await flushCheckpoint(state);
  agentSearchState.set(agentId, state);
  return state;
}

async function flushCurrentState(agentId) {
  if (pendingSearchState.has(agentId)) await pendingSearchState.get(agentId);
  const state = agentSearchState.get(agentId);
  if (state) await flushCheckpoint(state);
}

function flushSearchState(agentId) {
  return enqueue(agentId, () => flushCurrentState(agentId));
}

function clearSearchState(agentId) {
  return enqueue(agentId, async () => {
    await flushCurrentState(agentId);
    agentSearchState.delete(agentId);
  });
}

function buildSearchContext(ctx, state) {
  const report = state.causalProgress.report();
  const hypotheses = state.ledger.hypothesesForAgent(ctx.agentId);
  const lineagePressure = { falsifiedCount: 0, supportedCount: 0 };
  for (const h of hypotheses) {
    if (h.status === 'falsified') lineagePressure.falsifiedCount++;
    if (h.status === 'supported') lineagePressure.supportedCount++;
  }
  return { agentId: ctx.agentId, searchYield: report.window.searchYield,
    stepsSinceProgress: state.stepCount - state.lastProgressStep,
    falsifiedHypotheses: lineagePressure.falsifiedCount,
    contradictions: [...state.ledger.proofs.values()].filter(p => p.direction === 'against').length,
    activeHypothesesCount: state.ledger.activeHypotheses().length,
    budgetRatio: ctx.budgetRatio ?? 0.3, causalProgressReport: report,
    entropyMetrics: swarmSentinel.getAgentEntropy(ctx.agentId), lineagePressure,
    events: state.causalEvents, infoGain: state.causalProgress.window.steps.at(-1)?.evidenceGain || 0,
    validatedSearchOutcomes: ctx.validatedSearchOutcomes || null,
    ...buildSearchSignals(state.ledger, ctx.agentId) };
}

function applyBudget(state, mission) {
  if (!mission?.executionBudget) return;
  const budget = mission.executionBudget;
  state.causalProgress.setBudgets({ tokenBudget: budget.tokens || 100000,
    costBudget: budget.costUsd || 1, timeBudget: budget.timeSec || 600 });
}

function ingestEvent(state, ctx, event) {
  const payload = event.payload || {};
  applyBudget(state, ctx.normalizedMission);
  state.causalProgress.ingestEvent(event);
  handleHypothesisProtocol({ ledger: state.ledger, eventType: event.eventType, payload, agentId: ctx.agentId });
  ingestEvidence(state, event);
  if (['AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED'].includes(event.eventType)) {
    ingestFailureEvidence(state, event);
  }
  state.causalEvents.push({ action: event.action || event.eventType, hypothesisId: payload.hypothesisId || null,
    statement: payload.hypothesisStatement || state.ledger.hypotheses.get(payload.hypothesisId)?.statement || null,
    isCheckpoint: payload.isCheckpoint === true || event.action === 'checkpoint' });
  state.causalEvents = state.causalEvents.slice(-100);
  state.stepCount++;
  proposeAfterStagnation(state);
}

function proposeAfterStagnation(state) {
  if (state.stepCount - state.lastProgressStep <= 5 || state.ledger.activeHypotheses().length) return;
  const genome = state.actuator.searchGenome.genome;
  if (state.integration.isPathBlocked(state.agentId, `${genome.hypothesisFamily} variant`)) return;
  const h = state.ledger.propose({ agentId: state.agentId, confidence: 0.4,
    statement: `Hypothèse proactive: famille=${genome.hypothesisFamily}, stratégie=${genome.strategy}` });
  state.ledger.startTest(h.id);
}

async function executeSearchStep(state, ctx) {
  const searchCtx = buildSearchContext(ctx, state);
  if (searchCtx.validatedSearchOutcomes && !(await state.persistence.canTransmitCulture(
    ctx.agentId, searchCtx.validatedSearchOutcomes.targetAgentId))) searchCtx.validatedSearchOutcomes = null;
  const selection = state.controller.selectProcess(searchCtx);
  state.controller.recordSelection(selection);
  const failed = state.ledger.hypothesesForAgent(ctx.agentId).find(h => h.status === 'falsified');
  const lockIn = state.ledger.detectLockIn()[0];
  const hypothesis = failed || state.ledger.hypotheses.get(lockIn?.hypothesisId) || null;
  const genome = state.actuator.searchGenome.genome;
  const receipt = selection.process === SEARCH_PROCESS.CONTINUE ? null : await state.actuator.execute(selection.process, {
    agentId: ctx.agentId, radius: selection.recommendedRadius, infoGain: searchCtx.infoGain,
    events: searchCtx.events, lockInHypothesis: hypothesis, topology: genome.topology, tools: genome.operators,
    successfulFamilies: searchCtx.successfulFamilies, failedFamilies: searchCtx.failedFamilies,
    recommendedStrategies: searchCtx.recommendedStrategies
  });
  handlePostReceiptMemory({ searchState: state, selection, receipt, searchCtx, agentId: ctx.agentId,
    eventType: ctx.eventType, hypothesisId: ctx.eventHypothesisId });
  if (receipt?.status === 'failure') throw new Error(`Natural Search ${selection.process}: ${receipt.result.error}`);
  await state.persistence.saveDecision(ctx.agentId, { ...selection, searchYield: searchCtx.searchYield,
    stepsSinceProgress: searchCtx.stepsSinceProgress, falsifiedHypotheses: searchCtx.falsifiedHypotheses });
  await flushCheckpoint(state);
  emit(ctx.agentId, 'NATURAL_SEARCH_DECISION', 'SEARCH_CONTROL', selection.diagnostics.reason || '', selection, 'info');
  if (receipt) emit(ctx.agentId, 'NATURAL_SEARCH_ACTION', 'SEARCH_ACTUATOR', receipt.action,
    { process: selection.process, receiptId: receipt.id, status: receipt.status, result: receipt.result },
    receipt.status === 'success' ? 'info' : 'warning');
}

async function processSearchEvent(ctx, event) {
  const state = await getOrCreateSearchState(ctx.agentId, ctx.db);
  await receiveCulture(state);
  ingestEvent(state, ctx, event);
  await executeSearchStep(state, { ...ctx, eventType: event.eventType, eventHypothesisId: event.payload?.hypothesisId });
}

async function checkNaturalSearchControl(ctx, event, finalEvent = null) {
  void finalEvent;
  if (!shouldProcessNaturalSearchEvent(event)) return false;
  const normalized = { ...event, eventType: String(event.eventType).trim().toUpperCase() };
  try {
    await enqueue(ctx.agentId, () => processSearchEvent(ctx, normalized));
    return false;
  } catch (err) {
    console.error(`[Natural Search Control] Error for ${ctx.agentId}:`, err.message);
    emit(ctx.agentId, 'NATURAL_SEARCH_ERROR', 'SEARCH_ERROR', err.message, { error: err.message }, 'warning');
    return true;
  }
}

function shouldProcessNaturalSearchEvent(event) {
  const type = String(event?.eventType || '').trim().toUpperCase();
  if (!NATURAL_SEARCH_INPUT_EVENTS.has(type)) return false;
  const payloadType = String(event.payload?.type || '').trim().toLowerCase();
  if (['item.started', 'turn.started', 'turn.completed'].includes(payloadType)) return false;
  return type !== 'AGENT_STEP' || !NON_PROGRESS_STEP_ACTIONS.has(String(event.action || '').trim().toUpperCase());
}

async function initializeNaturalSearchRuntime(db) {
  cachedDb = db || await ensureDb();
}

module.exports = { checkNaturalSearchControl, shouldProcessNaturalSearchEvent, getOrCreateSearchState,
  clearSearchState, flushSearchState, ensureDb, initializeNaturalSearchRuntime };
