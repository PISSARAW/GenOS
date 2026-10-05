const localModelDiscovery = require('./localModelDiscovery');
const routingPolicy = require('./modelRoutingPolicy');
const routeRunner = require('./modelRouteRunner');
const cognitiveOmega = require('./cognitiveOmegaCompiler');
const domainGraph = require('./cognitiveOmegaDomainGraphService');
const projectionProfiler = require('./cognitiveProjectionProfilerService');
const cognitiveEconomy = require('./cognitiveEconomyControllerService');

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
  return routingPolicy.isLocalUri(uri);
}

function unique(values) { return [...new Set(values.filter(Boolean))]; }

function responseScore(result) {
  return routingPolicy.responseScore(result);
}

const parseSize = routingPolicy.parseSize;

function candidateModels(explicitModel, policy) {
  const primary = String(explicitModel || policy.primary || '').trim();
  const rest = [...policy.fallbacks, ...(policy.mode === 'parallel' ? policy.parallelReview : [])].filter(Boolean);
  const uniqueRest = [...new Set(rest)].filter((candidate) => candidate !== primary);
  if (policy.preferLocal) uniqueRest.sort((left, right) => Number(routingPolicy.isLocalUri(right)) - Number(routingPolicy.isLocalUri(left)));
  return [primary, ...uniqueRest].filter(Boolean);
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

async function loadProviderCandidates(db) {
  if (!db || typeof db.all !== 'function') return [];
  const rows = await db.all('SELECT provider, model FROM provider_configs WHERE enabled = 1 ORDER BY provider, model');
  return rows
    .map((row) => `${String(row.provider || '').trim()}://${String(row.model || '').trim()}`)
    .filter((uri) => /^(openai|anthropic|gemini|mistral|groq|deepseek|together|openrouter|ollama|lmstudio|vllm|openai-compatible):\/\/[^/].+/.test(uri));
}

async function localRoutingPolicy(db, context, discovered = []) {
  const configured = await loadPolicy(db, context) || envPolicy();
  const configuredLocal = candidateModels(null, configured).filter(routingPolicy.isLocalUri);
  const ordered = unique([...configuredLocal, ...discovered.filter(routingPolicy.isLocalUri)]);
  return {
    primary: ordered[0] || null,
    fallbacks: ordered.slice(1),
    parallelReview: configured.mode === 'parallel' ? ordered.slice(1) : [],
    mode: configured.mode,
    preferLocal: true,
    configured: configuredLocal.length > 0
  };
}

function defaultOnToken() {}

function buildRouteContext(opts, clock, remainingMs) {
  return {
    db: opts.db,
    endpoint: opts.endpoint,
    prompt: opts.prompt,
    maxTokens: opts.maxTokens,
    maxCostUsd: opts.maxCostUsd,
    responseFormat: opts.responseFormat,
    spent: 0,
    priority: opts.priority || 'bulk',
    agentId: opts.agentId,
    organizationId: opts.organizationId,
    projectId: opts.projectId,
    seed: opts.seed,
    stream: opts.stream !== false,
    enforceSchema: opts.enforceSchema,
    responseFormat: opts.responseFormat,
    signal: opts.signal,
    displayWidth: opts.displayWidth || 1920,
    displayHeight: opts.displayHeight || 1080,
    requiredCapabilities: opts.requiredCapabilities || [],
    onToken: opts.onToken || defaultOnToken,
    remainingMs,
    cognitiveContract: opts.cognitiveContract
  };
}

async function cognitiveRequest(options) {
  if (options.cognitiveContract) return options.cognitiveContract;
  const program = options.cognitiveProgram || (options.cognitiveDomain
    ? domainGraph.build({ domain: options.cognitiveDomain, operation: options.cognitiveOperation,
      objects: options.cognitiveObjects, output: options.cognitiveOutput,
      verification: options.cognitiveVerification }).operations : null);
  const selection = options.db && options.model
    ? await projectionProfiler.select(options.db, { model: options.model,
      task: options.cognitiveDomain || 'runtime' }) : null;
  const economy = cognitiveEconomy.plan({ integration: options.cognitiveIntegration || options.cognitiveDomain,
    topology: options.cognitiveTopology, level: options.cognitiveLevel,
    risk: options.cognitiveRisk, uncertainty: options.cognitiveUncertainty,
    irreversible: options.cognitiveIrreversible, highStakes: options.cognitiveHighStakes,
    tokens: options.maxTokens, latencyMs: options.timeoutMs, candidates: options.cognitiveCandidates });
  return cognitiveOmega.compilePrompt({ prompt: options.prompt, operation: options.cognitiveOperation,
    source: options.cognitiveSource, domain: options.cognitiveDomain, program,
    model: options.model, representation: selection?.representation,
    projectionSelection: selection,
    projectionProfile: selection?.profile ? { model: options.model,
      representations: [selection.representation] } : null, economy });
}

function withCognitiveResult(result, contract) {
  return { ...result, cognitive: contract };
}

function missingRouteError(policy, configured) {
  if (policy.preferLocal || configured[0] === 'auto') return Object.assign(new Error('No local chat-capable model is available for the requested route.'), { code: 'LOCAL_MODEL_REQUIRED' });
  return Object.assign(new Error('No model route is configured. Set an agent policy, GENOS_DEFAULT_MODEL, or an explicit model URI.'), { code: 'MODEL_ROUTE_REQUIRED' });
}

function discoveredUris(discovered, selected) {
  return discovered.filter((model) => model.uri !== selected.uri).map((model) => model.uri);
}

async function finishCandidates(opts, policy, configured) {
  if (configured.length && configured[0] !== 'auto') return configured;
  const discovered = await localModelDiscovery.discoverLocalModels();
  const chatModels = discovered.filter((model) => model.chatCapable);
  if (!chatModels.length) throw missingRouteError(policy, configured);
  const selected = routingPolicy.pickAutoCandidate(chatModels, opts.complexity, opts.variantIndex);
  return [selected.uri, ...discoveredUris(discovered, selected)];
}

async function resolveCandidates(opts, policy) {
  let configured = candidateModels(opts.model, policy);
  if (!configured.length) configured = await loadProviderCandidates(opts.db);
  return finishCandidates(opts, policy, configured);
}

async function resolvePolicy(opts) {
  return policyFrom(opts.policy || await loadPolicy(opts.db, { agentId: opts.agentId, organizationId: opts.organizationId, projectId: opts.projectId }) || envPolicy());
}

async function generate(options) {
  const opts = options || {};
  const startedAt = Date.now();
  const cognitiveContract = await cognitiveRequest(opts);
  if (cognitiveContract.status !== 'ready') {
    throw Object.assign(new Error(`Cognitive compilation blocked: ${cognitiveContract.reason}`),
      { code: 'COGNITIVE_COMPILATION_BLOCKED', reason: cognitiveContract.reason });
  }
  const routedOptions = { ...opts, prompt: cognitiveContract.prompt || opts.prompt, cognitiveContract };
  const clock = routingPolicy.computeDeadline(routedOptions);
  const remainingMs = () => Math.min(clock.timeout, clock.deadline - Date.now());
  if (remainingMs() <= 0) throw new Error('Model routing deadline exhausted before attempting a provider.');
  const policy = await resolvePolicy(routedOptions);
  const candidates = await resolveCandidates(routedOptions, policy);
  routingPolicy.assertStrictPreferLocal(policy, candidates, routedOptions);
  const context = buildRouteContext(routedOptions, clock, remainingMs);
  const result = policy.mode === 'parallel' && candidates.length > 1
    ? await routeRunner.runParallel(candidates, context)
    : await routeRunner.runFallback(candidates, context);
  if (opts.db && opts.model) {
    await projectionProfiler.record(opts.db, { model: result.model || opts.model,
      task: opts.cognitiveDomain || 'runtime', representation: cognitiveContract.representation,
      prompt: cognitiveContract.prompt, latencyMs: Date.now() - startedAt,
      costUsd: result.costUsd, quality: opts.cognitiveQuality,
      evidenceDigest: opts.cognitiveEvidenceDigest });
  }
  if (opts.db) {
    try {
      await cognitiveEconomy.record(opts.db, { integration: opts.cognitiveIntegration || opts.cognitiveDomain,
        topology: cognitiveContract.economy?.topology, level: cognitiveContract.economy?.level,
        risk: opts.cognitiveRisk, tokens: result.usage?.total_tokens || result.usage?.totalTokens || result.tokens,
        latencyMs: Date.now() - startedAt, costUsd: result.costUsd, quality: opts.cognitiveQuality });
    } catch (_) { /* Economy telemetry cannot turn a valid model result into a route failure. */ }
  }
  return withCognitiveResult(result, cognitiveContract);
}

module.exports = { generate, loadPolicy, loadProviderCandidates, localRoutingPolicy, policyFrom, candidateModels, isLocal, responseScore, parseSize };
