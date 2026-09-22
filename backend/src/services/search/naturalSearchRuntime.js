const { emit } = require('../agentOrchestrationState');
const swarmSentinel = require('../swarmSentinelService');
const { NaturalSearchController, SEARCH_PROCESS } = require('./naturalSearchController');
const { NaturalSearchActuator } = require('./naturalSearchActuatorService');
const {
    HypothesisLedger,
    HYPOTHESIS_STATUS,
    PROVENANCE
} = require('./hypothesisLedgerService');
const { CausalProgressService } = require('./causalProgressService');
const { SearchPersistence } = require('./searchPersistenceService');
const { getDatabase } = require('../../db');

const agentSearchState = new Map();
let cachedDb = null;

async function ensureDb() {
  if (cachedDb) return cachedDb;
  try {
    cachedDb = await getDatabase();
    return cachedDb;
  } catch (_) {
    return null;
  }
}

async function getOrCreateSearchState(agentId, ctxDb = null) {
  if (!agentSearchState.has(agentId)) {
    const db = ctxDb || await ensureDb();
    const ledger = new HypothesisLedger({ budgetRatioThreshold: 0.8 });
    const controller = new NaturalSearchController({ ledger });
    const actuator = new NaturalSearchActuator({ db });
    const causalProgress = new CausalProgressService();
    const persistence = new SearchPersistence(db);
    agentSearchState.set(agentId, {
      ledger, controller, actuator, causalProgress,
      persistence, stepCount: 0, lastProgressStep: 0
    });
    if (db) {
      await persistence.initTables().catch(() => {});
    }
  }
  return agentSearchState.get(agentId);
}

async function ensurePersistenceTables(persistence) {
  try {
    await persistence.initTables();
  } catch (_) {}
}

function clearSearchState(agentId) {
  agentSearchState.delete(agentId);
}

function ingestEvidence(searchState, payload) {
  const { ledger } = searchState;
  if (payload.evidenceGain || payload.evidenceRef) {
    const targetHypId = payload.hypothesisId || null;
    if (!targetHypId) return;
    const target = ledger.hypotheses.get(targetHypId);
    if (!target) return;
    if (target.status === HYPOTHESIS_STATUS.FALSIFIED) {
      ledger.notify({ type: 'HYPOTHESIS_REJECTED_EVIDENCE_ON_FALSIFIED', hypothesisId: targetHypId });
      return;
    }
    ledger.addEvidence(targetHypId, {
      direction: 'for', strength: payload.evidenceStrength || 0.5,
      provenance: PROVENANCE.SELF_REPORTED,
      reliability: 0.7,
      independent: true, evidenceRef: payload.evidenceRef || null
    });
    searchState.lastProgressStep = searchState.stepCount;
  }
}

/**
 * Point 3 — Création d'hypothèses à partir d'événements runtime.
 * Si l'événement porte un hypothesisInformationGain > 0 ou un statement explicite,
 * on crée automatiquement une hypothèse dans le Ledger.
 */
function maybeProposeHypothesis(searchState, payload, agentId) {
  const { ledger } = searchState;

  // Cas 1: l'événement porte un statement explicite (HYPOTHESIS_PROPOSAL)
  if (payload.hypothesisStatement) {
    const h = ledger.propose({
      agentId,
      statement: payload.hypothesisStatement,
      prediction: payload.hypothesisPrediction || null,
      falsificationCondition: payload.hypothesisFalsification || null,
      confidence: payload.hypothesisConfidence ?? 0.5
    });
    ledger.startTest(h.id);
    return h;
  }

  // Cas 2: l'événement porte un hypothesisInformationGain > 0
  // et aucune hypothèse active n'existe pour cet agent → proposer une hypothèse par défaut
  const hypothesisGain = Number(payload.hypothesisInformationGain || 0);
  if (hypothesisGain > 0) {
    const activeHyps = ledger.activeHypotheses();
    if (activeHyps.length === 0) {
      const h = ledger.propose({
        agentId,
        statement: `Hypothèse auto-générée (gain=${hypothesisGain.toFixed(3)})`,
        prediction: null,
        falsificationCondition: null,
        confidence: 0.5
      });
      ledger.startTest(h.id);
      return h;
    }
  }

  return null;
}

function ingestFailureEvidence(searchState, event) {
  const { ledger } = searchState;
  const targetHypId = event.payload?.hypothesisId || null;
  if (!targetHypId) {
    ledger.notify({ type: 'HYPOTHESIS_REJECTED_EVIDENCE_ON_FALSIFIED', hypothesisId: null });
    return;
  }
  const target = ledger.hypotheses.get(targetHypId);
  if (!target) return;
  if (target.status === HYPOTHESIS_STATUS.FALSIFIED) {
    ledger.notify({ type: 'HYPOTHESIS_REJECTED_EVIDENCE_ON_FALSIFIED', hypothesisId: targetHypId });
    return;
  }
  ledger.addEvidence(targetHypId, {
  direction: 'against', strength: 0.5, provenance: PROVENANCE.SELF_REPORTED,
    reliability: 0.8, independent: true, evidenceRef: `error:${event.eventType}`
  });
}

function buildSearchContext(ctx, searchState) {
  const { agentId } = ctx;
  const { ledger, causalProgress } = searchState;
  const causalReport = causalProgress.report();
  const searchYield = causalReport.window.searchYield || 0;
  const stepsSinceProgress = searchState.stepCount - searchState.lastProgressStep;
  const falsifiedHyps = ledger.hypothesesForAgent(agentId).filter(h => h.status === 'falsified').length;
  const entropyMetrics = swarmSentinel.getAgentEntropy(agentId);

  const lineagePressure = ledger.hypothesesForAgent(agentId).reduce((acc, h) => {
    if (h.status === 'falsified') acc.falsifiedCount++;
    if (h.status === 'supported') acc.supportedCount++;
    return acc;
  }, { falsifiedCount: 0, supportedCount: 0 });

  return {
    agentId, searchYield, stepsSinceProgress, falsifiedHypotheses: falsifiedHyps,
    contradictions: 0, activeHypothesesCount: ledger.activeHypotheses().length,
    budgetRatio: ctx.budgetRatio || 0.3, causalProgressReport: causalReport, entropyMetrics,
    lineagePressure
  };
}

function applyBudget(searchState, normalizedMission) {
  if (normalizedMission?.executionBudget) {
    searchState.causalProgress.setBudgets({
      tokenBudget: normalizedMission.executionBudget.tokens || 100000,
      costBudget: normalizedMission.executionBudget.costUsd || 1.0,
      timeBudget: normalizedMission.executionBudget.timeSec || 600
    });
  }
}

function emitDecision(agentId, selection, searchCtx) {
  emit(agentId, 'NATURAL_SEARCH_DECISION', 'SEARCH_CONTROL', selection.diagnostics.reason || '', {
    process: selection.process, pressure: selection.pressure, classification: selection.classification,
    searchYield: searchCtx.searchYield.toFixed(4), stepsSinceProgress: searchCtx.stepsSinceProgress,
    falsifiedHypotheses: searchCtx.falsifiedHypotheses
  }, 'info');
}

function emitAction(agentId, process, receipt) {
  emit(agentId, 'NATURAL_SEARCH_ACTION', 'SEARCH_ACTUATOR', receipt.action, {
    process, receiptId: receipt.id, success: receipt.status, result: receipt.status
  }, receipt.status === 'success' ? 'info' : 'warning');
}

function executeProcess({ selection, searchCtx, actuator }) {
  if (selection.process === SEARCH_PROCESS.CONTINUE) return Promise.resolve(null);

  const agentId = searchCtx.agentId;
  if (!agentId) {
    console.warn('[Natural Search] executeProcess called without agentId in searchCtx');
    return Promise.resolve(null);
  }
  return actuator.execute(selection.process, {
    agentId,
    lockInHypothesis: selection.lockInHypothesis || null,
    lastKnownGood: `checkpoint_${agentId}`,
    topology: searchCtx.topology || 'isolated',
    tools: searchCtx.tools || ['grep', 'test']
  });
}

async function persistSearchState(agentId, searchState, selection) {
  const { ledger, causalProgress, persistence } = searchState;
  if (!persistence || !persistence.db) return;

  try {
    // Persist all active hypotheses
    const hypotheses = ledger.hypothesesForAgent(agentId);
    for (const h of hypotheses) {
      try {
        await persistence.saveHypothesis(h);
      } catch (_) {}
    }

    // Persist recent decisions
    await persistence.saveDecision(agentId, {
      process: selection.process,
      classification: selection.classification,
      pressure: selection.pressure,
      searchYield: selection.searchYield,
      stepsSinceProgress: selection.stepsSinceProgress,
      falsifiedHypotheses: selection.falsifiedHypotheses || 0,
      diagnostics: selection.diagnostics
    });

    // Persist pressure state from causal progress report
    const report = causalProgress.report();
    await persistence.savePressureState(agentId, {
      pressure: report.window.searchYield || 0,
      confidence: 0,
      causes: report.diagnostics.diminishingReturns ? ['diminishing_returns'] : [],
      recommendedRadius: report.diagnostics.diminishingReturns ? 'local' : 'medium',
      stepCount: searchState.stepCount,
      lastProgressStep: searchState.lastProgressStep
    });
  } catch (err) {
    console.warn(`[Natural Search] Persistence error for ${agentId}:`, err.message);
  }
}

async function checkNaturalSearchControl(ctx, event) {
  const { agentId, normalizedMission } = ctx;

  try {
    const searchState = await getOrCreateSearchState(agentId, ctx.db);
    const { ledger, controller, actuator, causalProgress, persistence } = searchState;

    applyBudget(searchState, normalizedMission);
    causalProgress.ingestEvent(event);
    ingestEvidence(searchState, event.payload || {});

    // Point 3 — Création d'hypothèses à partir d'événements runtime
    maybeProposeHypothesis(searchState, event.payload || {}, agentId);

    if (['AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED'].includes(event.eventType)) {
      ingestFailureEvidence(searchState, event);
    }

    searchState.stepCount++;

    const searchCtx = buildSearchContext(ctx, searchState);
    const selection = controller.selectProcess(searchCtx);
    selection.lockInHypothesis = selection.classification === 'HYPOTHESIS_LOCK_IN' ? (ledger.detectLockIn()[0]?.hypothesisId || null) : null;

    emitDecision(agentId, selection, searchCtx);

    const receipt = await executeProcess({ selection, searchCtx, actuator });
    if (receipt) emitAction(agentId, selection.process, receipt);

    // Persist hypotheses, proofs, pressure state, and decision to SQLite
    await persistSearchState(agentId, searchState, selection);

    return false;

  } catch (err) {
    console.error(`[Natural Search Control] Error for ${agentId}:`, err.message);
    emit(agentId, 'NATURAL_SEARCH_ERROR', 'SEARCH_ERROR', err.message, { error: err.message }, 'warning');
    return false;
  }
}

module.exports = { checkNaturalSearchControl, getOrCreateSearchState, clearSearchState, ensureDb, initializeNaturalSearchRuntime };

async function initializeNaturalSearchRuntime(db) {
  cachedDb = db;
  const dbModule = require('../../db');
  try {
    if (dbModule.getDatabase && typeof dbModule.getDatabase === 'function') {
      cachedDb = await dbModule.getDatabase();
    }
  } catch (_) {}
}
