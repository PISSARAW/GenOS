'use strict';

const modelRouter = require('./modelRouter');
const modelDiscovery = require('./localModelDiscovery');
const differentiation = require('./trinityDifferentiationService');
const { emit } = require('./agentOrchestrationState');

async function configuredModels(input) {
  const { db, agentId, organizationId, projectId, mission } = input;
  const policy = await modelRouter.loadPolicy(db, { agentId, organizationId, projectId });
  const configured = policy ? [policy.primary, ...policy.fallbacks] : [];
  const envModels = [process.env.GENOS_DEFAULT_MODEL, ...String(process.env.GENOS_MODEL_FALLBACKS || '').split(',')];
  const trinityModels = String(process.env.GENOS_TRINITY_MODELS || '').split(',');
  const providerModels = await modelRouter.loadProviderCandidates(db);
  const localModels = await modelDiscovery.discoverChatModelUris().catch(() => []);
  const explicit = mission?.provider === 'ollama' && mission?.modelId
    ? [`ollama://${String(mission.modelId).replace(/^ollama:\/\//, '')}`] : [];
  return [...new Set([...trinityModels, ...explicit, ...configured, ...envModels, ...providerModels, ...localModels]
    .map((uri) => String(uri || '').trim()).filter(Boolean))];
}

function distinctModels(candidates) {
  const selected = [];
  const keys = new Set();
  for (const uri of candidates) {
    const key = `${differentiation.providerOf(uri)}:${differentiation.familyOf(uri)}`;
    if (keys.has(key)) continue;
    keys.add(key);
    selected.push(uri);
    if (selected.length === 3) break;
  }
  return selected;
}

async function prepare(input) {
  const candidates = await configuredModels(input);
  const models = distinctModels(candidates);
  const diversity = differentiation.diversityReceipt(input.members, models);
  return {
    models,
    diversity,
    members: diversity.passes ? input.members.map((member, index) => ({ ...member, localModel: models[index] })) : input.members
  };
}

async function enforcePlan(input) {
  const trinity = input.autonomyPlan.trinity;
  if (!trinity.activated || trinity.variantSelection.experimentalDesign.diversityPolicy !== 'heterogeneous') return;
  const assignment = await prepare({
    db: input.db, agentId: input.agentId, organizationId: input.dispatchedAgent.organization_id,
    projectId: input.dispatchedAgent.project_id, mission: input.normalizedMission, members: trinity.members
  });
  trinity.variantSelection.diversity = assignment.diversity;
  if (!assignment.diversity.passes) {
    trinity.activated = false;
    trinity.reason = `Heterogeneous Trinity needs three sufficiently diverse model routes: ${assignment.diversity.minPairwiseDiversity}/${assignment.diversity.threshold}.`;
    emit(input.agentId, 'TRINITY_SKIPPED', 'DIVERSITY_GATE', trinity.reason, assignment.diversity, 'warning');
    return;
  }
  trinity.members = assignment.members;
}

module.exports = { configuredModels, distinctModels, prepare, enforcePlan };
