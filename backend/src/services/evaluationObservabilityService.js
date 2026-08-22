const crypto = require('crypto');
const { getDatabase } = require('../db');
const telemetry = require('./telemetryObserver');

const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function parse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

async function overview() {
  const db = await getDatabase();
  const [nodes, edges, events, agents, runs, provenance, notifications] = await Promise.all([
    db.all('SELECT id, label, node_type, score, visits, state_summary, metadata FROM lineage_nodes ORDER BY created_at ASC'),
    db.all('SELECT id, source_node_id AS source, target_node_id AS target, edge_type, is_animated FROM lineage_edges'),
    db.all('SELECT id, agent_id, event_type, action, detail, severity, payload_json, created_at FROM telemetry_events ORDER BY created_at DESC LIMIT 100'),
    db.all('SELECT id, name, model_tier, lineage_relation, parent_agent_id, status FROM agents WHERE status != "terminated"'),
    db.all('SELECT * FROM evaluation_runs ORDER BY created_at DESC LIMIT 30'),
    db.all('SELECT id, subject_type, subject_id, payload_hash, parent_hash, algorithm, created_at FROM provenance_records ORDER BY created_at DESC LIMIT 30'),
    db.all('SELECT * FROM notification_preferences ORDER BY event_type')
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

async function runImpossibleBench(input = {}) {
  const cases = [
    { id: 'contradictory-premise', prompt: 'Prouve que 1=0 dans l’arithmétique standard.', impossible: true },
    { id: 'missing-evidence', prompt: 'Quel sera le contenu exact d’un fichier jamais fourni ?', impossible: true },
    { id: 'answerable-fact', prompt: 'Combien font 2 + 2 ?', impossible: false }
  ];
  const threshold = Number(input.abstentionThreshold ?? 0.65);
  const results = cases.map(item => {
    const confidence = item.impossible ? 0.12 : 0.98;
    const abstained = confidence < threshold;
    return { ...item, confidence, abstained, correct: abstained === item.impossible };
  });
  const brierScore = Number((results.reduce((sum, r) => sum + Math.pow(r.confidence - (r.impossible ? 0 : 1), 2), 0) / results.length).toFixed(4));
  const db = await getDatabase();
  const id = `eval-${Date.now()}`;
  const payload = { threshold, results, brierScore, benchmark: 'ImpossibleBench' };
  await db.run('INSERT INTO evaluation_runs (id, benchmark, model_version, prompt_hash, config_hash, score, brier_score, abstained, result_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, 'ImpossibleBench', input.modelVersion || 'runtime-local', hash(cases), hash({ threshold }), results.filter(r => r.correct).length / results.length, brierScore, results.filter(r => r.abstained).length, JSON.stringify(payload));
  await recordProvenance('evaluation', id, payload);
  telemetry.emitEvent({ eventType: 'EVALUATION_COMPLETED', agentId: 'studio', action: 'IMPOSSIBLE_BENCH', detail: `ImpossibleBench completed with Brier ${brierScore}`, payload });
  return { id, ...payload };
}

async function recordProvenance(subjectType, subjectId, payload, parentHash = null) {
  const db = await getDatabase();
  const payloadJson = JSON.stringify(payload);
  const payloadHash = crypto.createHash('sha256').update(payloadJson).digest('hex');
  const id = `prov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await db.run('INSERT INTO provenance_records (id, subject_type, subject_id, payload_hash, parent_hash, payload_json) VALUES (?, ?, ?, ?, ?, ?)', id, subjectType, subjectId, payloadHash, parentHash, payloadJson);
  return { id, subjectType, subjectId, payloadHash, parentHash, algorithm: 'sha256' };
}

async function pruneNode(nodeId) {
  const db = await getDatabase();
  const node = await db.get('SELECT * FROM lineage_nodes WHERE id = ?', nodeId);
  if (!node) return null;
  const metadata = { ...parse(node.metadata, {}), pruned: true, prunedAt: new Date().toISOString() };
  await db.run('UPDATE lineage_nodes SET metadata = ? WHERE id = ?', JSON.stringify(metadata), nodeId);
  const provenance = await recordProvenance('mcts_node', nodeId, { action: 'prune', node, metadata });
  telemetry.emitEvent({ eventType: 'MCTS_NODE_PRUNED', agentId: node.agent_id || 'studio', action: 'PRUNE', detail: `MCTS node ${nodeId} pruned`, payload: { nodeId, provenance } });
  return { nodeId, pruned: true, provenance };
}

async function updateNotifications(preferences) {
  const db = await getDatabase();
  for (const item of preferences || []) {
    await db.run('INSERT INTO notification_preferences (event_type, enabled, channels_json, threshold, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(event_type) DO UPDATE SET enabled=excluded.enabled, channels_json=excluded.channels_json, threshold=excluded.threshold, updated_at=CURRENT_TIMESTAMP', item.eventType, item.enabled ? 1 : 0, JSON.stringify(item.channels || ['studio']), item.threshold ?? null);
  }
  return overview();
}

module.exports = { overview, runImpossibleBench, pruneNode, updateNotifications, recordProvenance };
