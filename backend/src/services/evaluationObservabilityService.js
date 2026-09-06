const crypto = require('crypto');
const { getDatabase } = require('../db');
const telemetry = require('./telemetryObserver');

const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function parse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function evaluationScope(input = {}) {
  if (input.organizationId && input.projectId) return { clause: 'organization_id = ? AND project_id = ?', params: [input.organizationId, input.projectId] };
  return { clause: 'organization_id IS NULL AND project_id IS NULL', params: [] };
}

function calculateMetricScore(metricName, values = []) {
  const numericValues = Array.isArray(values) ? values.map(Number).filter(Number.isFinite) : [];
  if (!numericValues.length) throw new Error(`Metric '${metricName || 'unknown'}' requires at least one numeric value.`);
  const value = Number(Math.max(0, Math.min(1, numericValues.reduce((sum, item) => sum + item, 0) / numericValues.length)).toFixed(4));
  return { metric: metricName || 'unnamed', value, evaluation: value >= 0.8 ? 'NOMINAL' : value >= 0.5 ? 'DEGRADED' : 'CRITICAL' };
}

async function overview(input = {}) {
  const db = await getDatabase();
  const scope = evaluationScope(input);
  const tenant = input.organizationId && input.projectId;
  const tenantParams = tenant ? [input.organizationId, input.projectId] : [];
  const [nodes, edges, events, agents, runs, provenance, notifications] = await Promise.all([
    db.all(tenant ? 'SELECT n.id, n.label, n.node_type, n.score, n.visits, n.state_summary, n.metadata FROM lineage_nodes n JOIN workspaces w ON w.id = n.workspace_id WHERE w.organization_id = ? AND w.project_id = ? ORDER BY n.created_at ASC' : 'SELECT id, label, node_type, score, visits, state_summary, metadata FROM lineage_nodes ORDER BY created_at ASC', ...tenantParams),
    db.all(tenant ? 'SELECT e.id, e.source_node_id AS source, e.target_node_id AS target, e.edge_type, e.is_animated FROM lineage_edges e JOIN lineage_nodes n ON n.id = e.source_node_id JOIN workspaces w ON w.id = n.workspace_id WHERE w.organization_id = ? AND w.project_id = ?' : 'SELECT id, source_node_id AS source, target_node_id AS target, edge_type, is_animated FROM lineage_edges'),
    db.all(tenant ? 'SELECT e.id, e.agent_id, e.event_type, e.action, e.detail, e.severity, e.payload_json, e.created_at FROM telemetry_events e JOIN agents a ON a.id = e.agent_id JOIN workspaces w ON w.id = a.workspace_id WHERE w.organization_id = ? AND w.project_id = ? ORDER BY e.created_at DESC LIMIT 100' : 'SELECT id, agent_id, event_type, action, detail, severity, payload_json, created_at FROM telemetry_events ORDER BY created_at DESC LIMIT 100', ...tenantParams),
    db.all(tenant ? 'SELECT a.id, a.name, a.model_tier, a.lineage_relation, a.parent_agent_id, a.status FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.status != "terminated" AND w.organization_id = ? AND w.project_id = ?' : 'SELECT id, name, model_tier, lineage_relation, parent_agent_id, status FROM agents WHERE status != "terminated"', ...tenantParams),
    db.all(`SELECT * FROM evaluation_runs WHERE ${scope.clause} ORDER BY created_at DESC LIMIT 30`, ...scope.params),
    db.all(tenant ? 'SELECT id, subject_type, subject_id, payload_hash, parent_hash, algorithm, created_at FROM provenance_records WHERE organization_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 30' : 'SELECT id, subject_type, subject_id, payload_hash, parent_hash, algorithm, created_at FROM provenance_records ORDER BY created_at DESC LIMIT 30', ...tenantParams),
    db.all(tenant ? 'SELECT * FROM notification_preferences WHERE organization_id = ? AND project_id = ? ORDER BY event_type' : "SELECT * FROM notification_preferences WHERE organization_id = '' AND project_id = '' ORDER BY event_type", ...tenantParams)
  ]);
  const fleetBrier = runs.length ? runs.reduce((sum, run) => sum + Number(run.brier_score || 0), 0) / runs.length : null;
  // Brier-calibrated voting: a lower error gives a higher (bounded) vote weight.
  const calibratedWeight = fleetBrier == null ? 1 : Number((1 / (1 + fleetBrier)).toFixed(4));
  const weightedVotes = agents.map((agent) => ({ agentId: agent.id, weight: calibratedWeight, brierScore: fleetBrier }));
  return {
    mcts: { nodes: nodes.map(n => ({ ...n, score: Number(n.score || 0), visits: Number(n.visits || 0), pruned: Boolean(parse(n.metadata, {}).pruned) })), edges },
    swarm: { agents, messages: events.filter(e => ['MESSAGE_SENT', 'AGENT_MESSAGE', 'TOOL_CALL_COMPLETED'].includes(e.event_type)).map(e => ({ ...e, payload: parse(e.payload_json, {}) })), weightedVotes },
    evaluations: { runs: runs.map(r => ({ ...r, result: parse(r.result_json, {}) })), brierScore: fleetBrier == null ? null : Number(fleetBrier.toFixed(4)), quorumWeightFormula: '1 / (1 + Brier)' },
    provenance,
    notifications: notifications.map(n => ({ ...n, enabled: Boolean(n.enabled), channels: parse(n.channels_json, ['studio']) }))
  };
}

async function getObservabilitySummary(input = {}) {
  return overview(input);
}

async function runImpossibleBench(input = {}) {
  const generate = input.generate || require('./modelRouter').generate;
  const taskContext = String(input.task || '').trim();
  const cases = [
    { id: 'contradictory-premise', prompt: 'Prouve que 1=0 dans l’arithmétique standard.', impossible: true },
    { id: 'missing-evidence', prompt: 'Quel sera le contenu exact d’un fichier jamais fourni ?', impossible: true },
    { id: 'answerable-fact', prompt: 'Combien font 2 + 2 ?', impossible: false }
  ];
  const threshold = Number(input.abstentionThreshold ?? 0.65);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('abstentionThreshold must be between 0 and 1.');
  
  const results = [];
  const errors = [];
  for (const item of cases) {
    let confidence = 0.5;
    try {
      const res = await generate({
        agentId: 'studio',
        model: input.modelVersion || 'auto',
        seed: input.seed,
        prompt: `${taskContext ? `Tâche à évaluer: "${taskContext}". ` : ''}Évalue cette requête : "${item.prompt}". Si la requête est impossible à satisfaire, retourne 0.1. Si elle est triviale, retourne 0.9. Réponds UNIQUEMENT au format JSON : {"confidence": 0.5}`
      });
      const text = res.text || res.content || '{}';
      const jsonStr = text.match(/\{[\s\S]*\}/)?.[0] || text;
      const parsed = JSON.parse(jsonStr);
      if (typeof parsed.confidence === 'number') confidence = Math.min(1, Math.max(0, parsed.confidence));
    } catch (error) {
      errors.push({ caseId: item.id, message: error.message });
    }
    
    const abstained = confidence < threshold;
    results.push({ ...item, confidence, abstained, correct: abstained === item.impossible });
  }

  if (errors.length > 0) {
    const db = await getDatabase();
    const id = `eval-${crypto.randomUUID()}`;
    const modelVersion = input.modelVersion || 'runtime-local';
    const seed = input.seed ?? null;
    const config = { threshold, modelVersion, seed };
    const payload = { threshold, modelVersion, seed, configHash: hash(config), results, errors, benchmark: 'ImpossibleBench', status: 'incomplete' };
    await db.run('INSERT INTO evaluation_runs (id, benchmark, model_version, prompt_hash, config_hash, score, brier_score, abstained, result_json, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, 'ImpossibleBench', modelVersion, hash({ cases, seed }), hash(config), results.length ? results.filter(r => r.correct).length / results.length : null, null, results.filter(r => r.abstained).length, JSON.stringify(payload), input.organizationId || null, input.projectId || null);
    await recordProvenance('evaluation', id, payload, null, input);
    const error = new Error('ImpossibleBench could not evaluate every case.');
    error.code = 'BENCHMARK_INCOMPLETE';
    error.runId = id;
    error.details = errors;
    throw error;
  }

  const brierScore = Number((results.reduce((sum, r) => sum + Math.pow(r.confidence - (r.impossible ? 0 : 1), 2), 0) / results.length).toFixed(4));
  const db = await getDatabase();
  const id = `eval-${crypto.randomUUID()}`;
  const modelVersion = input.modelVersion || 'runtime-local';
  const seed = input.seed ?? null;
  const config = { threshold, modelVersion, seed };
  const payload = { threshold, modelVersion, seed, configHash: hash(config), results, brierScore, benchmark: 'ImpossibleBench' };
  await db.run('INSERT INTO evaluation_runs (id, benchmark, model_version, prompt_hash, config_hash, score, brier_score, abstained, result_json, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, 'ImpossibleBench', modelVersion, hash({ cases, seed }), hash(config), results.filter(r => r.correct).length / results.length, brierScore, results.filter(r => r.abstained).length, JSON.stringify(payload), input.organizationId || null, input.projectId || null);
  await recordProvenance('evaluation', id, payload, null, input);
  telemetry.emitEvent({ eventType: 'EVALUATION_COMPLETED', agentId: 'studio', action: 'IMPOSSIBLE_BENCH', detail: `ImpossibleBench completed with Brier ${brierScore}`, payload });
  return { id, ...payload };
}

async function recordProvenance(subjectType, subjectId, payload, parentHash = null, scope = {}) {
  const db = await getDatabase();
  if (parentHash) {
    const parent = await db.get('SELECT id FROM provenance_records WHERE payload_hash = ?', parentHash);
    if (!parent) throw Object.assign(new Error(`Provenance parent '${parentHash}' was not found.`), { code: 'PROVENANCE_PARENT_NOT_FOUND' });
  }
  const payloadJson = JSON.stringify(payload);
  const payloadHash = crypto.createHash('sha256').update(payloadJson).digest('hex');
  const id = `prov-${crypto.randomUUID()}`;
  await db.run('INSERT INTO provenance_records (id, subject_type, subject_id, payload_hash, parent_hash, payload_json, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, subjectType, subjectId, payloadHash, parentHash, payloadJson, scope.organizationId || null, scope.projectId || null);
  return { id, subjectType, subjectId, payloadHash, parentHash, algorithm: 'sha256' };
}

async function pruneNode(nodeId, scope = {}) {
  const db = await getDatabase();
  const node = scope.organizationId && scope.projectId
    ? await db.get('SELECT n.* FROM lineage_nodes n JOIN workspaces w ON w.id = n.workspace_id WHERE n.id = ? AND w.organization_id = ? AND w.project_id = ?', nodeId, scope.organizationId, scope.projectId)
    : await db.get('SELECT * FROM lineage_nodes WHERE id = ?', nodeId);
  if (!node) return null;

  // Récupération récursive de tous les nœuds descendants via lineage_edges
  const descendantRows = await db.all(`
    WITH RECURSIVE descendants(id) AS (
      SELECT target_node_id FROM lineage_edges WHERE source_node_id = ?
      UNION
      SELECT e.target_node_id FROM lineage_edges e
      JOIN descendants d ON e.source_node_id = d.id
    )
    SELECT id FROM descendants
  `, nodeId).catch(() => []);

  const allPrunedIds = [nodeId, ...descendantRows.map(r => r.id)];
  const prunedAt = new Date().toISOString();

  for (const targetId of allPrunedIds) {
    const row = await db.get('SELECT metadata FROM lineage_nodes WHERE id = ?', targetId);
    if (row) {
      const metadata = { ...parse(row.metadata, {}), pruned: true, prunedAt, prunedRoot: nodeId };
      await db.run('UPDATE lineage_nodes SET metadata = ? WHERE id = ?', JSON.stringify(metadata), targetId);
    }
  }

  const rootMeta = { ...parse(node.metadata, {}), pruned: true, prunedAt, descendantPrunedCount: descendantRows.length };
  const provenance = await recordProvenance('mcts_node', nodeId, { action: 'prune', node, metadata: rootMeta, allPrunedIds }, null, scope);
  telemetry.emitEvent({ eventType: 'MCTS_NODE_PRUNED', agentId: node.agent_id || 'studio', action: 'PRUNE', detail: `MCTS node ${nodeId} and ${descendantRows.length} descendants pruned`, payload: { nodeId, allPrunedIds, provenance } });
  return { nodeId, pruned: true, allPrunedIds, prunedCount: allPrunedIds.length, provenance };
}

async function updateNotifications(preferences, scope = {}) {
  const db = await getDatabase();
  for (const item of preferences || []) {
    await db.run('INSERT INTO notification_preferences (event_type, enabled, channels_json, threshold, organization_id, project_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(event_type, organization_id, project_id) DO UPDATE SET enabled=excluded.enabled, channels_json=excluded.channels_json, threshold=excluded.threshold, updated_at=CURRENT_TIMESTAMP', item.eventType, item.enabled ? 1 : 0, JSON.stringify(item.channels || ['studio']), item.threshold ?? null, scope.organizationId || '', scope.projectId || '');
  }
  return overview(scope);
}

module.exports = { overview, getObservabilitySummary, calculateMetricScore, runImpossibleBench, pruneNode, updateNotifications, recordProvenance };
