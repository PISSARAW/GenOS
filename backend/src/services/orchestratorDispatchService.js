const runtimeAdapter = require('./agentRuntimeAdapter');
const workerKinds = require('./agents/workerKindService');

function missionDefaults(input) {
  return {
    role: input.role || 'worker',
    modelBudgetScope: input.modelBudgetScope || null,
    methodContract: input.methodContract || null,
    workerAssignment: input.workerAssignment || null,
    executionBudget: input.executionBudget || {},
    executionPolicy: input.executionPolicy || {}
  };
}

function buildWorkerMission(input = {}) {
  const defaults = missionDefaults(input);
  const manifestJson = input.capabilityManifest ? JSON.stringify(input.capabilityManifest) : null;
  const workerKind = workerKinds.resolveWorkerKind(input.workerKind, defaults.role);
  const mission = {
    agentId: input.agentId,
    name: input.name,
    nameMeaning: input.nameMeaning,
    missionId: input.missionId,
    missionScope: input.missionScope,
    organization: input.organization,
    coordinationPolicy: input.coordinationPolicy,
    orchestratorAgentId: input.orchestratorAgentId,
    modelBudgetScope: defaults.modelBudgetScope,
    prompt: input.prompt,
    role: defaults.role,
    workerKind,
    methodContract: defaults.methodContract,
    workerAssignment: defaults.workerAssignment,
    specialtyNiche: input.specialtyNiche, nicheDomain: input.nicheDomain,
    hostContractId: input.hostContractId, hostCapabilities: input.hostCapabilities,
    recoveryLease: input.recoveryLease, writeLease: input.writeLease === true,
    workerTokenLimit: input.executionBudget?.tokens,
    workspaceId: input.workspaceId,
    workspaceRoot: input.workspaceRoot,
    workspaceProvisioned: input.workspaceProvisioned === true,
    workspaceBackend: input.workspaceBackend,
    gqwfWorkerLease: input.gqwfWorkerLease || null,
    capsuleRoot: input.capsuleRoot,
    fleetId: input.fleetId,
    agentType: input.agentType,
    workspaceIsolation: input.workspaceIsolation,
    modelTier: input.modelTier,
    language: input.language,
    executionBudget: defaults.executionBudget,
    executionPolicy: defaults.executionPolicy,
    toolLease: input.toolLease,
    capabilities: input.capabilities,
    capabilityManifestJson: manifestJson,
    strategyContract: input.strategyContract,
    timeoutMs: input.timeoutMs,
    executor: input.executor,
    localRuntime: input.localRuntime,
    localCodeWorker: input.localCodeWorker === true,
    requiredPatchPaths: input.requiredPatchPaths,
    requiredPatchMarkers: input.requiredPatchMarkers,
    requiredPatchMinimumBytes: input.requiredPatchMinimumBytes,
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
