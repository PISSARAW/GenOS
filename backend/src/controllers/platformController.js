const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');
const safety = require('../services/platformSafetyService');
const modelRouter = require('../services/modelRouter');
const modelProvider = require('../services/modelProvider');
const { resolveTenant } = require('../middleware/tenant');
const fs = require('fs');
const path = require('path');
const { boundedInteger } = require('./argumentBounds');
const { validateProviderEndpointAsync } = require('../services/providerEndpointPolicy');
const { normalizeCapabilities } = require('../services/modelCapabilities');
const workspaceController = require('./workspaceController');
const crypto = require('crypto');
const approvalPolicy = require('../services/platformApprovalPolicy');
const approvalStore = require('../services/platformApprovalStore');
const approvalExecution = require('../services/platformApprovalExecution');

function configProfileCapabilities(profile) {
  const advantages = profile.advantages || [];
  const disadvantages = profile.disadvantages || [];
  return [...advantages, ...disadvantages.map((item) => `not:${item}`)];
}

function configCatalogEntry(catalog, entry) {
  return {
    provider: catalog.format === 'ollama' ? 'ollama' : catalog.name.toLowerCase(),
    model: entry[0],
    capabilities: normalizeCapabilities(configProfileCapabilities(entry[1])),
    endpoint: catalog.chat_url || null,
    costInput: 0,
    costOutput: 0,
    latencyMs: 0,
    enabled: true,
    source: 'config/providers.json'
  };
}

function catalogProfilesOf(catalog) {
  return Object.entries(catalog.profiles || {}).map((entry) => configCatalogEntry(catalog, entry));
}

function configCatalogProfiles(catalogs) {
  return catalogs.flatMap((catalog) => catalogProfilesOf(catalog));
}

function stripCloudKey(profile) {
  const cleaned = { ...profile };
  delete cleaned.key;
  return { ...cleaned, costInput: 0, costOutput: 0, latencyMs: 0, endpoint: null, enabled: true, source: 'environment' };
}

function configuredCloudProfiles() {
  const candidates = [
    { provider: 'openai', model: process.env.OPENAI_MODEL || 'gpt-4o-mini', capabilities: ['reasoning', 'tools'], key: process.env.OPENAI_API_KEY || process.env.GENOS_MODEL_API_KEY },
    { provider: 'anthropic', model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet', capabilities: ['reasoning', 'tools', 'long-context'], key: process.env.ANTHROPIC_API_KEY },
    { provider: 'gemini', model: process.env.GEMINI_MODEL || 'gemini-1.5-flash', capabilities: ['reasoning', 'long-context'], key: process.env.GEMINI_API_KEY }
  ];
  return candidates.filter((profile) => profile.key).map(stripCloudKey);
}

function mergeCloudProfiles(configuredCatalog, cloudProfiles) {
  const missing = cloudProfiles.filter((cloud) => !configuredCatalog.some((entry) => entry.provider === cloud.provider && entry.model === cloud.model));
  return [...configuredCatalog, ...missing];
}

function catalogProviders() {
  const filePath = path.resolve(__dirname, '../../../config/providers.json');
  try {
    const catalogs = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return mergeCloudProfiles(configCatalogProfiles(catalogs), configuredCloudProfiles());
  } catch (_) { return []; }
}

function providerRows(rows) {
  if (rows.length) return rows.map((row) => {
    let capabilities = [];
    try { capabilities = normalizeCapabilities(JSON.parse(row.capabilities_json || '[]')); } catch (_) {}
    return { provider: row.provider, model: row.model, endpoint: row.endpoint || null, capabilities, costInput: row.cost_input, costOutput: row.cost_output, latencyMs: row.latency_ms, enabled: !!row.enabled };
  });
  return catalogProviders();
}

function configuredProviderRows(rows) {
  return rows.filter((row) => {
    try {
      const uri = `${row.provider}://${row.model}`;
      const configuration = modelProvider.modelConfiguration(uri, row.endpoint || undefined);
      return configuration.configured;
    } catch (_) {
      return false;
    }
  });
}

function validateProviderNumber(value, field, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0 || number > maximum) {
    const error = new Error(`${field} must be a finite non-negative number.`);
    error.code = 'INVALID_PROVIDER';
    throw error;
  }
  return number;
}

async function providers(req, res, next) {
  try {
    const db = await getDatabase();
    const rows = await db.all('SELECT * FROM provider_configs WHERE enabled = 1 ORDER BY provider, model');
    res.json(providerRows(rows));
  } catch (error) {
    if (next) return next(error);
    throw error;
  }
}
function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateProviderIdentity(provider) {
  if (!modelProvider.isSupportedProvider(provider.provider)) throw codedError('UNSUPPORTED_PROVIDER', `Provider '${provider.provider || ''}' is not supported by the model runtime.`);
  if (typeof provider.provider !== 'string' || !/^[a-z][a-z0-9-]{1,31}$/.test(provider.provider) || typeof provider.model !== 'string' || !/^[^\s/\\]{1,256}$/.test(provider.model)) throw codedError('INVALID_PROVIDER', 'provider and model must be valid non-empty identifiers.');
  if (!Array.isArray(provider.capabilities || []) || provider.capabilities.some((capability) => typeof capability !== 'string' || !normalizeCapabilities([capability]).length)) throw codedError('INVALID_CAPABILITIES', 'capabilities must be an array of non-empty strings.');
  return { ...provider, capabilities: normalizeCapabilities(provider.capabilities) };
}

async function validateProviderEconomics(provider) {
  let economics = null;
  try {
    economics = {
      costInput: validateProviderNumber(provider.costInput, 'costInput', 1_000_000),
      costOutput: validateProviderNumber(provider.costOutput, 'costOutput', 1_000_000),
      latencyMs: validateProviderNumber(provider.latencyMs, 'latencyMs', 86_400_000)
    };
  } catch (error) {
    throw codedError(error.code, error.message);
  }
  if (provider.endpoint) {
    try { await validateProviderEndpointAsync(provider.endpoint, { localOnly: ['ollama', 'lmstudio', 'vllm'].includes(provider.provider) }); } catch (error) { throw codedError('INVALID_ENDPOINT', error.message); }
  }
  return economics;
}

async function persistProviderConfig(db, provider, routePreview) {
  await db.run('INSERT OR REPLACE INTO provider_configs (id, provider, model, endpoint, capabilities_json, cost_input, cost_output, latency_ms, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', `${provider.provider}:${provider.model}`, provider.provider, provider.model, provider.endpoint || null, JSON.stringify(provider.capabilities), provider.costInput, provider.costOutput, provider.latencyMs, provider.enabled === false ? 0 : 1);
  return { success: true, provider: safety.normalizeProvider ? safety.normalizeProvider(provider) : provider, routePreview };
}

async function registerProvider(req, res, next) {
  try {
    const provider = validateProviderIdentity(req.body || {});
    const economics = await validateProviderEconomics(req.body || {});
    const complete = { ...provider, ...economics };
    const preview = safety.routeModel({ requiredCapabilities: [] }, [complete]);
    const db = await getDatabase();
    res.status(201).json(await persistProviderConfig(db, complete, preview));
  } catch (error) {
    if (error.code) return res.status(400).json({ error: { code: error.code, message: error.message } });
    if (next) return next(error);
    throw error;
  }
}
async function route(req, res, next) {
  try {
    const db = await getDatabase();
    const list = await db.all('SELECT provider, model, endpoint, capabilities_json AS capabilities, cost_input AS costInput, cost_output AS costOutput, latency_ms AS latencyMs, enabled FROM provider_configs WHERE enabled = 1');
    const parsed = list.length ? list.map((p) => ({ ...p, capabilities: JSON.parse(p.capabilities || '[]') })) : catalogProviders();
    const configured = configuredProviderRows(parsed);
    if (!configured.length) return res.status(503).json({ error: { code: 'MODEL_PROVIDER_UNAVAILABLE', message: 'No enabled provider with valid runtime configuration is available for routing.' } });
    res.json(safety.routeModel(req.body, configured));
  } catch (error) {
    if (next) return next(error);
    throw error;
  }
}
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
function routingPlanFrom(body) {
  const input = body || {};
  const policy = modelRouter.policyFrom(input.policy || input);
  const candidates = modelRouter.candidateModels(null, policy);
  if (!candidates.length) throw codedError('MODEL_ROUTE_REQUIRED', 'A primary model or fallback route is required.');
  candidates.forEach((uri) => modelProvider.configuredModel(uri));
  return { policy, candidates };
}

function tenantScopeIds(tenant) {
  if (!tenant) return { organizationId: null, projectId: null };
  return { organizationId: tenant.organizationId, projectId: tenant.projectId };
}

async function persistRoutingPolicy(db, agentId, request) {
  const scope = request.scope;
  const route = request.route;
  const id = `model-route:${scope.organizationId || 'global'}:${scope.projectId || 'global'}:${agentId}`;
  await db.run('INSERT OR REPLACE INTO agent_model_routing_policies(id, agent_id, policy_json, organization_id, project_id, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)', id, agentId, JSON.stringify(route.policy), scope.organizationId, scope.projectId);
  telemetry.emitEvent({ eventType: 'MODEL_ROUTING_POLICY_UPDATED', agentId, action: 'MODEL_ROUTE_POLICY', detail: `Updated model routing policy for ${agentId}.`, payload: { agentId, policy: route.policy, organizationId: scope.organizationId, projectId: scope.projectId } });
  return { success: true, agentId, policy: route.policy, candidates: route.candidates };
}

async function saveRoutingPolicy(req, res, next) {
  try {
    const agentId = String(req.params.agentId || '').trim();
    if (!agentId) return res.status(400).json({ error: { code: 'AGENT_REQUIRED', message: 'agentId is required.' } });
    let route = null;
    try { route = routingPlanFrom(req.body); }
    catch (error) { return res.status(400).json({ error: { code: error.code || 'INVALID_MODEL_ROUTE', message: error.message } }); }
    const tenant = await resolveTenant(req);
    if ((req.headers['x-organization-id'] || req.headers['x-project-id']) && !tenant) return res.status(403).json({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'A valid organization and project scope is required.' } });
    const db = await getDatabase();
    res.status(201).json(await persistRoutingPolicy(db, agentId, { route, scope: tenantScopeIds(tenant) }));
  } catch (error) { next(error); }
}
async function graph(req, res, next) {
  try {
    const db = await getDatabase();
    const scope = req.tenant;
    let [nodes, edges] = await Promise.all([
      db.all('SELECT n.id,n.label,n.node_type,n.score,n.visits,n.state_summary,n.agent_id FROM lineage_nodes n JOIN workspaces w ON w.id = n.workspace_id WHERE w.organization_id = ? AND w.project_id = ? ORDER BY n.created_at', scope.organizationId, scope.projectId),
      db.all('SELECT e.id,e.source_node_id AS source,e.target_node_id AS target,e.edge_type AS type FROM lineage_edges e JOIN workspaces w ON w.id = e.workspace_id WHERE w.organization_id = ? AND w.project_id = ? ORDER BY e.created_at', scope.organizationId, scope.projectId)
    ]);
    // A fresh runtime may not have emitted lineage rows yet. Agents are still a
    // valid causal source, so expose their parent relationships immediately.
    if (!nodes.length) {
      const agents = await db.all('SELECT a.id,a.name,a.role,a.status,a.parent_agent_id,a.current_task FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE w.organization_id = ? AND w.project_id = ? ORDER BY a.created_at', scope.organizationId, scope.projectId);
      nodes = agents.map(a => ({ id: a.id, label: a.name, node_type: 'agent', status: a.status, state_summary: a.current_task || a.role, agent_id: a.id }));
      edges = agents.filter(a => a.parent_agent_id).map((a, i) => ({ id: `agent-edge-${i}`, source: a.parent_agent_id, target: a.id, type: 'parent' }));
    }
    res.json({ nodes, edges, generatedAt: new Date().toISOString() });
  } catch (error) {
    if (next) return next(error);
    throw error;
  }
}
async function telemetrySummary(req, res, next) {
  try {
    const db = await getDatabase();
    const rows = await db.all('SELECT agent_id, json_extract(payload_json, "$.model") model, COUNT(*) events, SUM(COALESCE(json_extract(payload_json, "$.tokens"),0)) tokens, SUM(COALESCE(json_extract(payload_json, "$.costUsd"),0)) costUsd, AVG(COALESCE(json_extract(payload_json, "$.latencyMs"),0)) latencyMs FROM telemetry_events WHERE organization_id = ? AND project_id = ? GROUP BY agent_id, model ORDER BY costUsd DESC', req.tenant.organizationId, req.tenant.projectId);
    res.json({ byAgent: rows, totals: rows.reduce((a, r) => ({ events: a.events + r.events, tokens: a.tokens + (r.tokens || 0), costUsd: a.costUsd + (r.costUsd || 0) }), { events: 0, tokens: 0, costUsd: 0 }), window: req.query.window || 'all' });
  } catch (error) {
    if (next) return next(error);
    throw error;
  }
}
async function audit(req, res, next) {
  try {
    const db = await getDatabase();
    if (!req.tenant) return res.status(400).json({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'A tenant scope is required for audit records.' } });
    res.json(await db.all('SELECT * FROM audit_logs WHERE organization_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT ?', req.tenant.organizationId, req.tenant.projectId, boundedInteger(req.query.limit, 100, 1, 500)));
  } catch (error) {
    if (next) return next(error);
    throw error;
  }
}
async function permissions(req, res, next) {
  try {
    const db = await getDatabase();
    if (req.method === 'GET') return res.json(await db.all('SELECT agent_id, permissions_json AS permissions, denied_tools_json AS deniedTools, taint_policy AS taintPolicy FROM agent_permissions'));
    const { agentId, permissions = [], deniedTools = [], taintPolicy = 'block_external' } = req.body || {};
    if (!agentId) return res.status(400).json({ error: { code: 'INVALID_AGENT', message: 'agentId is required' } });
    await db.run('INSERT OR REPLACE INTO agent_permissions (agent_id, permissions_json, denied_tools_json, taint_policy) VALUES (?, ?, ?, ?)', agentId, JSON.stringify(permissions), JSON.stringify(deniedTools), taintPolicy);
    res.status(201).json({ success: true, agentId, permissions, deniedTools, taintPolicy });
  } catch (error) {
    if (next) return next(error);
    throw error;
  }
}
async function agentToolPermissions(db, agentId, tenant) {
  const row = await db.get('SELECT * FROM agent_permissions WHERE agent_id = ? AND organization_id = ? AND project_id = ?', agentId, tenant.organizationId, tenant.projectId);
  if (!row) return { permissions: [], deniedTools: [] };
  return { permissions: JSON.parse(row.permissions_json), deniedTools: JSON.parse(row.denied_tools_json) };
}

async function evaluateAgentToolCall(db, input, tenant) {
  const granted = await agentToolPermissions(db, input.agentId, tenant);
  return safety.validateToolCall({
    agentId: input.agentId,
    toolName: input.toolName,
    args: input.args,
    taints: input.taints || [],
    permissions: granted.permissions,
    deniedTools: granted.deniedTools
  });
}

async function auditToolValidation(db, record, req) {
  const input = record.input;
  const result = record.result;
  await db.run(
    'INSERT INTO audit_logs (actor,agent_id,action,resource,decision,reason,payload_json,organization_id,project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    approvalPolicy.resolveActorIdentity(req.user, 'platform'),
    input.agentId,
    'TOOL_CALL_VALIDATE',
    input.toolName,
    result.decision,
    result.reason,
    JSON.stringify(result),
    req.tenant.organizationId,
    req.tenant.projectId
  );
}

async function validateTool(req, res, next) {
  try {
    const db = await getDatabase();
    const input = req.body || {};
    const result = await evaluateAgentToolCall(db, input, req.tenant);
    await auditToolValidation(db, { input, result }, req);
    res.status(result.decision === 'deny' ? 403 : 200).json(result);
  } catch (error) {
    if (next) return next(error);
    throw error;
  }
}
async function replay(req, res, next) {
  try {
    const db = await getDatabase();
    const { incidentId } = req.params;
    const incident = await db.get('SELECT id FROM global_alerts WHERE id = ? AND organization_id = ? AND project_id = ?', incidentId, req.tenant.organizationId, req.tenant.projectId);
    if (!incident) return res.status(404).json({ error: { code: 'INCIDENT_NOT_FOUND', message: `Incident '${incidentId}' was not found in the current project.` } });
    const events = await db.all('SELECT * FROM telemetry_events WHERE organization_id = ? AND project_id = ? ORDER BY created_at ASC LIMIT 10000', req.tenant.organizationId, req.tenant.projectId);
    const result = safety.buildReplay(incidentId, events, req.body?.stepSpeed);
    telemetry.emitEvent({ eventType: 'INCIDENT_REPLAY_STARTED', agentId: req.user?.username || 'platform', action: 'REPLAY', detail: `Replay ${incidentId}`, payload: { ...result, organizationId: req.tenant.organizationId, projectId: req.tenant.projectId } });
    res.json(result);
  } catch (error) {
    if (next) return next(error);
    throw error;
  }
}
async function bisect(req, res, next) { return workspaceController.bisect(req, res, next); }
async function approvals(req, res, next) {
  try {
    const db = await getDatabase();
    if (req.method === 'GET') return res.json(await approvalStore.listApprovals(db, req.tenant));
    const created = await approvalStore.createApproval(db, {
      body: req.body || {},
      requestedBy: approvalPolicy.resolveActorIdentity(req.user, 'platform'),
      scope: req.tenant
    });
    res.status(201).json(created);
  } catch (error) {
    if (next) return next(error);
    throw error;
  }
}
async function decideApproval(req, res, next) {
  try {
    const db = await getDatabase();
    const approval = await approvalStore.findApproval(db, req.params.id, req.tenant);
    if (!approval) return res.status(404).json({ error: { code: 'APPROVAL_NOT_FOUND', message: `Approval '${req.params.id}' was not found.` } });
    if (approval.status !== 'pending') return res.status(409).json({ error: { code: 'APPROVAL_ALREADY_DECIDED', message: `Approval '${req.params.id}' is already ${approval.status}.` } });
    const decisionBy = approvalPolicy.resolveActorIdentity(req.user, 'platform');
    if (approval.requested_by === decisionBy || approvalPolicy.isSelfApproval(approval.requested_by, req.user)) return res.status(409).json({ error: { code: 'APPROVAL_SEPARATION_REQUIRED', message: 'The requester cannot approve the same action.' } });
    const payloadHash = crypto.createHash('sha256').update(approvalPolicy.payloadText(approval.payload_json)).digest('hex');
    const currentPayloadHash = payloadHash;
    if (approval.payload_hash && approval.payload_hash !== currentPayloadHash) return res.status(409).json({ error: { code: 'APPROVAL_PAYLOAD_TAMPERED', message: 'Approval payload integrity verification failed.' } });
    const decision = approvalPolicy.parseDecision(req.body);
    const claimed = await approvalStore.claimApproval(db, {
      id: req.params.id,
      organizationId: req.tenant.organizationId,
      projectId: req.tenant.projectId,
      status: decision.status,
      decisionBy,
      reason: decision.reason,
      payloadHash
    });
    if (!claimed) return res.status(409).json({ error: { code: 'APPROVAL_ALREADY_DECIDED', message: `Approval '${req.params.id}' was decided concurrently.` } });
    await approvalStore.recordDecisionAudit(db, {
      actor: decisionBy,
      approvalId: req.params.id,
      status: decision.status,
      reason: decision.reason,
      organizationId: req.tenant.organizationId,
      projectId: req.tenant.projectId
    });
    const execution = await approvalExecution.executeApprovedAction(db, approval, { status: decision.status, actor: decisionBy });
    if (approvalPolicy.isTamperBlocked(execution)) return res.status(409).json({ error: { code: execution.code, message: execution.error } });
    res.json({ success: true, id: req.params.id, status: decision.status, execution });
  } catch (error) { next(error); }
}
async function pareto(req, res, next) {
  try {
    res.json(safety.paretoFrontier(req.body?.items || []));
  } catch (error) {
    if (next) return next(error);
    throw error;
  }
}
module.exports = { providers, registerProvider, route, routingPolicies, saveRoutingPolicy, graph, telemetrySummary, audit, permissions, validateTool, replay, bisect, approvals, decideApproval, pareto, configuredProviderRows, catalogProviders };
