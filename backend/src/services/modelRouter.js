const modelProvider = require('./modelProvider');
const localModelDiscovery = require('./localModelDiscovery');
const crypto = require('crypto');

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
  return /^(ollama|lmstudio|vllm|openai-compatible):\/\//.test(uri);
}

function unique(values) { return [...new Set(values.filter(Boolean))]; }

function estimateCostUsd(costInput, costOutput, inputTokens, outputTokens) {
  return Number(((Number(costInput || 0) * inputTokens + Number(costOutput || 0) * outputTokens) / 1_000_000).toFixed(8));
}

async function runWithDeadline(operation, timeoutMs, model) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error(`Model route '${model}' exceeded its remaining deadline.`), { code: 'MODEL_ROUTE_DEADLINE_EXCEEDED' })), Math.max(1, timeoutMs));
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function recordModelUsage(db, scope, result) {
  if (!db || typeof db.run !== 'function' || !scope.organizationId || !scope.projectId) return;
  await db.run(
    'INSERT INTO usage_ledger(id, organization_id, project_id, release_id, category, quantity, cost_usd, metadata_json) VALUES(?,?,?,?,?,?,?,?)',
    `usage-model-${crypto.randomUUID()}`,
    scope.organizationId,
    scope.projectId,
    null,
    'model_inference',
    result.inputTokens + result.outputTokens,
    result.costUsd,
    JSON.stringify({ model: result.model, provider: result.provider, inputTokens: result.inputTokens, outputTokens: result.outputTokens, latencyMs: result.latencyMs })
  );
}

async function emitBufferedTokens(tokens, onToken, model) {
  for (const token of tokens) await onToken(token, model);
}

function responseScore(result) {
  for (const key of ['score', 'qualityScore', 'confidence']) {
    const value = Number(result?.[key]);
    if (Number.isFinite(value)) return value;
  }
  try {
    const parsed = JSON.parse(String(result?.text || '').match(/\{[\s\S]*\}/)?.[0] || '');
    for (const key of ['score', 'qualityScore', 'confidence']) {
      const value = Number(parsed?.[key]);
      if (Number.isFinite(value)) return value;
    }
  } catch (_) {}
  return null;
}

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

function parseSize(name) {
  const match = String(name).match(/(\d+(?:\.\d+)?)\s*(k|m|b)/i);
  if (!match) return null;
  const value = Number(match[1]);
  const multiplier = { k: 1e3, m: 1e6, b: 1e9 }[match[2].toLowerCase()];
  return value * multiplier;
}

async function generate({ db, agentId, organizationId, projectId, model, prompt, timeoutMs, deadlineMs, deadlineAt, maxTokens, maxCostUsd, seed, onToken = () => {}, policy: suppliedPolicy, priority = 'bulk', complexity = 'medium', variantIndex = undefined }) {
  const timeout = Number.isFinite(Number(timeoutMs)) ? Math.max(1, Number(timeoutMs)) : 30000;
  const deadline = deadlineAt != null
    ? Number(deadlineAt)
    : Date.now() + Math.max(1, Number.isFinite(Number(deadlineMs)) ? Number(deadlineMs) : timeout);
  const remainingTimeout = () => deadline == null ? timeout : Math.min(timeout, deadline - Date.now());
  if (remainingTimeout() <= 0) throw new Error('Model routing deadline exhausted before attempting a provider.');
  const policy = policyFrom(suppliedPolicy || await loadPolicy(db, { agentId, organizationId, projectId }) || envPolicy());
  const configuredCandidates = candidateModels(model, policy);
  
  let candidates = configuredCandidates;
  if (!candidates.length || candidates[0] === 'auto') {
    const rawModels = await localModelDiscovery.discoverLocalModels();
    const chatModels = rawModels.filter((m) => m.chatCapable);
    if (chatModels.length > 0) {
      const sorted = [...chatModels].sort((a, b) => {
        const leftSize = Number(a.size) || parseSize(a.model);
        const rightSize = Number(b.size) || parseSize(b.model);
        if (leftSize === null) return rightSize === null ? 0 : 1;
        if (rightSize === null) return -1;
        return leftSize - rightSize;
      });
      let selectedModel;
      if (variantIndex !== undefined) {
         // MUE COGNITIVE (Polymorphisme) : Rotation à travers les modèles disponibles
         selectedModel = sorted[variantIndex % sorted.length];
      } else if (complexity === 'low') {
         selectedModel = sorted[0];
      } else if (complexity === 'high') {
         selectedModel = sorted[sorted.length - 1];
      } else {
         selectedModel = sorted[Math.floor(sorted.length / 2)];
      }
      
      const others = sorted.filter(m => m.uri !== selectedModel.uri).map(m => m.uri);
      candidates = [selectedModel.uri, ...others];
    } else {
      const fallbackList = configuredCandidates.filter(c => c !== 'auto');
      const fallbackDefault = process.env.GENOS_DEFAULT_MODEL || 'openai://gpt-4o-mini';
      candidates = fallbackList.length > 0 ? fallbackList : [fallbackDefault];
    }
  }
  
  if (!candidates.length) throw new Error('No model route is configured. Set an agent policy, GENOS_DEFAULT_MODEL, or an explicit model URI.');

  const attempt = async (uri) => {
    const configuration = modelProvider.modelConfiguration(uri);
    const registered = db ? await db.get('SELECT endpoint, cost_input, cost_output, latency_ms FROM provider_configs WHERE provider = ? AND model = ? AND enabled = 1', configuration.provider, configuration.modelName) : null;
    if (isLocal(uri)) {
      const discovered = await localModelDiscovery.discoverLocalModels();
      if (!registered?.endpoint && discovered.length && !discovered.some((candidate) => candidate.uri === uri && candidate.chatCapable)) {
        // If not found in cached discovery, try a force refresh before failing
        const refreshed = await localModelDiscovery.discoverLocalModels({ force: true });
        if (!refreshed.length && !registered?.endpoint) throw new Error(`Local model '${uri}' could not be verified by discovery.`);
        if (refreshed.length && !refreshed.some((candidate) => candidate.uri === uri && candidate.chatCapable)) {
          throw new Error(`Local model '${uri}' is not present in the current chat-capable discovery set.`);
        }
      }
    }
    const discoveredEndpoint = localModelDiscovery.endpointForModel(uri);
    const attemptTimeout = remainingTimeout();
    if (attemptTimeout <= 0) throw new Error('Model routing deadline exhausted before attempting provider ' + uri + '.');
    const estimatedInputTokens = modelProvider.tokenize(typeof prompt === 'string' ? prompt : JSON.stringify(prompt)).length;
    const estimatedOutputTokens = Number.isFinite(Number(maxTokens)) && Number(maxTokens) > 0 ? Math.floor(Number(maxTokens)) : 2048;
    const estimatedCost = estimateCostUsd(registered?.cost_input, registered?.cost_output, estimatedInputTokens, estimatedOutputTokens);
    if (maxCostUsd != null && estimatedCost > Number(maxCostUsd)) {
      throw Object.assign(new Error(`Estimated model cost ${estimatedCost} exceeds budget ${maxCostUsd}.`), { code: 'MODEL_COST_BUDGET_EXCEEDED' });
    }
    const bufferedTokens = [];
    const startedAt = Date.now();
    const result = await runWithDeadline(modelProvider.generate({
      model: uri,
      prompt,
      timeoutMs: attemptTimeout,
      maxTokens,
      endpoint: discoveredEndpoint || registered?.endpoint || undefined,
      priority,
      agentId,
      organizationId,
      projectId,
      seed,
      onToken: (token) => { bufferedTokens.push(token); }
    }), attemptTimeout, uri);
    const latencyMs = Date.now() - startedAt;
    const costUsd = estimateCostUsd(registered?.cost_input, registered?.cost_output, result.inputTokens, result.outputTokens);
    const enriched = { ...result, model: uri, latencyMs, costUsd, bufferedTokens };
    await recordModelUsage(db, { organizationId, projectId }, enriched);
    return enriched;
  };

  if (policy.mode === 'parallel' && candidates.length > 1) {
    if (maxCostUsd == null || !Number.isFinite(Number(maxCostUsd)) || Number(maxCostUsd) < 0) {
      throw Object.assign(new Error('Parallel model review requires an explicit non-negative maxCostUsd budget.'), { code: 'MODEL_PARALLEL_BUDGET_REQUIRED' });
    }
    const settled = await Promise.allSettled(candidates.map(attempt));
    const successes = settled.map((result, index) => result.status === 'fulfilled' ? { ...result.value, index } : null).filter(Boolean);
    if (!successes.length) {
      const reasons = settled.map((result, index) => `${candidates[index]}: ${result.reason?.message || 'failed'}`).join('; ');
      throw new Error(`Every parallel model route failed. ${reasons}`);
    }
    const scored = successes.filter((result) => responseScore(result) !== null);
    const selected = scored.length
      ? [...scored].sort((left, right) => responseScore(right) - responseScore(left) || left.index - right.index)[0]
      : successes.sort((left, right) => left.index - right.index)[0];
    await emitBufferedTokens(selected.bufferedTokens || [], onToken, selected.model);
    const { bufferedTokens: _bufferedTokens, ...selectedResult } = selected;
    return {
      ...selectedResult,
      route: { mode: 'parallel', selectedModel: selected.model, selectionScore: responseScore(selected), attempts: settled.map((result, index) => ({ model: candidates[index], status: result.status, error: result.status === 'rejected' ? result.reason?.message : null })), reviews: successes.map(({ index, bufferedTokens: _tokens, ...result }) => result) }
    };
  }

  const attempts = [];
  let discoveryRefreshed = false;
  for (const uri of candidates) {
    try {
      const result = await attempt(uri);
      await emitBufferedTokens(result.bufferedTokens || [], onToken, uri);
      const { bufferedTokens: _bufferedTokens, ...cleanResult } = result;
      return { ...cleanResult, route: { mode: 'fallback', selectedModel: uri, attempts } };
    } catch (error) {
      attempts.push({ model: uri, status: 'failed', error: error.message });
      if (isLocal(uri) && !discoveryRefreshed) {
        discoveryRefreshed = true;
        await localModelDiscovery.discoverLocalModels({ force: true });
      }
    }
  }
  throw new Error(`Every model route failed. ${attempts.map((item) => `${item.model}: ${item.error}`).join('; ')}`);
}

module.exports = { generate, loadPolicy, localRoutingPolicy, policyFrom, candidateModels, isLocal, responseScore, parseSize };
