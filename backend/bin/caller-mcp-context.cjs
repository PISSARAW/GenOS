const prompts = require('./agent-runtime-prompt.cjs');
const conscience = require('../src/services/agentConscienceService');
const { handleSuccessfulReport } = require('./agent-runtime-close.cjs');

function createContext(mission, emit) {
  const strategyContract = JSON.parse(mission.strategyContractJson || '{}');
  const autonomyPlan = JSON.parse(mission.autonomyPlanJson || '{}');
  const isWorker = mission.executionMode === 'worker';
  const agentName = mission.name || mission.agentId;
  const nameMeaning = mission.nameMeaning || mission.role;
  const state = { mission, strategyContract, autonomyPlan, isWorker, agentName, nameMeaning,
    toolLease: JSON.parse(mission.toolLeaseJson || '[]'), executionBudget: JSON.parse(mission.executionBudgetJson || '{}'),
    observedTools: new Set(), recordedTurns: [], code: 0, eventCount: 0, estimatedTokens: 0,
    exactTokens: 0, observedCostUsd: 0, conscienceState: conscience.createConscienceState(), emit };
  state.prompt = prompts.buildAgentRuntimePrompt({ ...state,
    selfIntro: `You are ${agentName}, GenOS ${mission.executionMode}.`, conscienceBlock: '', memoryBlock: '',
    authorityInstruction: isWorker ? `Return evidence to ${mission.orchestratorAgentId}. Do not spawn agents or promote results.` : 'Own the GenOS mission. Account for all attached worker dossiers. Do not redispatch workers in final synthesis.',
    runtimeContract: prompts.compactStrategyContract(strategyContract, isWorker),
    runtimeAutonomyPlan: prompts.compactAutonomyPlan(autonomyPlan),
    executionPolicy: JSON.parse(mission.executionPolicyJson || '{}'),
    genosCapsule: JSON.parse(mission.genosCapsuleJson || '{}'), allowFileEdits: false, allowedCommands: []
  });
  return state;
}

async function finishContext(state, text) {
  const report = validateCallerReport(text);
  state.finalReportText = text;
  const ok = await handleSuccessfulReport(state);
  if (!ok) throw new Error('GenOS rejected the caller evidence report.');
  if (report.outcome === 'failed') process.exitCode = 1;
}

function validateCallerReport(text) {
  const report = JSON.parse(text);
  if (!report || !['success', 'failed', 'no_answer'].includes(report.outcome)) throw new Error('Caller report requires an explicit outcome.');
  if (report.outcome !== 'success') return report;
  if (!Array.isArray(report.claims) || !report.claims.length) throw new Error('Successful caller report requires evidence-bearing claims.');
  if (report.artifact === 'creative' && !String(report.artifactText || '').trim()) throw new Error('Creative caller report requires a non-empty artifactText.');
  return report;
}

module.exports = { createContext, finishContext, validateCallerReport };
