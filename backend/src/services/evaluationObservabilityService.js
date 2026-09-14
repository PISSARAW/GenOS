const crypto = require('crypto');
const { getDatabase } = require('../db');
const telemetry = require('./telemetryObserver');
const { canonicalize } = require('./evaluationGraders');
const {
  hash, parse, METRIC_DEFINITIONS, requireMetricValues, metricNameOf,
  isNormalizedMetric, assertNormalizedRange, metricQuality, metricDirection, metricEvaluation,
  NODES_SQL, EVENTS_SQL, AGENTS_SQL, PROVENANCE_SQL, NOTIFICATIONS_SQL, scopedQuery, buildEdgesQuery,
  isTenantScope, buildNodeView, buildMessageView, isSwarmMessage, buildRunView,
  buildNotificationView, hasBrierScore, fleetBrierOf, buildWeightedVotes,
  benchmarkCases, benchmarkThreshold, impossibleBenchConfig, evaluateBenchCases,
  benchBrierScore, isCorrectResult, isAbstainedResult, extractId, placeholder, emptyList, ignoreError
} = require('./evaluationObservabilityHelpers');

function evaluationScope(input = {}) {
  const organizationId = input.organizationId ?? input.organization_id;
  const projectId = input.projectId ?? input.project_id;
  if (organizationId || projectId) {
    if (!organizationId || !projectId) throw new Error('organizationId and projectId must be provided together.');
    return { clause: 'organization_id = ? AND project_id = ?', params: [organizationId, projectId] };
  }
  return { clause: 'organization_id IS NULL AND project_id IS NULL', params: [] };
}

function calculateMetricScore(metricName, values = []) {
  const numericValues = requireMetricValues(metricName, values);
  const metric = metricNameOf(metricName);
  const definition = METRIC_DEFINITIONS[metric];
  const isNormalized = isNormalizedMetric(metric, definition);
  assertNormalizedRange(metric, numericValues, isNormalized);
  const value = Number((numericValues.reduce((sum, item) => sum + item, 0) / numericValues.length).toFixed(4));
  const quality = metricQuality(definition, value);
  return {
    metric: metricName || 'unnamed',
    value,
    quality,
    direction: metricDirection(definition),
    sampleSize: numericValues.length,
    evaluation: metricEvaluation(definition, quality),
    qualityGuarantee: false
  };
}

async function overview(input = {}) {
  const db = await getDatabase();
  const scope = evaluationScope(input);
  const tenant = Boolean(input.organizationId && input.projectId);
  const params = tenant ? [input.organizationId, input.projectId] : [];
  const nodesQuery = scopedQuery(tenant, NODES_SQL, params);
  const edgesQuery = buildEdgesQuery(tenant);
  const eventsQuery = scopedQuery(tenant, EVENTS_SQL, params);
  const agentsQuery = scopedQuery(tenant, AGENTS_SQL, params);
  const provenanceQuery = scopedQuery(tenant, PROVENANCE_SQL, params);
  const notificationsQuery = scopedQuery(tenant, NOTIFICATIONS_SQL, params);
  const [nodes, edges, events, agents, runs, provenance, notifications] = await Promise.all([
    db.all(nodesQuery.sql, ...nodesQuery.params),
    db.all(edgesQuery.sql, ...edgesQuery.params),
    db.all(eventsQuery.sql, ...eventsQuery.params),
    db.all(agentsQuery.sql, ...agentsQuery.params),
    db.all(`SELECT * FROM evaluation_runs WHERE ${scope.clause} ORDER BY created_at DESC LIMIT 30`, ...scope.params),
    db.all(provenanceQuery.sql, ...provenanceQuery.params),
    db.all(notificationsQuery.sql, ...notificationsQuery.params)
  ]);
  const runsWithBrier = runs.filter(hasBrierScore);
  const fleetBrier = fleetBrierOf(runsWithBrier);
  const weightedVotes = buildWeightedVotes(agents, runsWithBrier, fleetBrier);
  return {
    mcts: { nodes: nodes.map(buildNodeView), edges },
    swarm: { agents, messages: events.filter(isSwarmMessage).map(buildMessageView), weightedVotes },
    evaluations: { runs: runs.map(buildRunView), brierScore: fleetBrier == null ? null : Number(fleetBrier.toFixed(4)), quorumWeightFormula: 'max(0, 1 - 2 * Brier)' },
    provenance,
    notifications: notifications.map(buildNotificationView)
  };
}

async function getObservabilitySummary(input = {}) {
  return overview(input);
}

async function failImpossibleBench(context) {
  const db = await getDatabase();
  const id = `eval-${crypto.randomUUID()}`;
  const agentId = context.input.agentId || 'studio';
  const modelVersion = context.input.modelVersion || [...context.resolvedModels].sort().join(',') || 'auto';
  const seed = context.input.seed ?? null;
  const config = impossibleBenchConfig({ input: context.input, threshold: context.threshold, modelVersion, seed, cases: context.cases, taskContext: context.taskContext });
  const payload = { threshold: context.threshold, modelVersion, seed, configHash: hash(config), results: context.results, errors: context.errors, benchmark: 'ImpossibleBench', status: 'incomplete', agentId, taskContext: context.taskContext || null };
  await db.run('INSERT INTO evaluation_runs (id, benchmark, model_version, prompt_hash, config_hash, score, brier_score, abstained, result_json, agent_id, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, 'ImpossibleBench', modelVersion, hash({ cases: context.cases, seed }), hash(config), context.results.length ? context.results.filter(isCorrectResult).length / context.results.length : null, null, context.results.filter(isAbstainedResult).length, JSON.stringify(payload), agentId, context.input.organizationId || null, context.input.projectId || null);
  await recordProvenance('evaluation', id, payload, null, context.input);
  const error = new Error('ImpossibleBench could not evaluate every case.');
  error.code = 'BENCHMARK_INCOMPLETE';
  error.runId = id;
  error.details = context.errors;
  throw error;
}

async function completeImpossibleBench(context) {
  const brierScore = benchBrierScore(context.results);
  const score = context.results.length ? context.results.filter(isCorrectResult).length / context.results.length : 0;
  const db = await getDatabase();
  const id = `eval-${crypto.randomUUID()}`;
  const agentId = context.input.agentId || 'studio';
  const modelVersion = context.input.modelVersion || [...context.resolvedModels].sort().join(',') || 'auto';
  const seed = context.input.seed ?? null;
  const config = impossibleBenchConfig({ input: context.input, threshold: context.threshold, modelVersion, seed, cases: context.cases, taskContext: context.taskContext });
  const payload = { threshold: context.threshold, modelVersion, seed, configHash: hash(config), results: context.results, brierScore, benchmark: 'ImpossibleBench', agentId, taskContext: context.taskContext || null };
  await db.run('INSERT INTO evaluation_runs (id, benchmark, model_version, prompt_hash, config_hash, score, brier_score, abstained, result_json, agent_id, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, 'ImpossibleBench', modelVersion, hash({ cases: context.cases, seed }), hash(config), score, brierScore, context.results.filter(isAbstainedResult).length, JSON.stringify(payload), agentId, context.input.organizationId || null, context.input.projectId || null);
  await recordProvenance('evaluation', id, payload, null, context.input);
  telemetry.emitEvent({ eventType: 'EVALUATION_COMPLETED', agentId, action: 'IMPOSSIBLE_BENCH', detail: `ImpossibleBench completed with Brier ${brierScore}`, payload });
  return { id, ...payload };
}

async function runImpossibleBench(input = {}) {
  const generate = input.generate || require('./modelRouter').generate;
  const taskContext = String(input.task || '').trim();
  const cases = benchmarkCases(input);
  if (cases.length === 0) throw new Error('ImpossibleBench requires at least one evaluation case.');
  const threshold = benchmarkThreshold(input);
  const evaluated = await evaluateBenchCases({ cases, generate, input, taskContext, threshold });
  const context = { input, cases, threshold, taskContext, results: evaluated.results, errors: evaluated.errors, resolvedModels: evaluated.resolvedModels };
  if (evaluated.errors.length > 0) return failImpossibleBench(context);
  return completeImpossibleBench(context);
}

async function recordProvenance(..._args) {
  const [subjectType, subjectId, payload, parentHash = null, scope = {}] = _args;
  const db = await getDatabase();
  if (parentHash) {
    const parent = scope.organizationId && scope.projectId
      ? await db.get('SELECT id FROM provenance_records WHERE payload_hash = ? AND organization_id = ? AND project_id = ?', parentHash, scope.organizationId, scope.projectId)
      : await db.get('SELECT id FROM provenance_records WHERE payload_hash = ? AND organization_id IS NULL AND project_id IS NULL', parentHash);
    if (!parent) throw Object.assign(new Error(`Provenance parent '${parentHash}' was not found.`), { code: 'PROVENANCE_PARENT_NOT_FOUND' });
  }
  const payloadJson = JSON.stringify(canonicalize(payload));
  const payloadHash = crypto.createHash('sha256').update(payloadJson).digest('hex');
  const id = `prov-${crypto.randomUUID()}`;
  await db.run('INSERT INTO provenance_records (id, subject_type, subject_id, payload_hash, parent_hash, payload_json, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, subjectType, subjectId, payloadHash, parentHash, payloadJson, scope.organizationId || null, scope.projectId || null);
  return { id, subjectType, subjectId, payloadHash, parentHash, algorithm: 'sha256' };
}

async function resolveNode(nodeId, scope) {
  const db = await getDatabase();
  if (!isTenantScope(scope)) return db.get('SELECT * FROM lineage_nodes WHERE id = ?', nodeId);
  return db.get('SELECT n.* FROM lineage_nodes n JOIN workspaces w ON w.id = n.workspace_id WHERE n.id = ? AND w.organization_id = ? AND w.project_id = ?', nodeId, scope.organizationId, scope.projectId);
}

async function resolveDescendants(nodeId, scope) {
  const db = await getDatabase();
  if (!isTenantScope(scope)) {
    return db.all(`
    WITH RECURSIVE descendants(id) AS (
      SELECT target_node_id FROM lineage_edges WHERE source_node_id = ?
      UNION
      SELECT e.target_node_id FROM lineage_edges e JOIN descendants d ON e.source_node_id = d.id
    )
    SELECT id FROM descendants
  `, nodeId).catch(emptyList);
  }
  return db.all(`
    WITH RECURSIVE descendants(id) AS (
      SELECT e.target_node_id
      FROM lineage_edges e
      JOIN lineage_nodes target ON target.id = e.target_node_id
      JOIN workspaces target_ws ON target_ws.id = target.workspace_id
      WHERE e.source_node_id = ? AND target_ws.organization_id = ? AND target_ws.project_id = ?
      UNION
      SELECT e.target_node_id
      FROM lineage_edges e
      JOIN descendants d ON e.source_node_id = d.id
      JOIN lineage_nodes target ON target.id = e.target_node_id
      JOIN workspaces target_ws ON target_ws.id = target.workspace_id
      WHERE target_ws.organization_id = ? AND target_ws.project_id = ?
    )
    SELECT id FROM descendants
  `, nodeId, scope.organizationId, scope.projectId, scope.organizationId, scope.projectId).catch(emptyList);
}

async function loadPrunedNodes(placeholders, allPrunedIds, scope) {
  const db = await getDatabase();
  if (!isTenantScope(scope)) {
    return db.all(`SELECT id, metadata, agent_id FROM lineage_nodes WHERE id IN (${placeholders})`, ...allPrunedIds).catch(emptyList);
  }
  return db.all(`SELECT n.id, n.metadata, n.agent_id FROM lineage_nodes n JOIN workspaces w ON w.id = n.workspace_id WHERE n.id IN (${placeholders}) AND w.organization_id = ? AND w.project_id = ?`, ...allPrunedIds, scope.organizationId, scope.projectId).catch(emptyList);
}

async function loadEdges(placeholders, allPrunedIds, scope) {
  const db = await getDatabase();
  if (!isTenantScope(scope)) {
    return db.all(`SELECT id, metadata FROM lineage_edges WHERE source_node_id IN (${placeholders}) OR target_node_id IN (${placeholders})`, ...allPrunedIds, ...allPrunedIds).catch(emptyList);
  }
  return db.all(`SELECT e.id, e.metadata FROM lineage_edges e JOIN lineage_nodes n ON n.id = e.source_node_id JOIN workspaces w ON w.id = n.workspace_id WHERE (e.source_node_id IN (${placeholders}) OR e.target_node_id IN (${placeholders})) AND w.organization_id = ? AND w.project_id = ?`, ...allPrunedIds, ...allPrunedIds, scope.organizationId, scope.projectId).catch(emptyList);
}

function loadRuntimeAdapter() {
  try {
    const adapter = require('./agentRuntimeAdapter');
    const lifecycle = require('./agentWorkspaceLifecycleService');
    return { adapter, cleanup: lifecycle.scheduleWorkspaceCleanup };
  } catch (_) {
    return { adapter: null, cleanup: null };
  }
}

function stopMissionSafely(runtime, agentId) {
  try { runtime.adapter.stopMission(agentId); } catch (_) {}
}

async function cleanupWorkspaceSafely(runtime, agentId) {
  try { await runtime.cleanup(agentId); } catch (_) {}
}

async function apoptosisAgent(db, agentId, scope) {
  if (!isTenantScope(scope)) {
    await db.run("UPDATE agents SET status = 'apoptosis', is_apoptotic = 1, cognitive_budget = 0, current_task = '[PRUNED] MCTS branch cutoff' WHERE id = ?", agentId);
    return;
  }
  await db.run("UPDATE agents SET status = 'apoptosis', is_apoptotic = 1, cognitive_budget = 0, current_task = '[PRUNED] MCTS branch cutoff' WHERE id = ? AND workspace_id IN (SELECT id FROM workspaces WHERE organization_id = ? AND project_id = ?)", agentId, scope.organizationId, scope.projectId);
}

async function terminateAgent(row, scope, runtime) {
  if (!row.agent_id) return;
  const db = await getDatabase();
  if (runtime.adapter) stopMissionSafely(runtime, row.agent_id);
  try { await apoptosisAgent(db, row.agent_id, scope); } catch (_) {}
  if (runtime.cleanup) await cleanupWorkspaceSafely(runtime, row.agent_id);
}

async function terminateAgents(nodeRows, scope, runtime) {
  const terminated = [];
  for (const row of nodeRows) {
    if (!row.agent_id) continue;
    terminated.push(row.agent_id);
    await terminateAgent(row, scope, runtime);
  }
  return terminated;
}

async function markNodesPruned(nodeRows, nodeId, prunedAt) {
  const db = await getDatabase();
  for (const row of nodeRows) {
    const metadata = { ...parse(row.metadata, {}), pruned: true, prunedAt, prunedRoot: nodeId };
    await db.run('UPDATE lineage_nodes SET metadata = ? WHERE id = ?', JSON.stringify(metadata), row.id);
  }
}

async function markEdgesPruned(edgeRows, prunedAt) {
  const db = await getDatabase();
  for (const edge of edgeRows) {
    const eMeta = { ...parse(edge.metadata, {}), pruned: true, prunedAt };
    await db.run('UPDATE lineage_edges SET metadata = ? WHERE id = ?', JSON.stringify(eMeta), edge.id).catch(ignoreError);
  }
}

async function pruneNode(nodeId, scope = {}) {
  const node = await resolveNode(nodeId, scope);
  if (!node) return null;
  const descendantRows = await resolveDescendants(nodeId, scope);
  const allPrunedIds = [nodeId, ...descendantRows.map(extractId)];
  const prunedAt = new Date().toISOString();
  const placeholders = allPrunedIds.map(placeholder).join(',');
  const nodeRows = await loadPrunedNodes(placeholders, allPrunedIds, scope);
  const runtime = loadRuntimeAdapter();
  const terminatedAgents = await terminateAgents(nodeRows, scope, runtime);
  await markNodesPruned(nodeRows, nodeId, prunedAt);
  const edgeRows = await loadEdges(placeholders, allPrunedIds, scope);
  await markEdgesPruned(edgeRows, prunedAt);
  const rootMeta = { ...parse(node.metadata, {}), pruned: true, prunedAt, descendantPrunedCount: descendantRows.length };
  const provenance = await recordProvenance('mcts_node', nodeId, { action: 'prune', node, metadata: rootMeta, allPrunedIds, terminatedAgents }, null, scope);
  telemetry.emitEvent({
    eventType: 'MCTS_NODE_PRUNED',
    agentId: node.agent_id || 'studio',
    action: 'PRUNE',
    detail: `MCTS node ${nodeId} and ${descendantRows.length} descendants pruned. Terminated ${terminatedAgents.length} agents.`,
    payload: { nodeId, allPrunedIds, terminatedAgents, provenance }
  });
  return { nodeId, pruned: true, allPrunedIds, prunedCount: allPrunedIds.length, terminatedAgents, provenance };
}

async function updateNotifications(preferences, scope = {}) {
  const db = await getDatabase();
  for (const item of preferences || []) {
    await db.run('INSERT INTO notification_preferences (event_type, enabled, channels_json, threshold, organization_id, project_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(event_type, organization_id, project_id) DO UPDATE SET enabled=excluded.enabled, channels_json=excluded.channels_json, threshold=excluded.threshold, updated_at=CURRENT_TIMESTAMP', item.eventType, item.enabled ? 1 : 0, JSON.stringify(item.channels || ['studio']), item.threshold ?? null, scope.organizationId || '', scope.projectId || '');
  }
  return overview(scope);
}

module.exports = { overview, getObservabilitySummary, calculateMetricScore, runImpossibleBench, pruneNode, updateNotifications, recordProvenance, __testHash: hash };
