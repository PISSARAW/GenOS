const crypto = require('crypto');
const { canonicalize } = require('./evaluationGraders');

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value ?? null)) || '').digest('hex');
}

function parse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

const METRIC_DEFINITIONS = Object.freeze({
  accuracy: { higherIsBetter: true },
  success_rate: { higherIsBetter: true },
  pass_rate: { higherIsBetter: true },
  brier: { higherIsBetter: false },
  brier_score: { higherIsBetter: false },
  error_rate: { higherIsBetter: false }
});

function metricNumericValues(values) {
  if (!Array.isArray(values)) return [];
  return values.map(Number).filter(Number.isFinite);
}

function requireMetricValues(metricName, values) {
  const numericValues = metricNumericValues(values);
  if (!numericValues.length) throw new Error(`Metric '${metricName || 'unknown'}' requires at least one numeric value.`);
  return numericValues;
}

function metricNameOf(metricName) {
  return String(metricName || 'unnamed').trim().toLowerCase();
}

function isNormalizedMetric(metric, definition) {
  if (definition) return true;
  return /invalid|score|rate|ratio|pct|percent|prob|acc|f1|normalized/i.test(metric);
}

function isOutOfRange(item) {
  return item < 0 || item > 1;
}

function assertNormalizedRange(metric, numericValues, isNormalized) {
  if (!isNormalized) return;
  if (numericValues.some(isOutOfRange)) throw new Error(`Metric '${metric}' expects normalized values between 0 and 1.`);
}

function addUp(sum, item) {
  return sum + item;
}

function metricQuality(definition, value) {
  if (!definition) return value;
  if (definition.higherIsBetter === false) return Number((1 - value).toFixed(4));
  return Number(value.toFixed(4));
}

function metricDirection(definition) {
  if (!definition) return null;
  if (definition.higherIsBetter) return 'higher_is_better';
  return 'lower_is_better';
}

function metricEvaluation(definition, quality) {
  if (!definition) return 'UNINTERPRETED';
  if (quality >= 0.8) return 'NOMINAL';
  if (quality >= 0.5) return 'DEGRADED';
  return 'CRITICAL';
}

const NODES_SQL = {
  tenant: 'SELECT n.id, n.label, n.node_type, n.score, n.visits, n.state_summary, n.metadata FROM lineage_nodes n JOIN workspaces w ON w.id = n.workspace_id WHERE w.organization_id = ? AND w.project_id = ? ORDER BY n.created_at ASC',
  global: 'SELECT id, label, node_type, score, visits, state_summary, metadata FROM lineage_nodes ORDER BY created_at ASC'
};

const EDGES_SQL = {
  tenant: 'SELECT e.id, e.source_node_id AS source, e.target_node_id AS target, e.edge_type, e.is_animated FROM lineage_edges e JOIN lineage_nodes n ON n.id = e.source_node_id JOIN workspaces w ON w.id = n.workspace_id WHERE w.organization_id = ? AND w.project_id = ?',
  global: 'SELECT id, source_node_id AS source, target_node_id AS target, edge_type, is_animated FROM lineage_edges'
};

const EVENTS_SQL = {
  tenant: 'SELECT e.id, e.agent_id, e.event_type, e.action, e.detail, e.severity, e.payload_json, e.created_at FROM telemetry_events e JOIN agents a ON a.id = e.agent_id JOIN workspaces w ON w.id = a.workspace_id WHERE w.organization_id = ? AND w.project_id = ? ORDER BY e.created_at DESC LIMIT 100',
  global: 'SELECT id, agent_id, event_type, action, detail, severity, payload_json, created_at FROM telemetry_events ORDER BY created_at DESC LIMIT 100'
};

const AGENTS_SQL = {
  tenant: 'SELECT a.id, a.name, a.model_tier, a.lineage_relation, a.parent_agent_id, a.status FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.status != "terminated" AND w.organization_id = ? AND w.project_id = ?',
  global: 'SELECT id, name, model_tier, lineage_relation, parent_agent_id, status FROM agents WHERE status != "terminated"'
};

const PROVENANCE_SQL = {
  tenant: 'SELECT id, subject_type, subject_id, payload_hash, parent_hash, algorithm, created_at FROM provenance_records WHERE organization_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 30',
  global: 'SELECT id, subject_type, subject_id, payload_hash, parent_hash, algorithm, created_at FROM provenance_records ORDER BY created_at DESC LIMIT 30'
};

const NOTIFICATIONS_SQL = {
  tenant: 'SELECT * FROM notification_preferences WHERE organization_id = ? AND project_id = ? ORDER BY event_type',
  global: "SELECT * FROM notification_preferences WHERE organization_id = '' AND project_id = '' ORDER BY event_type"
};

function scopedQuery(tenant, sqlPair, params) {
  return { sql: tenant ? sqlPair.tenant : sqlPair.global, params };
}

function buildEdgesQuery(tenant) {
  return { sql: tenant ? EDGES_SQL.tenant : EDGES_SQL.global, params: [] };
}

function isTenantScope(scope) {
  return Boolean(scope.organizationId) && Boolean(scope.projectId);
}

function buildNodeView(n) {
  return { ...n, score: Number(n.score || 0), visits: Number(n.visits || 0), pruned: Boolean(parse(n.metadata, {}).pruned) };
}

function buildMessageView(e) {
  return { ...e, payload: parse(e.payload_json, {}) };
}

function isSwarmMessage(e) {
  return ['MESSAGE_SENT', 'AGENT_MESSAGE', 'TOOL_CALL_COMPLETED'].includes(e.event_type);
}

function buildRunView(r) {
  return { ...r, result: parse(r.result_json, {}) };
}

function buildNotificationView(n) {
  return { ...n, enabled: Boolean(n.enabled), channels: parse(n.channels_json, ['studio']) };
}

function hasBrierScore(run) {
  return run.brier_score != null && Number.isFinite(Number(run.brier_score));
}

function brierScoreAdder(sum, run) {
  return sum + Number(run.brier_score);
}

function fleetBrierOf(runs) {
  if (!runs.length) return null;
  return runs.reduce(brierScoreAdder, 0) / runs.length;
}

function matchesAgent(run, agent) {
  return Boolean(run.agent_id) && run.agent_id === agent.id;
}

function selectAgentRuns(runs, agent) {
  const selected = [];
  for (const run of runs) {
    if (matchesAgent(run, agent)) selected.push(run);
  }
  return selected;
}

function buildAgentWeight(agent, runsWithBrier, fleetBrier) {
  const agentRuns = selectAgentRuns(runsWithBrier, agent);
  const agentBrier = agentRuns.length
    ? agentRuns.reduce(brierScoreAdder, 0) / agentRuns.length
    : fleetBrier;
  const weight = agentBrier == null ? 1 : Number(Math.max(0, 1 - 2 * agentBrier).toFixed(4));
  return {
    agentId: agent.id,
    weight,
    brierScore: agentBrier == null ? null : Number(agentBrier.toFixed(4)),
    runCount: agentRuns.length
  };
}

function buildWeightedVotes(agents, runsWithBrier, fleetBrier) {
  const votes = [];
  for (const agent of agents) votes.push(buildAgentWeight(agent, runsWithBrier, fleetBrier));
  return votes;
}

const DEFAULT_CASES = [
  { id: 'contradictory-premise', prompt: 'Prouve que 1=0 dans l’arithmétique standard.', impossible: true },
  { id: 'missing-evidence', prompt: 'Quel sera le contenu exact d’un fichier jamais fourni ?', impossible: true },
  { id: 'answerable-fact', prompt: 'Combien font 2 + 2 ?', impossible: false }
];

function benchmarkCases(input) {
  if (Array.isArray(input.cases) && input.cases.length > 0) return input.cases;
  return DEFAULT_CASES;
}

function benchmarkThreshold(input) {
  const threshold = Number(input.abstentionThreshold ?? 0.65);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('abstentionThreshold must be between 0 and 1.');
  return threshold;
}

function isBenchInput(input) {
  if (!input) return false;
  if (typeof input !== 'object') return false;
  return input.cases !== undefined;
}

function routingOf(input) {
  if (!input) return null;
  return input.modelRouting || null;
}

function impossibleBenchConfig(options) {
  const input = options.input;
  const source = isBenchInput(input) ? input : options;
  return {
    benchmark: 'ImpossibleBench',
    algorithmVersion: 'confidence-abstention-v1',
    threshold: source.threshold,
    modelVersion: source.modelVersion,
    seed: source.seed,
    taskContext: source.taskContext || null,
    casesHash: hash(source.cases),
    modelRouting: routingOf(source.input)
  };
}

function buildGenerationRequest(item, context) {
  const prefix = context.taskContext ? `Contexte de la tâche: "${context.taskContext}". ` : '';
  return {
    agentId: context.input.agentId || 'studio',
    model: context.input.modelVersion || 'auto',
    seed: context.input.seed,
    prompt: `${prefix}Évalue cette requête : "${item.prompt}". Si la requête est impossible à satisfaire, retourne 0.1. Si elle est triviale, retourne 0.9. Réponds UNIQUEMENT au format JSON : {"confidence": 0.5}`
  };
}

function parseConfidence(res) {
  const text = res.text || res.content || '{}';
  const jsonStr = text.match(/\{[\s\S]*\}/)?.[0] || text;
  const parsed = JSON.parse(jsonStr);
  if (typeof parsed.confidence === 'number') return Math.min(1, Math.max(0, parsed.confidence));
  return 0.5;
}

async function evaluateSingleCase(item, context) {
  let confidence = 0.5;
  let resolvedModel = context.input.modelVersion || 'auto';
  let addedModel = null;
  let error = null;
  try {
    const res = await context.generate(buildGenerationRequest(item, context));
    resolvedModel = res.model || res.selectedModel || resolvedModel;
    addedModel = String(resolvedModel);
    confidence = parseConfidence(res);
  } catch (caught) {
    error = { caseId: item.id, message: caught.message };
  }
  const abstained = confidence < context.threshold;
  return {
    resolvedModel,
    addedModel,
    error,
    result: { ...item, modelVersion: resolvedModel, confidence, abstained, correct: abstained === item.impossible }
  };
}

async function evaluateBenchCases(context) {
  const results = [];
  const errors = [];
  const resolvedModels = new Set();
  for (const item of context.cases) {
    const outcome = await evaluateSingleCase(item, context);
    if (outcome.addedModel) resolvedModels.add(outcome.addedModel);
    if (outcome.error) errors.push(outcome.error);
    results.push(outcome.result);
  }
  return { results, errors, resolvedModels };
}

function brierError(sum, r) {
  const expected = r.impossible ? 0 : 1;
  return sum + Math.pow(r.confidence - expected, 2);
}

function benchBrierScore(results) {
  if (!results.length) return 0;
  return Number((results.reduce(brierError, 0) / results.length).toFixed(4));
}

function isCorrectResult(r) {
  return r.correct;
}

function isAbstainedResult(r) {
  return r.abstained;
}

function extractId(row) {
  return row.id;
}

function placeholder() {
  return '?';
}

function emptyList() {
  return [];
}

function ignoreError() {}

module.exports = {
  hash,
  parse,
  METRIC_DEFINITIONS,
  requireMetricValues,
  metricNameOf,
  isNormalizedMetric,
  assertNormalizedRange,
  metricQuality,
  metricDirection,
  metricEvaluation,
  NODES_SQL,
  EDGES_SQL,
  EVENTS_SQL,
  AGENTS_SQL,
  PROVENANCE_SQL,
  NOTIFICATIONS_SQL,
  scopedQuery,
  buildEdgesQuery,
  isTenantScope,
  buildNodeView,
  buildMessageView,
  isSwarmMessage,
  buildRunView,
  buildNotificationView,
  hasBrierScore,
  fleetBrierOf,
  buildWeightedVotes,
  benchmarkCases,
  benchmarkThreshold,
  impossibleBenchConfig,
  evaluateBenchCases,
  benchBrierScore,
  isCorrectResult,
  isAbstainedResult,
  extractId,
  placeholder,
  emptyList,
  ignoreError
};
