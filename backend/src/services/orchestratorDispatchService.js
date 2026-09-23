const runtimeAdapter = require('./agentRuntimeAdapter');

function buildWorkerMission(input = {}) {
  const manifestJson = input.capabilityManifest ? JSON.stringify(input.capabilityManifest) : null;
  return {
    agentId: input.agentId,
    orchestratorAgentId: input.orchestratorAgentId,
    prompt: input.prompt,
    role: input.role || 'worker',
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
    autonomousOrchestration: false
  };
}

function dispatchWorkerMission(input) {
  return runtimeAdapter.startMission(buildWorkerMission(input));
}

module.exports = { buildWorkerMission, dispatchWorkerMission };
