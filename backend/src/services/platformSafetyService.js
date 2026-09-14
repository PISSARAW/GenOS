const { normalizeCapabilities, capabilitiesSatisfy } = require('./modelCapabilities');

const DEFAULT_PROVIDERS = [
  { provider: 'openai', model: 'gpt-4o-mini', capabilities: ['reasoning', 'tools'], costInput: 0.15, costOutput: 0.60, latencyMs: 700 },
  { provider: 'anthropic', model: 'claude-3-5-sonnet', capabilities: ['reasoning', 'tools', 'long-context'], costInput: 3, costOutput: 15, latencyMs: 1100 },
  { provider: 'ollama', model: 'llama3.1:8b', capabilities: ['local', 'reasoning'], costInput: 0, costOutput: 0, latencyMs: 450 },
  { provider: 'vllm', model: 'genos-local', capabilities: ['local', 'replay'], costInput: 0, costOutput: 0, latencyMs: 120 }
];

function nullish(value, fallback) {
  return value === null || value === undefined ? fallback : value;
}

function nonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function normalizeProvider(p) {
  const costInput = Number(nullish(p.costInput, 0));
  const costOutput = Number(nullish(p.costOutput, 0));
  const latencyMs = Number(nullish(p.latencyMs, 0));
  return {
    ...p,
    capabilities: normalizeCapabilities(p.capabilities),
    costInput,
    costOutput,
    latencyMs,
    enabled: p.enabled !== false,
    valid: nonNegative(costInput) && nonNegative(costOutput) && nonNegative(latencyMs)
  };
}

function boundedRatio(value, fallback) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : fallback;
}

function invalidBudget(budget) {
  return !(Number.isFinite(budget) || budget === Infinity) || budget < 0;
}

function isInvalidCapability(capability) {
  return typeof capability !== 'string' || !capability.trim() || capability.trim().toLowerCase().startsWith('not:');
}

function invalidRequiredCapabilities(value) {
  return value !== undefined && (!Array.isArray(value) || value.some(isInvalidCapability));
}

function estimateCost(provider, inputTokens, outputTokens) {
  return (provider.costInput * inputTokens + provider.costOutput * outputTokens) / 1_000_000;
}

function requiredIsSatisfied(provider, required) { return capabilitiesSatisfy(provider.capabilities, [...required]); }

function isCandidate(provider, plan) {
  return provider.valid && provider.enabled && requiredIsSatisfied(provider, plan.required) && estimateCost(provider, plan.inputTokens, plan.outputTokens) <= plan.budget;
}

function qualityOf(provider, complexity) {
  const reasoning = provider.capabilities.includes('reasoning') ? 0.6 : 0.2;
  const longContext = provider.capabilities.includes('long-context') ? 0.2 : 0;
  return reasoning + longContext + complexity * 0.2;
}

function safetyOf(provider, uncertainty) {
  return uncertainty > 0.7 && provider.capabilities.includes('reasoning') ? 1 : 0.5;
}

function scoreProvider(provider, complexity, uncertainty) {
  const quality = qualityOf(provider, complexity);
  const safety = safetyOf(provider, uncertainty);
  const score = quality * (0.45 + complexity * 0.35) + safety * (0.25 + uncertainty * 0.2) - (provider.costInput + provider.costOutput) * 0.01 - provider.latencyMs / 100000;
  return { ...provider, score: Number(score.toFixed(4)) };
}

function routeModel(request = {}, providers = DEFAULT_PROVIDERS) {
  const complexity = boundedRatio(nullish(request.complexity, 0.5), 0.5);
  const uncertainty = boundedRatio(nullish(request.uncertainty, 0.2), 0.2);
  const budget = Number(nullish(request.maxCostUsd, Infinity));
  if (invalidBudget(budget)) return { decision: 'invalid-request', candidates: [], reason: 'maxCostUsd must be a non-negative number.' };
  if (invalidRequiredCapabilities(request.requiredCapabilities)) {
    return { decision: 'invalid-request', candidates: [], reason: 'requiredCapabilities must be an array of non-empty strings.' };
  }
  const required = new Set(nullish(request.requiredCapabilities, []).map((capability) => capability.trim()));
  const estimatedInputTokens = Number(nullish(request.estimatedInputTokens, 0));
  const estimatedOutputTokens = Number(nullish(request.estimatedOutputTokens, 0));
  if (!nonNegative(estimatedInputTokens) || !nonNegative(estimatedOutputTokens)) {
    return { decision: 'invalid-request', candidates: [], reason: 'estimated token counts must be finite non-negative numbers.' };
  }
  const plan = { required, inputTokens: estimatedInputTokens, outputTokens: estimatedOutputTokens, budget };
  const candidates = providers.map(normalizeProvider).filter((p) => isCandidate(p, plan));
  if (!candidates.length) return { decision: 'no-capable-model', candidates: [], reason: 'No enabled provider satisfies capabilities and budget.' };
  const scored = candidates.map((p) => scoreProvider(p, complexity, uncertainty)).sort((a, b) => b.score - a.score);
  const chosen = scored[0];
  return { decision: 'route', complexity, uncertainty, selected: chosen, candidates: scored, requiresApproval: uncertainty >= 0.8 || complexity >= 0.95 };
}

function toolPermissionAllowed(permissions, toolName) {
  return permissions.includes('*') || permissions.includes(toolName) || permissions.includes('tool:execute');
}

function toolPattern(word) {
  return new RegExp(`(^|[^a-z0-9])${word.replace(/\s+/g, '[\\s_-]+')}([^a-z0-9]|$)`, 'i');
}

function isDangerousTool(toolName) {
  const dangerousWords = ['delete', 'drop', 'shell', 'exec', 'write', 'send', 'deploy', 'kill', 'merge', 'restore', 'rollback', 'reset', 'apoptosis', 'cryptobiosis', 'quarantine', 'circuit breaker'];
  return dangerousWords.some((w) => toolPattern(w).test(toolName));
}

function toolDecision(allowed, denied, tainted) {
  if (!allowed) return { decision: 'deny', reason: 'agent_permission_missing' };
  if (denied) return { decision: 'deny', reason: 'tool_explicitly_denied' };
  if (tainted) return { decision: 'deny', reason: 'tainted_input_requires_review' };
  return { decision: 'allow', reason: 'policy_pass' };
}

function validateToolCall(toolCallContext) {
  const { agentId, toolName, args = {}, permissions = [], deniedTools = [], taints = [] } = toolCallContext;
  const normalized = String(toolName || '').trim();
  const allowed = toolPermissionAllowed(permissions, normalized);
  const denied = deniedTools.includes(normalized);
  const dangerous = isDangerousTool(normalized);
  const tainted = taints.length > 0;
  const outcome = toolDecision(allowed, denied, tainted);
  let decision = outcome.decision;
  let reason = outcome.reason;
  if (dangerous && decision === 'allow') { decision = 'approval_required'; reason = 'high_impact_tool'; }
  return { decision, reason, agentId, toolName: normalized, taints, argKeys: Object.keys(args || {}), dangerous };
}

function parseReplayEvent(event) {
  let payload = {};
  try { payload = JSON.parse(event.payload_json || '{}'); } catch (_) {}
  return { event, payload };
}

function incidentIdOf(event, payload) {
  return event.incident_id || event.incidentId || payload.incident_id || payload.incidentId;
}

function collectIncidentIds(parsedEvents) {
  const ids = [];
  parsedEvents.forEach((entry) => {
    const id = incidentIdOf(entry.event, entry.payload);
    if (id) ids.push(String(id));
  });
  return new Set(ids);
}

function isRelevantEvent(entry, targetId, explicitIds) {
  const { event, payload } = entry;
  if (!event.agent_id) return false;
  const eventIncidentId = incidentIdOf(event, payload);
  if (eventIncidentId) return String(eventIncidentId) === targetId;
  return explicitIds.size === 0 && (event.event_type || '').toLowerCase().includes('incident');
}

function selectRelevantEvents(parsedEvents, targetId, explicitIds) {
  const relevant = [];
  parsedEvents.forEach((entry) => {
    if (isRelevantEvent(entry, targetId, explicitIds)) relevant.push(entry.event);
  });
  return relevant;
}

function timelineEvent(event, index, total) {
  return { step: index + 1, eventId: event.id, timestamp: event.created_at, agentId: event.agent_id, action: event.action, eventType: event.event_type, detail: event.detail, severity: event.severity, status: index === total - 1 ? 'failure' : 'observed' };
}

function buildReplay(incidentId, events = [], stepSpeed = 100) {
  const targetId = String(incidentId || '').trim();
  const parsedEvents = events.map(parseReplayEvent);
  const explicitIncidentIds = collectIncidentIds(parsedEvents);
  const source = selectRelevantEvents(parsedEvents, targetId, explicitIncidentIds);
  return { incidentId, stepSpeed: Math.max(1, Number(stepSpeed) || 100), totalSteps: source.length, timeline: source.map((event, index) => timelineEvent(event, index, source.length)) };
}

function paretoFrontier(items = []) {
  const dominates = (a, b) => a.quality >= b.quality && a.security >= b.security && a.cost <= b.cost && a.latency <= b.latency && (a.quality > b.quality || a.security > b.security || a.cost < b.cost || a.latency < b.latency);
  const frontier = items.filter(a => !items.some(b => b !== a && dominates(b, a)));
  return { frontier, ranked: [...items].sort((a, b) => (b.quality + b.security) - (a.quality + a.security) || a.cost - b.cost), objectives: ['quality:max', 'security:max', 'cost:min', 'latency:min'] };
}

module.exports = { DEFAULT_PROVIDERS, normalizeProvider, routeModel, validateToolCall, buildReplay, paretoFrontier };
