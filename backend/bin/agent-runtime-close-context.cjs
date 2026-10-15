const { cleanup } = require('./agent-runtime-home.cjs');
const agentConscience = require('../src/services/agentConscienceService');

function buildCloseContext(state, code, signal) {
  return {
    code, signal, budgetStopped: state.budgetStopped, emit: state.emit,
    cleanup: () => { cleanup(state); }, requiredTools: state.requiredTools,
    observedTools: state.observedTools, db: state.db, hasAgentInDb: state.hasAgentInDb,
    agentConscience, conscienceState: state.conscienceState,
    pendingConscienceOp: state.pendingConscienceOp, mission: state.mission,
    finalReportText: state.finalReportText, agentName: state.agentName,
    nameMeaning: state.nameMeaning, autonomyPlan: state.autonomyPlan,
    isWorker: state.isWorker, exactTokens: state.exactTokens,
    estimatedTokens: state.estimatedTokens, eventCount: state.eventCount,
    tokenUsageObserved: state.tokenUsageObserved,
    tokenUsageUnknown: state.tokenUsageUnknown, observedCostUsd: state.observedCostUsd,
    costUsageObserved: state.costUsageObserved, costUsageUnknown: state.costUsageUnknown,
    codexThreadId: state.codexThreadId, strategyContract: state.strategyContract,
    orchestratorAgentId: state.orchestratorAgentId, recordedTurns: state.recordedTurns,
    stderr: state.stderr
  };
}

module.exports = { buildCloseContext };
