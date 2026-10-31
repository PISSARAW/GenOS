const prompts = require('./agent-runtime-prompt.cjs');
const conscience = require('../src/services/agentConscienceService');
const { handleSuccessfulReport } = require('./agent-runtime-close.cjs');
const workerMcpPreflight = require('./worker-mcp-inventory-preflight.cjs');
const missionMemoryContext = require('../src/services/agentRuntimeAdapter/missionMemoryContext');

function createContext(mission, emit) {
  const strategyContract = JSON.parse(mission.strategyContractJson || '{}');
  const autonomyPlan = JSON.parse(mission.autonomyPlanJson || '{}');
  const isWorker = mission.executionMode === 'worker';
  const agentName = mission.name || mission.agentId;
  const nameMeaning = mission.nameMeaning || mission.role;
  const hostExecutionContext = parseHostExecutionContext(mission.hostExecutionContextJson, mission);
  const memoryBlock = missionMemoryContext.isResolved(mission) ? missionMemoryContext.textForMission(mission) : '';
  const state = { mission, strategyContract, autonomyPlan, isWorker, agentName, nameMeaning,
    hostExecutionContext,
    toolLease: JSON.parse(mission.toolLeaseJson || '[]'), executionBudget: JSON.parse(mission.executionBudgetJson || '{}'),
    observedTools: new Set(), recordedTurns: [], code: 0, eventCount: 0, estimatedTokens: 0,
    exactTokens: 0, observedCostUsd: 0, conscienceState: conscience.createConscienceState(), emit };
  state.prompt = prompts.buildAgentRuntimePrompt(require('./caller-mcp-contextValues1.cjs').createContextValue1({ JSON, agentName, autonomyPlan, isWorker, memoryBlock, mission, prompts, get state() { return state; }, strategyContract, workerMcpPreflight }));
  return state;
}

function parseHostExecutionContext(serialized, mission) {
  try {
    const context = JSON.parse(serialized || '{}');
    if (context && context.schemaVersion === 1) return context;
    return fallbackHostExecutionContext(mission);
  } catch (_) {
    return fallbackHostExecutionContext(mission);
  }
}

function fallbackHostExecutionContext(mission) {
  return {
    schemaVersion: 1,
    harnessId: 'mcp-host',
    harnessVersion: null,
    providerId: mission.provider || 'unknown',
    modelId: mission.modelId || 'unknown',
    samplingAvailable: false,
    toolsAvailable: [],
    structuredOutput: false,
    checkpoint: false,
    restore: false,
    cancellation: false,
    streaming: false,
    humanInput: false,
    provenanceConfidence: 'unknown',
  };
}

async function finishContext(state, text) {
  const report = validateCallerReport(text, state.isWorker ? state.mission : null);
  state.finalReportText = text;
  const ok = await handleSuccessfulReport(state);
  if (!ok) throw new Error('GenOS rejected the caller evidence report.');
  if (report.outcome === 'failed') process.exitCode = 1;
}

function validateCallerReport(text, workerMission = null) {
  const report = JSON.parse(text);
  if (!report || !['success', 'failed', 'no_answer'].includes(report.outcome)) throw new Error('Caller report requires an explicit outcome.');
  if (report.outcome !== 'success') return report;
  if (!Array.isArray(report.claims) || !report.claims.length) throw new Error('Successful caller report requires evidence-bearing claims.');
  if (report.artifact === 'creative' && !String(report.artifactText || '').trim()) throw new Error('Creative caller report requires a non-empty artifactText.');
  if (workerMission) validateWorkerSuccess(report, workerMission);
  return report;
}

function validateWorkerSuccess(report, mission) {
  const responseFormat = require('../src/services/workerEvidenceIdentityPrompt').workerResponseFormat(mission);
  const validate = new (require('ajv'))({ allErrors: true, strict: false }).compile(responseFormat.schema);
  if (validate({ ...report, outcome: 'success' })) return;
  const violations = (validate.errors || []).map((error) => `${error.instancePath || '$'} ${error.message}`);
  throw Object.assign(new Error(`Successful caller worker report violates its typed response schema: ${violations.join('; ')}`), {
    code: 'CALLER_WORKER_RESPONSE_SCHEMA_INVALID',
    violations
  });
}

module.exports = { createContext, finishContext, validateCallerReport, validateWorkerSuccess };
