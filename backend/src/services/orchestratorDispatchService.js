const runtimeAdapter = require('./agentRuntimeAdapter');
const workerKinds = require('./agents/workerKindService');

function buildWorkerMission(input = {}) {
  const manifestJson = input.capabilityManifest ? JSON.stringify(input.capabilityManifest) : null;
  const workerKind = workerKinds.resolveWorkerKind(input.workerKind, input.role || 'worker');
  const mission = {
    agentId: input.agentId,
    missionId: input.missionId,
    missionScope: input.missionScope,
    orchestratorAgentId: input.orchestratorAgentId,
    prompt: input.prompt,
    role: input.role || 'worker',
    workerKind,
    methodContract: input.methodContract || null,
    workerAssignment: input.workerAssignment || null,
    specialtyNiche: input.specialtyNiche, nicheDomain: input.nicheDomain,
    hostContractId: input.hostContractId, hostCapabilities: input.hostCapabilities,
    recoveryLease: input.recoveryLease, writeLease: input.writeLease === true,
    workerTokenLimit: input.executionBudget?.tokens,
    workspaceId: input.workspaceId,
    workspaceRoot: input.workspaceRoot,
    workspaceProvisioned: input.workspaceProvisioned === true,
    capsuleRoot: input.capsuleRoot,
    fleetId: input.fleetId,
    agentType: input.agentType,
    workspaceIsolation: input.workspaceIsolation,
    modelTier: input.modelTier,
    language: input.language,
    executionBudget: input.executionBudget || {},
    executionPolicy: input.executionPolicy || {},
    toolLease: input.toolLease,
    capabilities: input.capabilities,
    capabilityManifestJson: manifestJson,
    strategyContract: input.strategyContract,
    timeoutMs: input.timeoutMs,
    localRuntime: input.localRuntime,
    localModel: input.localModel,
    localRoutingPolicy: input.localRoutingPolicy,
    variantIndex: input.variantIndex,
    autonomousOrchestration: false
  };
  mission.workerContract = workerKinds.buildWorkerContract(workerKind, mission);
  mission.cognitivePosture = applyCognitivePosture(mission, input);
  mission.prompt = [
    mission.prompt,
    `Worker kind: ${workerKind}. ${workerKinds.promptRule(workerKind)}`,
    mission.methodContract ? `Method contract: ${JSON.stringify(mission.methodContract)}. Follow it and report unmet preconditions.` : null,
    workerKinds.evidenceRule(mission.workerContract)
  ].filter(Boolean).join('\n\n');
  return mission;
}

function applyCognitivePosture(mission, input) {
  try {
    const posture = require('./cognitivePostureService').attachPosture({ agentId: input.agentId, prompt: input.prompt });
    if (posture) mission.prompt = [mission.prompt, posture.directive].filter(Boolean).join('\n\n');
    return posture ? posture.receipt : null;
  } catch (_) {
    return null;
  }
}

function dispatchWorkerMission(input) {
  return runtimeAdapter.startMission(buildWorkerMission(input));
}

module.exports = { buildWorkerMission, dispatchWorkerMission };
