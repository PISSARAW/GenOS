const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');
const safety = require('../services/platformSafetyService');
const modelRouter = require('../services/modelRouter');
const modelProvider = require('../services/modelProvider');
const { resolveTenant } = require('../middleware/tenant');

async function providers(req, res) {
  const db = await getDatabase();
  const rows = await db.all('SELECT * FROM provider_configs WHERE enabled = 1 ORDER BY provider, model');
  if (!rows.length) return res.json([]);
  res.json(rows.map(r => ({ provider: r.provider, model: r.model, capabilities: JSON.parse(r.capabilities_json || '[]'), costInput: r.cost_input, costOutput: r.cost_output, latencyMs: r.latency_ms, enabled: !!r.enabled })));
}
async function registerProvider(req, res) {
  const p = safety.routeModel({ requiredCapabilities: [] }, [req.body]);
  const provider = req.body || {};
  if (!provider.provider || !provider.model) return res.status(400).json({ error: { code: 'INVALID_PROVIDER', message: 'provider and model are required' } });
  const db = await getDatabase();
  await db.run('INSERT OR REPLACE INTO provider_configs (id, provider, model, endpoint, capabilities_json, cost_input, cost_output, latency_ms, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', `${provider.provider}:${provider.model}`, provider.provider, provider.model, provider.endpoint || null, JSON.stringify(provider.capabilities || []), provider.costInput || 0, provider.costOutput || 0, provider.latencyMs || 0, provider.enabled === false ? 0 : 1);
  res.status(201).json({ success: true, provider: safety.normalizeProvider ? safety.normalizeProvider(provider) : provider, routePreview: p });
}
async function route(req, res) { const db = await getDatabase(); const list = await db.all('SELECT provider, model, capabilities_json AS capabilities, cost_input AS costInput, cost_output AS costOutput, latency_ms AS latencyMs, enabled FROM provider_configs WHERE enabled = 1'); if (!list.length) return res.status(503).json({ error: { code: 'MODEL_PROVIDER_UNAVAILABLE', message: 'No enabled provider configuration is registered for routing.' } }); const parsed = list.map(p => ({ ...p, capabilities: JSON.parse(p.capabilities || '[]') })); res.json(safety.routeModel(req.body, parsed)); }
async function routingPolicies(req, res, next) {
  try {
    const db = await getDatabase();
    const tenant = await resolveTenant(req);
    if ((req.headers['x-organization-id'] || req.headers['x-project-id']) && !tenant) return res.status(403).json({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'A valid organization and project scope is required.' } });
    const rows = tenant
      ? await db.all('SELECT * FROM agent_model_routing_policies WHERE organization_id = ? AND project_id = ? ORDER BY agent_id', tenant.organizationId, tenant.projectId)
      : await db.all('SELECT * FROM agent_model_routing_policies WHERE organization_id IS NULL AND project_id IS NULL ORDER BY agent_id');
    res.json(rows.map((row) => ({ agentId: row.agent_id, policy: JSON.parse(row.policy_json || '{}'), updatedAt: row.updated_at })));
  } catch (error) { next(error); }
}
async function saveRoutingPolicy(req, res, next) {
  try {
    const agentId = String(req.params.agentId || '').trim();
    if (!agentId) return res.status(400).json({ error: { code: 'AGENT_REQUIRED', message: 'agentId is required.' } });
    const policy = modelRouter.policyFrom(req.body?.policy || req.body || {});
    const candidates = modelRouter.candidateModels(null, policy);
    if (!candidates.length) return res.status(400).json({ error: { code: 'MODEL_ROUTE_REQUIRED', message: 'A primary model or fallback route is required.' } });
    candidates.forEach((uri) => modelProvider.configuredModel(uri));
    const tenant = await resolveTenant(req);
    if ((req.headers['x-organization-id'] || req.headers['x-project-id']) && !tenant) return res.status(403).json({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'A valid organization and project scope is required.' } });
    const organizationId = tenant?.organizationId || null; const projectId = tenant?.projectId || null;
    const id = `model-route:${organizationId || 'global'}:${projectId || 'global'}:${agentId}`;
    const db = await getDatabase();
    await db.run('INSERT OR REPLACE INTO agent_model_routing_policies(id, agent_id, policy_json, organization_id, project_id, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)', id, agentId, JSON.stringify(policy), organizationId, projectId);
    telemetry.emitEvent({ eventType: 'MODEL_ROUTING_POLICY_UPDATED', agentId, action: 'MODEL_ROUTE_POLICY', detail: `Updated model routing policy for ${agentId}.`, payload: { agentId, policy, organizationId, projectId } });
    res.status(201).json({ success: true, agentId, policy, candidates });
  } catch (error) { next(error); }
}
async function graph(req, res) {
  const db = await getDatabase();
  let [nodes, edges] = await Promise.all([
    db.all('SELECT id,label,node_type,score,visits,state_summary,agent_id FROM lineage_nodes ORDER BY created_at'),
    db.all('SELECT id,source_node_id AS source,target_node_id AS target,edge_type AS type FROM lineage_edges ORDER BY created_at')
  ]);
  // A fresh runtime may not have emitted lineage rows yet. Agents are still a
  // valid causal source, so expose their parent relationships immediately.
  if (!nodes.length) {
    const agents = await db.all('SELECT id,name,role,status,parent_agent_id,current_task FROM agents ORDER BY created_at');
    nodes = agents.map(a => ({ id: a.id, label: a.name, node_type: 'agent', status: a.status, state_summary: a.current_task || a.role, agent_id: a.id }));
    edges = agents.filter(a => a.parent_agent_id).map((a, i) => ({ id: `agent-edge-${i}`, source: a.parent_agent_id, target: a.id, type: 'parent' }));
  }
  res.json({ nodes, edges, generatedAt: new Date().toISOString() });
}
async function telemetrySummary(req, res) { const db = await getDatabase(); const rows = await db.all('SELECT agent_id, json_extract(payload_json, "$.model") model, COUNT(*) events, SUM(COALESCE(json_extract(payload_json, "$.tokens"),0)) tokens, SUM(COALESCE(json_extract(payload_json, "$.costUsd"),0)) costUsd, AVG(COALESCE(json_extract(payload_json, "$.latencyMs"),0)) latencyMs FROM telemetry_events GROUP BY agent_id, model ORDER BY costUsd DESC'); res.json({ byAgent: rows, totals: rows.reduce((a, r) => ({ events: a.events + r.events, tokens: a.tokens + (r.tokens || 0), costUsd: a.costUsd + (r.costUsd || 0) }), { events: 0, tokens: 0, costUsd: 0 }), window: req.query.window || 'all' }); }
async function audit(req, res) { const db = await getDatabase(); res.json(await db.all('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?', Number(req.query.limit) || 100)); }
async function permissions(req, res) { const db = await getDatabase(); if (req.method === 'GET') return res.json(await db.all('SELECT agent_id, permissions_json AS permissions, denied_tools_json AS deniedTools, taint_policy AS taintPolicy FROM agent_permissions')); const { agentId, permissions = [], deniedTools = [], taintPolicy = 'block_external' } = req.body || {}; if (!agentId) return res.status(400).json({ error: { code: 'INVALID_AGENT', message: 'agentId is required' } }); await db.run('INSERT OR REPLACE INTO agent_permissions VALUES (?, ?, ?, ?)', agentId, JSON.stringify(permissions), JSON.stringify(deniedTools), taintPolicy); res.status(201).json({ success: true, agentId, permissions, deniedTools, taintPolicy }); }
async function validateTool(req, res) { const db = await getDatabase(); const { agentId, toolName, args, taints = [] } = req.body || {}; const row = await db.get('SELECT * FROM agent_permissions WHERE agent_id = ?', agentId); const result = safety.validateToolCall({ agentId, toolName, args, taints, permissions: row ? JSON.parse(row.permissions_json) : [], deniedTools: row ? JSON.parse(row.denied_tools_json) : [] }); await db.run('INSERT INTO audit_logs (actor,agent_id,action,resource,decision,reason,payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)', req.user?.username || 'platform', agentId, 'TOOL_CALL_VALIDATE', toolName, result.decision, result.reason, JSON.stringify(result)); res.status(result.decision === 'deny' ? 403 : 200).json(result); }
async function replay(req, res) { const db = await getDatabase(); const { incidentId } = req.params; const events = await db.all('SELECT * FROM telemetry_events ORDER BY created_at ASC'); const result = safety.buildReplay(incidentId, events, req.body?.stepSpeed); telemetry.emitEvent({ eventType: 'INCIDENT_REPLAY_STARTED', agentId: req.user?.username || 'platform', action: 'REPLAY', detail: `Replay ${incidentId}`, payload: result }); res.json(result); }
async function bisect(req, res) { return res.status(501).json({ error: { code: 'BISECTION_RUNNER_UNAVAILABLE', message: 'Platform bisection is unavailable because this backend cannot execute tests against durable workspace revisions.' } }); }
async function approvals(req, res) { const db = await getDatabase(); if (req.method === 'GET') return res.json(await db.all('SELECT * FROM platform_approvals ORDER BY created_at DESC')); const body = req.body || {}; const id = `approval-${Date.now()}-${Math.random().toString(36).slice(2,7)}`; await db.run('INSERT INTO platform_approvals (id,action,agent_id,risk,uncertainty,requested_by,payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)', id, body.action || 'unknown', body.agentId || null, body.risk || 'high', Number(body.uncertainty || 0), req.user?.username || 'platform', JSON.stringify(body)); res.status(201).json({ id, status: 'pending', ...body }); }
async function decideApproval(req, res) { const db = await getDatabase(); const status = req.body?.decision === 'approve' ? 'approved' : 'rejected'; await db.run('UPDATE platform_approvals SET status=?, decision_by=?, reason=?, decided_at=CURRENT_TIMESTAMP WHERE id=?', status, req.user?.username || 'platform', req.body?.reason || null, req.params.id); await db.run('INSERT INTO audit_logs (actor,action,resource,decision,reason) VALUES (?, ?, ?, ?, ?)', req.user?.username || 'platform', 'APPROVAL_DECISION', req.params.id, status, req.body?.reason || 'operator decision'); res.json({ success: true, id: req.params.id, status }); }
async function pareto(req, res) { res.json(safety.paretoFrontier(req.body?.items || [])); }
module.exports = { providers, registerProvider, route, routingPolicies, saveRoutingPolicy, graph, telemetrySummary, audit, permissions, validateTool, replay, bisect, approvals, decideApproval, pareto };
