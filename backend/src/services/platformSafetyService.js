/** Platform & Safety primitives. Kept deterministic so they are safe to replay and test. */

const DEFAULT_PROVIDERS = [
  { provider: 'openai', model: 'gpt-4o-mini', capabilities: ['reasoning', 'tools'], costInput: 0.15, costOutput: 0.60, latencyMs: 700 },
  { provider: 'anthropic', model: 'claude-3-5-sonnet', capabilities: ['reasoning', 'tools', 'long-context'], costInput: 3, costOutput: 15, latencyMs: 1100 },
  { provider: 'ollama', model: 'llama3.1:8b', capabilities: ['local', 'reasoning'], costInput: 0, costOutput: 0, latencyMs: 450 },
  { provider: 'local', model: 'genos-local', capabilities: ['local', 'replay'], costInput: 0, costOutput: 0, latencyMs: 120 }
];

function normalizeProvider(p) {
  return { ...p, costInput: Number(p.costInput || 0), costOutput: Number(p.costOutput || 0), latencyMs: Number(p.latencyMs || 0), enabled: p.enabled !== false };
}

function routeModel(request = {}, providers = DEFAULT_PROVIDERS) {
  const complexity = Math.max(0, Math.min(1, Number(request.complexity ?? 0.5)));
  const uncertainty = Math.max(0, Math.min(1, Number(request.uncertainty ?? 0.2)));
  const budget = request.maxCostUsd == null ? Infinity : Number(request.maxCostUsd);
  const required = new Set(request.requiredCapabilities || []);
  const candidates = providers.map(normalizeProvider).filter(p => p.enabled && requiredIsSatisfied(p, required) && (p.costInput + p.costOutput) <= budget);
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

function requiredIsSatisfied(provider, required) { return [...required].every(cap => provider.capabilities.includes(cap)); }

function validateToolCall({ agentId, toolName, args = {}, permissions = [], deniedTools = [], taints = [] }) {
  const normalized = String(toolName || '').trim();
  const allowed = permissions.includes('*') || permissions.includes(normalized) || permissions.includes('tool:execute');
  const denied = deniedTools.includes(normalized);
  const dangerous = /delete|drop|shell|exec|write|send|deploy|kill/i.test(normalized);
  const tainted = taints.length > 0;
  let decision = allowed && !denied && !tainted ? 'allow' : 'deny';
  let reason = !allowed ? 'agent_permission_missing' : denied ? 'tool_explicitly_denied' : tainted ? 'tainted_input_requires_review' : 'policy_pass';
  if (dangerous && decision === 'allow') { decision = 'approval_required'; reason = 'high_impact_tool'; }
  return { decision, reason, agentId, toolName: normalized, taints, argKeys: Object.keys(args || {}), dangerous };
}

function buildReplay(incidentId, events = [], stepSpeed = 100) {
  const relevant = events.filter(e => Boolean(e.agent_id) && ((e.event_type || '').toLowerCase().includes('incident') || String(e.payload_json || '').includes(incidentId)));
  const source = relevant.length ? relevant : events.slice(0, 20);
  return { incidentId, stepSpeed: Math.max(1, Number(stepSpeed) || 100), totalSteps: source.length, timeline: source.map((e, index) => ({ step: index + 1, eventId: e.id, timestamp: e.created_at, agentId: e.agent_id, action: e.action, eventType: e.event_type, detail: e.detail, severity: e.severity, status: index === source.length - 1 ? 'failure' : 'observed' })) };
}

function paretoFrontier(items = []) {
  const dominates = (a, b) => a.quality >= b.quality && a.security >= b.security && a.cost <= b.cost && a.latency <= b.latency && (a.quality > b.quality || a.security > b.security || a.cost < b.cost || a.latency < b.latency);
  const frontier = items.filter(a => !items.some(b => b !== a && dominates(b, a)));
  return { frontier, ranked: [...items].sort((a, b) => (b.quality + b.security) - (a.quality + a.security) || a.cost - b.cost), objectives: ['quality:max', 'security:max', 'cost:min', 'latency:min'] };
}

module.exports = { DEFAULT_PROVIDERS, normalizeProvider, routeModel, validateToolCall, buildReplay, paretoFrontier };
