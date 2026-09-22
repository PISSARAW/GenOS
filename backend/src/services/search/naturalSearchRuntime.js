const { emit } = require('../agentOrchestrationState');
const swarmSentinel = require('../swarmSentinelService');
const { NaturalSearchController, SEARCH_PROCESS } = require('./naturalSearchController');
const { NaturalSearchActuator } = require('./naturalSearchActuatorService');
const { HypothesisLedger, HYPOTHESIS_STATUS } = require('./hypothesisLedgerService');
const { CausalProgressService } = require('./causalProgressService');

const agentSearchState = new Map();

function getOrCreateSearchState(agentId) {
  if (!agentSearchState.has(agentId)) {
    const ledger = new HypothesisLedger({ budgetRatioThreshold: 0.8 });
    const controller = new NaturalSearchController({ ledger });
    const actuator = new NaturalSearchActuator();
    const causalProgress = new CausalProgressService();
    agentSearchState.set(agentId, { ledger, controller, actuator, causalProgress, stepCount: 0, lastProgressStep: 0 });
  }
  return agentSearchState.get(agentId);
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
      provenance: payload.evidenceProvenance || ledger.PROVENANCE.SELF_REPORTED, reliability: 0.7,
      independent: true, evidenceRef: payload.evidenceRef || null
    });
    searchState.lastProgressStep = searchState.stepCount;
  }
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
    direction: 'against', strength: 0.5, provenance: ledger.PROVENANCE.SELF_REPORTED,
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

function executeProcess(selection, ledger, actuator) {
  if (selection.process === SEARCH_PROCESS.CONTINUE) return null;

  const ctx = selection.context || {};
  return actuator.executeSync(selection.process, {
    agentId: ctx.agentId || selection.agentId,
    lockInHypothesis: selection.classification === 'HYPOTHESIS_LOCK_IN' ? { hypothesisId: ledger.detectLockIn()[0]?.hypothesisId } : null,
    lastKnownGood: `checkpoint_${ctx.agentId || selection.agentId}`,
    topology: ctx.topology || 'isolated',
    tools: ctx.tools || ['grep', 'test']
  });
}

async function checkNaturalSearchControl(ctx, event) {
  const { agentId, normalizedMission } = ctx;

  try {
    const searchState = getOrCreateSearchState(agentId);
    const { ledger, controller, actuator, causalProgress } = searchState;

    applyBudget(searchState, normalizedMission);
    causalProgress.ingestEvent(event);
    ingestEvidence(searchState, event.payload || {});

    if (['AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED'].includes(event.eventType)) {
      ingestFailureEvidence(searchState, event);
    }

    searchState.stepCount++;

    const searchCtx = buildSearchContext(ctx, searchState);
    const selection = controller.selectProcess(searchCtx);

    emitDecision(agentId, selection, searchCtx);

    const receipt = executeProcess(selection, ledger, actuator);
    if (receipt) emitAction(agentId, selection.process, receipt);

    return false;

  } catch (err) {
    console.error(`[Natural Search Control] Error for ${agentId}:`, err.message);
    emit(agentId, 'NATURAL_SEARCH_ERROR', 'SEARCH_ERROR', err.message, { error: err.message }, 'warning');
    return false;
  }
}

module.exports = { checkNaturalSearchControl, getOrCreateSearchState, clearSearchState };
