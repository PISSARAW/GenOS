const modelProvider = require('./modelProvider');
const localModelDiscovery = require('./localModelDiscovery');

function list(value) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function policyFrom(value = {}) {
  return {
    primary: String(value.primary || '').trim() || null,
    fallbacks: list(value.fallbacks),
    parallelReview: list(value.parallelReview),
    mode: value.mode === 'parallel' ? 'parallel' : 'fallback',
    preferLocal: value.preferLocal === true
  };
}

function envPolicy() {
  return policyFrom({
    primary: process.env.GENOS_DEFAULT_MODEL,
    fallbacks: String(process.env.GENOS_MODEL_FALLBACKS || '').split(','),
    parallelReview: String(process.env.GENOS_MODEL_PARALLEL_REVIEW || '').split(','),
    mode: process.env.GENOS_MODEL_ROUTING_MODE,
    preferLocal: process.env.GENOS_PREFER_LOCAL_MODELS === '1'
  });
}

function isLocal(uri) {
  return /^(ollama|lmstudio|vllm):\/\//.test(uri);
}

function unique(values) { return [...new Set(values.filter(Boolean))]; }

function candidateModels(explicitModel, policy) {
  const primary = String(explicitModel || policy.primary || '').trim();
  const ordered = [primary, ...policy.fallbacks, ...(policy.mode === 'parallel' ? policy.parallelReview : [])].filter(Boolean);
  const unique = [...new Set(ordered)];
  if (policy.preferLocal) unique.sort((left, right) => Number(isLocal(right)) - Number(isLocal(left)));
  return unique;
}

async function loadPolicy(db, { agentId, organizationId, projectId }) {
  if (!db || !agentId) return null;
  const scoped = organizationId && projectId;
  const query = scoped
    ? `SELECT policy_json FROM agent_model_routing_policies
       WHERE (agent_id = ? OR agent_id = '*') AND organization_id = ? AND project_id = ?
       ORDER BY CASE WHEN agent_id = ? THEN 0 ELSE 1 END LIMIT 1`
    : `SELECT policy_json FROM agent_model_routing_policies
       WHERE agent_id = ? OR agent_id = '*' ORDER BY CASE WHEN agent_id = ? THEN 0 ELSE 1 END LIMIT 1`;
  const params = scoped ? [agentId, organizationId, projectId, agentId] : [agentId, agentId];
  const row = await db.get(query, ...params);
  if (!row) return null;
  try { return policyFrom(JSON.parse(row.policy_json || '{}')); } catch (_) { return null; }
}

async function localRoutingPolicy(db, context, discovered = []) {
  const configured = await loadPolicy(db, context) || envPolicy();
  const configuredLocal = candidateModels(null, configured).filter(isLocal);
  const ordered = unique([...configuredLocal, ...discovered.filter(isLocal)]);
  return {
    primary: ordered[0] || null,
    fallbacks: ordered.slice(1),
    parallelReview: configured.mode === 'parallel' ? ordered.slice(1) : [],
    mode: configured.mode,
    preferLocal: true,
    configured: configuredLocal.length > 0
  };
}

async function generate({ db, agentId, organizationId, projectId, model, prompt, timeoutMs, maxTokens, onToken = () => {}, policy: suppliedPolicy }) {
  const policy = policyFrom(suppliedPolicy || await loadPolicy(db, { agentId, organizationId, projectId }) || envPolicy());
  const configuredCandidates = candidateModels(model, policy);
  const candidates = configuredCandidates.length ? configuredCandidates : await localModelDiscovery.discoverChatModelUris();
  if (!candidates.length) throw new Error('No model route is configured. Set an agent policy, GENOS_DEFAULT_MODEL, or an explicit model URI.');

  const attempt = async (uri) => {
    const configuration = modelProvider.modelConfiguration(uri);
    const registered = db ? await db.get('SELECT endpoint FROM provider_configs WHERE provider = ? AND model = ? AND enabled = 1', configuration.provider, configuration.modelName) : null;
    const result = await modelProvider.generate({
      model: uri,
      prompt,
      timeoutMs,
      maxTokens,
      endpoint: registered?.endpoint || undefined,
      onToken: (token) => onToken(token, uri)
    });
    return { ...result, model: uri };
  };

  if (policy.mode === 'parallel' && candidates.length > 1) {
    const settled = await Promise.allSettled(candidates.map(attempt));
    const successes = settled.map((result, index) => result.status === 'fulfilled' ? { ...result.value, index } : null).filter(Boolean);
    if (!successes.length) {
      const reasons = settled.map((result, index) => `${candidates[index]}: ${result.reason?.message || 'failed'}`).join('; ');
      throw new Error(`Every parallel model route failed. ${reasons}`);
    }
    const selected = successes.sort((left, right) => left.index - right.index)[0];
    return {
      ...selected,
      route: { mode: 'parallel', selectedModel: selected.model, attempts: settled.map((result, index) => ({ model: candidates[index], status: result.status, error: result.status === 'rejected' ? result.reason?.message : null })), reviews: successes.map(({ index, ...result }) => result) }
    };
  }

  const attempts = [];
  for (const uri of candidates) {
    try {
      const result = await attempt(uri);
      return { ...result, route: { mode: 'fallback', selectedModel: uri, attempts } };
    } catch (error) {
      attempts.push({ model: uri, status: 'failed', error: error.message });
    }
  }
  throw new Error(`Every model route failed. ${attempts.map((item) => `${item.model}: ${item.error}`).join('; ')}`);
}

module.exports = { generate, loadPolicy, localRoutingPolicy, policyFrom, candidateModels, isLocal };
