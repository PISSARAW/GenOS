const { emit } = require('../agentOrchestrationState');
const swarmSentinel = require('../swarmSentinelService');
const { NaturalSearchController, SEARCH_PROCESS, PHASE_ENTER } = require('./naturalSearchController');
const { NaturalSearchActuator } = require('./naturalSearchActuatorService');
const { HypothesisLedger, HYPOTHESIS_STATUS, PROVENANCE } = require('./hypothesisLedgerService');
const { CausalProgressService } = require('./causalProgressService');
const { SearchPersistence } = require('./searchPersistenceService');
const { SearchIntegration } = require('./searchIntegrationService');
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

async function flushSearchState(agentId) {
  const searchState = agentSearchState.get(agentId);
  if (!searchState) return;
  const { ledger, causalProgress, persistence } = searchState;
  if (!persistence || !persistence.db) return;
  try {
    const hypotheses = ledger.hypothesesForAgent(agentId);
    await persistHypotheses(persistence, hypotheses);
    await persistProofs(persistence, ledger, hypotheses);
    await persistPressure(searchState, causalProgress, persistence);
  } catch (err) {
    console.warn(`[Natural Search] Flush error for ${agentId}:`, err.message);
  }
}

async function persistHypotheses(persistence, hypotheses) {
  for (const h of hypotheses) {
    try { await persistence.saveHypothesis(h); } catch (_) {}
  }
}

async function persistProofs(persistence, ledger, hypotheses) {
  for (const h of hypotheses) {
    try {
      const proofs = ledger.proofsByIds(h.proofIds);
      for (const p of proofs) {
        try { await persistence.saveProof(p); } catch (_) {}
      }
    } catch (_) {}
  }
}

async function persistPressure(searchState, causalProgress, persistence) {
  const report = causalProgress.report();
  await persistence.savePressureState(searchState.agentId || 'unknown', {
    pressure: report.window.searchYield || 0,
    confidence: 0,
    causes: report.diagnostics.diminishingReturns ? ['diminishing_returns'] : [],
    recommendedRadius: report.diagnostics.diminishingReturns ? 'local' : 'medium',
    stepCount: searchState.stepCount,
    lastProgressStep: searchState.lastProgressStep
  });
}

async function getOrCreateSearchState(agentId, ctxDb = null) {
  if (!agentSearchState.has(agentId)) {
    const db = ctxDb || await ensureDb();
    const persistence = new SearchPersistence(db);
    const ledger = new HypothesisLedger({ budgetRatioThreshold: 0.8 });
    const controller = new NaturalSearchController({ ledger });
    const actuator = new NaturalSearchActuator({ db, persistence, ledger, searchGenome: { patches: new Map(), population: null, genome: null } });
    const causalProgress = new CausalProgressService();
    const integration = new SearchIntegration();
    agentSearchState.set(agentId, {
      ledger, controller, actuator, causalProgress, persistence, integration,
      stepCount: 0, lastProgressStep: 0
    });
    if (db) {
      await persistence.initTables().catch(() => {});
    }
  }
  return agentSearchState.get(agentId);
}

async function clearSearchState(agentId) {
  await flushSearchState(agentId);
  agentSearchState.delete(agentId);
}

/**
 * Point 12 — Routage de provenance selon la source du signal.
 *   LLM output        → SELF_REPORTED (l'agent rapporte ses propres résultats)
 *   Runtime/event     → INFERRED (déduit de l'observation d'événements)
 *   Tool execution    → OBSERVED (mesure externe directe)
 *   Verifier/evidence → VALIDATED (confirmé par un tiers)
 */
function resolveProvenance(payload, eventType) {
  if (payload.provenance) return payload.provenance;
  if (['EVIDENCE_REPORT', 'DOSSIER_INFLUENCE_VERIFIED'].includes(eventType)) return PROVENANCE.VERIFIED;
  if (eventType === 'TOOL_EXECUTED' || eventType === 'TOOL_RESULT') return PROVENANCE.OBSERVED;
  if (eventType === 'AGENT_STEP' || eventType === 'AGENT_MESSAGE') return PROVENANCE.SELF_REPORTED;
  return PROVENANCE.INFERRED;
}

function ingestEvidence(searchState, payload, eventType) {
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
    const provenance = resolveProvenance(payload, eventType);
    ledger.addEvidence(targetHypId, {
      direction: 'for', strength: payload.evidenceStrength || 0.5,
      provenance, reliability: 0.7,
      independent: true, evidenceRef: payload.evidenceRef || null
    });
    searchState.lastProgressStep = searchState.stepCount;
  }
}

function maybeProposeHypothesis(searchState, payload, agentId) {
  const { ledger } = searchState;

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

  const hypothesisGain = Number(payload.hypothesisInformationGain || 0);
  if (hypothesisGain > 0) {
    const activeHyps = ledger.activeHypotheses();
    if (activeHyps.length === 0) {
      const h = ledger.propose({
        agentId,
        statement: `Hypothèse auto-générée (gain=${hypothesisGain.toFixed(3)})`,
        prediction: null, falsificationCondition: null, confidence: 0.5
      });
      ledger.startTest(h.id);
      return h;
    }
  }

  return null;
}

/**
 * Point 11 — Création proactive d'hypothèses par le runtime.
 * Si aucune hypothèse active n'existe après plusieurs étapes sans progrès,
 * génère une hypothèse à partir du meilleur variant du génome de recherche.
 */
function proactiveHypothesis(searchState, agentId) {
  const { ledger, actuator } = searchState;
  const activeHyps = ledger.activeHypotheses();
  if (activeHyps.length > 0) return null;
  const genome = actuator.searchGenome?.genome;
  if (!genome) return null;

  const statement = `Hypothèse proactive: explorer famille=${genome.hypothesisFamily}, stratégie=${genome.strategy}`;
  const h = ledger.propose({
    agentId,
    statement,
    prediction: null,
    falsificationCondition: null,
    confidence: 0.4
  });
  ledger.startTest(h.id);
  return h;
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
  const provenance = resolveProvenance(event.payload || {}, event.eventType);
  ledger.addEvidence(targetHypId, {
    direction: 'against', strength: 0.5, provenance,
    reliability: 0.8, independent: true, evidenceRef: `error:${event.eventType}`
  });

  const { integration } = searchState;
  if (integration) {
    try {
      integration.recordNegative(agentId, target, { ref: event.eventType, strength: 0.5, reliability: 0.8 }, { signature: event.eventType, conditions: [], scope: 'agent' });
    } catch (_) {}
  }
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
    console.warn('[Natural Search] executeProcess called without agentId');
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
    const hypotheses = ledger.hypothesesForAgent(agentId);
    for (const h of hypotheses) {
      try { await persistence.saveHypothesis(h); } catch (_) {}
    }
    await persistence.saveDecision(agentId, {
      process: selection.process, classification: selection.classification,
      pressure: selection.pressure, searchYield: selection.searchYield,
      stepsSinceProgress: selection.stepsSinceProgress,
      falsifiedHypotheses: selection.falsifiedHypotheses || 0,
      diagnostics: selection.diagnostics
    });
    const report = causalProgress.report();
    await persistence.savePressureState(agentId, {
      pressure: report.window.searchYield || 0, confidence: 0,
      causes: report.diagnostics.diminishingReturns ? ['diminishing_returns'] : [],
      recommendedRadius: report.diagnostics.diminishingReturns ? 'local' : 'medium',
      stepCount: searchState.stepCount, lastProgressStep: searchState.lastProgressStep
    });
  } catch (err) {
    console.warn(`[Natural Search] Persistence error: ${err.message}`);
  }
}

async function checkNaturalSearchControl(ctx, event) {
  const { agentId, normalizedMission } = ctx;
  try {
    const searchState = await getOrCreateSearchState(agentId, ctx.db);
    await processSearchEvent(searchState, ctx, event);
    return false;
  } catch (err) {
    console.error(`[Natural Search Control] Error for ${agentId}:`, err.message);
    emit(agentId, 'NATURAL_SEARCH_ERROR', 'SEARCH_ERROR', err.message, { error: err.message }, 'warning');
    return false;
  }
}

async function processSearchEvent(searchState, ctx, event) {
  const eventType = event.eventType || 'AGENT_STEP';
  const { agentId, normalizedMission } = ctx;
  const { ledger, controller, actuator, causalProgress, persistence } = searchState;
  applyBudget(searchState, normalizedMission);
  causalProgress.ingestEvent(event);
  ingestEvidence(searchState, event.payload || {}, eventType);
  maybeProposeHypothesis(searchState, event.payload || {}, agentId);
  if (searchState.stepCount > 5 && (searchState.stepCount - searchState.lastProgressStep) > 5) {
    proactiveHypothesis(searchState, agentId);
  }
  if (['AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED'].includes(eventType)) {
    ingestFailureEvidence(searchState, event);
  }
  searchState.stepCount++;
  const searchCtx = buildSearchContext(ctx, searchState);
  const selection = controller.selectProcess(searchCtx);
  selection.lockInHypothesis = selection.classification === 'HYPOTHESIS_LOCK_IN' ? (ledger.detectLockIn()[0]?.hypothesisId || null) : null;
  emitDecision(agentId, selection, searchCtx);
  const receipt = await executeProcess({ selection, searchCtx, actuator });
  if (receipt) emitAction(agentId, selection.process, receipt);
  await persistSearchState(agentId, searchState, selection);
}

module.exports = { checkNaturalSearchControl, getOrCreateSearchState, clearSearchState, flushSearchState, ensureDb, initializeNaturalSearchRuntime };

async function initializeNaturalSearchRuntime(db) {
  cachedDb = db;
  const dbModule = require('../../db');
  try {
    if (dbModule.getDatabase && typeof dbModule.getDatabase === 'function') {
      cachedDb = await dbModule.getDatabase();
    }
  } catch (_) {}
}
