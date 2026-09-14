function tenantValue(req, key, fallback) {
  const tenant = req.tenant || {};
  return tenant[key] || fallback || null;
}

async function applyAgentState(ctx, agent) {
  const a = agent;
  await ctx.db.run(`UPDATE agents SET name = ?, name_meaning = ?, role = ?, model_tier = ?, language = ?, isolation_mode = ?, status = ?, current_task = ?, dissonance_level = ?, eureka_count = ?, cognitive_budget = ?, cognitive_baseline_budget = ?, cognitive_max_dissonance = ?, is_apoptotic = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, a.name, a.name_meaning, a.role, a.model_tier, a.language, a.isolation_mode, a.status, a.current_task, a.dissonance_level || 0, a.eureka_count || 0, a.cognitive_budget ?? 0, a.cognitive_baseline_budget ?? 0, a.cognitive_max_dissonance ?? 50, a.is_apoptotic || 0, ctx.targetAgentId);
}

async function applyDecisionState(ctx, state) {
  for (const item of state.decisions || []) {
    const id = `agent-git-decision-${ctx.targetAgentId}-${item.id}`;
    await ctx.db.run(`INSERT OR REPLACE INTO genome_decisions (id, title, content, cart_nodes_json, created_by, category, synaptic_weight, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, item.title, item.content, item.cart_nodes_json || '[]', ctx.targetAgentId, item.category, item.synaptic_weight || 1, tenantValue(ctx.req, 'organizationId', item.organization_id), tenantValue(ctx.req, 'projectId', item.project_id));
  }
}

async function applyMemoryState(ctx, state) {
  for (const memory of state.memories || []) {
    const id = `agent-git-memory-${ctx.targetAgentId}-${memory.id}`;
    await ctx.db.run(`INSERT OR IGNORE INTO episodic_memories (id, agent_id, session_id, task_id, turn_number, action_type, context_state, action_input, observation_output, reward_score, is_consolidated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, ctx.targetAgentId, memory.session_id, memory.task_id, memory.turn_number || 0, memory.action_type, memory.context_state || '{}', memory.action_input, memory.observation_output, memory.reward_score || 0, memory.is_consolidated || 0);
  }
}

async function applyRunState(ctx, state) {
  for (const run of state.runs || []) {
    const id = `agent-git-run-${ctx.targetAgentId}-${run.id}`;
    await ctx.db.run(`INSERT OR IGNORE INTO strategy_execution_runs (id, agent_id, contract_id, contract_version, status, budget_json, metrics_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, ctx.targetAgentId, run.contract_id, run.contract_version, run.status, run.budget_json || '{}', run.metrics_json || '{}', run.created_at);
  }
}

async function applyPlasmidState(ctx, state) {
  for (const plasmid of state.plasmids || []) {
    await ctx.db.run(`INSERT OR REPLACE INTO plasmid_bindings (plasmid_id, owner_agent_id, source_agent_id, organization_id, project_id, status) VALUES (?, ?, ?, ?, ?, ?)`, plasmid.plasmid_id, ctx.targetAgentId, plasmid.source_agent_id, tenantValue(ctx.req, 'organizationId', plasmid.organization_id), tenantValue(ctx.req, 'projectId', plasmid.project_id), plasmid.status || 'active');
  }
}

async function applyPermissionState(ctx, state) {
  for (const permission of state.permissions || []) {
    await ctx.db.run(`INSERT OR REPLACE INTO agent_permissions (agent_id, permissions_json, denied_tools_json, organization_id, project_id) VALUES (?, ?, ?, ?, ?)`, ctx.targetAgentId, permission.permissions_json || '[]', permission.denied_tools_json || '[]', tenantValue(ctx.req, 'organizationId', permission.organization_id), tenantValue(ctx.req, 'projectId', permission.project_id));
  }
}

async function applyState(..._args) {
  const [db, req, targetAgentId, state, sections] = _args;
  const { loadAgent } = require('./index');
  const target = await loadAgent(db, req, targetAgentId);
  if (!target) throw Object.assign(new Error('Target agent is not available in the current tenant.'), { code: 'AGENT_NOT_FOUND' });
  const selected = new Set(sections || ['agent', 'decisions', 'memories', 'runs', 'plasmids', 'permissions']);
  const ctx = { db, req, targetAgentId };
  if (selected.has('agent')) await applyAgentState(ctx, state.agent);
  if (selected.has('decisions')) await applyDecisionState(ctx, state);
  if (selected.has('memories')) await applyMemoryState(ctx, state);
  if (selected.has('runs')) await applyRunState(ctx, state);
  if (selected.has('plasmids')) await applyPlasmidState(ctx, state);
  if (selected.has('permissions')) await applyPermissionState(ctx, state);
  return { targetAgentId, sections: [...selected] };
}

module.exports = { applyState };
