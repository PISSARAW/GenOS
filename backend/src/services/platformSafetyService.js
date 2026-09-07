/** Platform & Safety primitives. Kept deterministic so they are safe to replay and test. */
const { normalizeCapabilities, capabilitiesSatisfy } = require('./modelCapabilities');

const DEFAULT_PROVIDERS = [
  { provider: 'openai', model: 'gpt-4o-mini', capabilities: ['reasoning', 'tools'], costInput: 0.15, costOutput: 0.60, latencyMs: 700 },
  { provider: 'anthropic', model: 'claude-3-5-sonnet', capabilities: ['reasoning', 'tools', 'long-context'], costInput: 3, costOutput: 15, latencyMs: 1100 },
  { provider: 'ollama', model: 'llama3.1:8b', capabilities: ['local', 'reasoning'], costInput: 0, costOutput: 0, latencyMs: 450 },
  { provider: 'vllm', model: 'genos-local', capabilities: ['local', 'replay'], costInput: 0, costOutput: 0, latencyMs: 120 }
];

function normalizeProvider(p) {
  const costInput = Number(p.costInput ?? 0);
  const costOutput = Number(p.costOutput ?? 0);
  const latencyMs = Number(p.latencyMs ?? 0);
  return {
    ...p,
    capabilities: normalizeCapabilities(p.capabilities),
    costInput,
    costOutput,
    latencyMs,
    enabled: p.enabled !== false,
    valid: Number.isFinite(costInput) && costInput >= 0 && Number.isFinite(costOutput) && costOutput >= 0 && Number.isFinite(latencyMs) && latencyMs >= 0
  };
}

function routeModel(request = {}, providers = DEFAULT_PROVIDERS) {
  const bounded = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : fallback;
  const complexity = bounded(request.complexity ?? 0.5, 0.5);
  const uncertainty = bounded(request.uncertainty ?? 0.2, 0.2);
  const budget = request.maxCostUsd == null ? Infinity : Number(request.maxCostUsd);
  if (!Number.isFinite(budget) && budget !== Infinity || budget < 0) return { decision: 'invalid-request', candidates: [], reason: 'maxCostUsd must be a non-negative number.' };
  if (request.requiredCapabilities !== undefined && (!Array.isArray(request.requiredCapabilities) || request.requiredCapabilities.some((capability) => typeof capability !== 'string' || !capability.trim()))) {
    return { decision: 'invalid-request', candidates: [], reason: 'requiredCapabilities must be an array of non-empty strings.' };
  }
  const required = new Set((request.requiredCapabilities || []).map((capability) => capability.trim()));
  const estimatedInputTokens = Number(request.estimatedInputTokens ?? 0);
  const estimatedOutputTokens = Number(request.estimatedOutputTokens ?? 0);
  if (!Number.isFinite(estimatedInputTokens) || estimatedInputTokens < 0 || !Number.isFinite(estimatedOutputTokens) || estimatedOutputTokens < 0) {
    return { decision: 'invalid-request', candidates: [], reason: 'estimated token counts must be finite non-negative numbers.' };
  }
  const estimatedCost = (provider) => (provider.costInput * estimatedInputTokens + provider.costOutput * estimatedOutputTokens) / 1_000_000;
  const candidates = providers.map(normalizeProvider).filter(p => p.valid && p.enabled && requiredIsSatisfied(p, required) && estimatedCost(p) <= budget);
  if (!candidates.length) return { decision: 'no-capable-model', candidates: [], reason: 'No enabled provider satisfies capabilities and budget.' };
  const scored = candidates.map(p => {
    const quality = (p.capabilities.includes('reasoning') ? 0.6 : 0.2) + (p.capabilities.includes('long-context') ? 0.2 : 0) + complexity * 0.2;
    const safety = uncertainty > 0.7 && p.capabilities.includes('reasoning') ? 1 : 0.5;
    const score = quality * (0.45 + complexity * 0.35) + safety * (0.25 + uncertainty * 0.2) - (p.costInput + p.costOutput) * 0.01 - p.latencyMs / 100000;
    return { ...p, score: Number(score.toFixed(4)) };
  }).sort((a, b) => b.score - a.score);
  const chosen = scored[0];
  return { decision: 'route', complexity, uncertainty, selected: chosen, candidates: scored, requiresApproval: uncertainty >= 0.8 || complexity >= 0.95 };
}

function requiredIsSatisfied(provider, required) { return capabilitiesSatisfy(provider.capabilities, [...required]); }

function validateToolCall({ agentId, toolName, args = {}, permissions = [], deniedTools = [], taints = [] }) {
  const normalized = String(toolName || '').trim();
  const allowed = permissions.includes('*') || permissions.includes(normalized) || permissions.includes('tool:execute');
  const denied = deniedTools.includes(normalized);
  const dangerous = /delete|drop|shell|exec|write|send|deploy|kill|merge|restore|rollback|reset|apoptosis|cryptobiosis|quarantine|circuit.?breaker/i.test(normalized);
  const tainted = taints.length > 0;
  let decision = allowed && !denied && !tainted ? 'allow' : 'deny';
  let reason = !allowed ? 'agent_permission_missing' : denied ? 'tool_explicitly_denied' : tainted ? 'tainted_input_requires_review' : 'policy_pass';
  if (dangerous && decision === 'allow') { decision = 'approval_required'; reason = 'high_impact_tool'; }
  return { decision, reason, agentId, toolName: normalized, taints, argKeys: Object.keys(args || {}), dangerous };
}

function buildReplay(incidentId, events = [], stepSpeed = 100) {
  const targetId = String(incidentId || '').trim();
  const parsedEvents = events.map((event) => {
    let payload = {};
    try { payload = JSON.parse(event.payload_json || '{}'); } catch (_) {}
    return { event, payload };
  });
  const explicitIncidentIds = new Set(parsedEvents
    .map(({ event, payload }) => event.incident_id || event.incidentId || payload.incident_id || payload.incidentId)
    .filter(Boolean)
    .map(String));
  const relevant = parsedEvents
    .filter(({ event, payload }) => {
      if (!event.agent_id) return false;
      const eventIncidentId = event.incident_id || event.incidentId || payload.incident_id || payload.incidentId;
      if (eventIncidentId) return String(eventIncidentId) === targetId;
      return explicitIncidentIds.size === 0 && (event.event_type || '').toLowerCase().includes('incident');
    })
    .map(({ event }) => event);
  const source = relevant;
  return { incidentId, stepSpeed: Math.max(1, Number(stepSpeed) || 100), totalSteps: source.length, timeline: source.map((e, index) => ({ step: index + 1, eventId: e.id, timestamp: e.created_at, agentId: e.agent_id, action: e.action, eventType: e.event_type, detail: e.detail, severity: e.severity, status: index === source.length - 1 ? 'failure' : 'observed' })) };
}

function paretoFrontier(items = []) {
  const dominates = (a, b) => a.quality >= b.quality && a.security >= b.security && a.cost <= b.cost && a.latency <= b.latency && (a.quality > b.quality || a.security > b.security || a.cost < b.cost || a.latency < b.latency);
  const frontier = items.filter(a => !items.some(b => b !== a && dominates(b, a)));
  return { frontier, ranked: [...items].sort((a, b) => (b.quality + b.security) - (a.quality + a.security) || a.cost - b.cost), objectives: ['quality:max', 'security:max', 'cost:min', 'latency:min'] };
}

module.exports = { DEFAULT_PROVIDERS, normalizeProvider, routeModel, validateToolCall, buildReplay, paretoFrontier };
