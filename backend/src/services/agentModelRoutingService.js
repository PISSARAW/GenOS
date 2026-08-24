/**
 * Local/frontier model routing helpers for agent missions: competency floors,
 * ranking, and the local-worker route decision.
 */
const os = require('os');
const modelRouter = require('./modelRouter');
const localModelDiscovery = require('./localModelDiscovery');

function modelUsage(result = {}) {
  const inputTokens = Number(result.inputTokens || 0);
  const outputTokens = Number(result.outputTokens || 0);
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

async function consultLocalModels(db, agentId, mission, plan, tenant = {}) {
  const discovered = (await localModelDiscovery.discoverLocalModels()).filter((model) => model.chatCapable);
  const capable = competentLocalModels(discovered, { role: 'orchestration_planner', modelTier: 'frontier', purpose: 'planning' });
  const candidates = capable.map((model) => model.uri);
  if (!candidates.length) return {
    consulted: false,
    candidates: discovered.map((model) => model.uri),
    error: discovered.length ? 'Discovered local models did not meet the planning competency floor.' : undefined
  };
  try {
    const policy = await modelRouter.localRoutingPolicy(db, { agentId, ...tenant }, candidates);
    const result = await modelRouter.generate({
      db, agentId, ...tenant, timeoutMs: 15000, policy,
      priority: 'interactive',
      prompt: `You are the local planning model for a GenOS orchestrator. Analyse this mission and return a concise JSON-like recommendation: which hypotheses merit forks, which worker roles are needed, when replay/merge is justified, and what can be delegated locally. Mission: ${mission.prompt || mission.currentTask || ''}. Strategy profile: ${JSON.stringify(plan.profile)}.`
    });
    return { consulted: true, candidates, selectedModel: result.model, provider: result.provider, usage: modelUsage(result), advice: String(result.text || '').slice(0, 4000), route: result.route, policy };
  } catch (error) {
    return { consulted: false, candidates, error: error.message };
  }
}

function modelScale(model) {
  const billions = String(model.model || '').match(/(?:^|[-_:])(\d+(?:\.\d+)?)b(?:$|[-_:])/i);
  if (billions) return Number(billions[1]) * 1_000_000_000;
  return Number(model.size || 0);
}

function localCompetencyFloor({ role, modelTier, purpose } = {}) {
  const configured = Number(process.env.GENOS_MIN_LOCAL_MODEL_PARAMETERS);
  if (Number.isFinite(configured) && configured > 0) return configured;
  if (purpose === 'planning' || /frontier|pro/i.test(modelTier || '')) return 20_000_000_000;
  if (/implementation|coder|developer|author|literary|dramaturg|creative/i.test(role || '')) return 14_000_000_000;
  return 7_000_000_000;
}

function competentLocalModels(models, context = {}) {
  if (process.env.GENOS_DISABLE_LOCAL_MODELS === '1') return [];
  const floor = localCompetencyFloor(context);
  return models.filter((model) => model.chatCapable && modelScale(model) >= floor);
}

function rankLocalModels(models, modelTier) {
  const tier = String(modelTier || '').toLowerCase();
  if (!/(flash|pro|frontier)/.test(tier)) return models;
  const direction = /pro|frontier/.test(tier) ? -1 : 1;
  return [...models].sort((left, right) => direction * (modelScale(left) - modelScale(right)));
}

async function localWorkerRoute(db, agentId, role, modelTier, tenant = {}) {
  const cpuCount = os.cpus().length;
  const load = os.loadavg()[0];
  const freeMemoryRatio = os.freemem() / os.totalmem();
  const models = await localModelDiscovery.discoverLocalModels();
  const localCodeEnabled = process.env.GENOS_ALLOW_LOCAL_CODE_WORKERS === '1';
  const reviewRole = /reviewer|observer|red_team|blue_team/i.test(role || '');
  const implementationRole = /implementation|coder|developer/i.test(role || '');
  const eligible = (reviewRole || (localCodeEnabled && implementationRole)) && cpuCount >= 4 && load < cpuCount * 0.8 && freeMemoryRatio >= 0.15;
  const chatModels = competentLocalModels(models, { role, modelTier, purpose: 'worker' });
  const policy = await modelRouter.localRoutingPolicy(db, { agentId, ...tenant }, chatModels.map((model) => model.uri));
  const orderedUris = policy.configured
    ? modelRouter.candidateModels(null, policy)
    : rankLocalModels(chatModels, modelTier).map((model) => model.uri);
  const selected = eligible ? orderedUris[0] : null;
  return {
    selectedModel: selected || null,
    policy: { ...policy, primary: selected || policy.primary, fallbacks: orderedUris.filter((uri) => uri !== selected) },
    criteria: {
      cpuCount, load1m: load, freeMemoryRatio: Number(freeMemoryRatio.toFixed(3)), role, modelTier,
      eligible, competencyFloorParameters: localCompetencyFloor({ role, modelTier, purpose: 'worker' }),
      localModelsDisabled: process.env.GENOS_DISABLE_LOCAL_MODELS === '1',
      discoveredModels: models.map((model) => model.uri), capableModels: chatModels.map((model) => model.uri), orderedModels: orderedUris
    }
  };
}

module.exports = { modelUsage, consultLocalModels, modelScale, localCompetencyFloor, competentLocalModels, rankLocalModels, localWorkerRoute };
