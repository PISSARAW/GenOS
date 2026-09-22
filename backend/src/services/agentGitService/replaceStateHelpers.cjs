'use strict';

function tenantValue(req, key, fallback) {
  const tenant = req.tenant || {};
  return tenant[key] || fallback || null;
}

async function replaceAgentState(ctx, targetAgentId, agent) {
  const { db } = ctx;
  await db.run(`UPDATE agents SET name = ?, name_meaning = ?, role = ?, model_tier = ?, language = ?, isolation_mode = ?, status = ?, current_task = ?, dissonance_level = ?, eureka_count = ?, cognitive_budget = ?, cognitive_baseline_budget = ?, cognitive_max_dissonance = ?, is_apoptotic = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    agent.name, agent.name_meaning, agent.role, agent.model_tier, agent.language, agent.isolation_mode, agent.status, agent.current_task, agent.dissonance_level || 0, agent.eureka_count || 0, agent.cognitive_budget ?? 0, agent.cognitive_baseline_budget ?? 0, agent.cognitive_max_dissonance ?? 50, agent.is_apoptotic || 0, targetAgentId);
}

async function replaceDecisionState(ctx, targetAgentId, decisions) {
  const { db, req } = ctx;
  await db.run('DELETE FROM genome_decisions WHERE created_by = ?', targetAgentId);
  for (const item of decisions || []) {
    const id = `agent-git-decision-${targetAgentId}-${item.id}`;
    await db.run(`INSERT INTO genome_decisions (id, title, content, cart_nodes_json, created_by, category, synaptic_weight, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, item.title, item.content, item.cart_nodes_json || '[]', targetAgentId, item.category, item.synaptic_weight || 1, tenantValue(req, 'organizationId', item.organization_id), tenantValue(req, 'projectId', item.project_id));
  }
}

async function replaceMemoryState(ctx, targetAgentId, memories) {
  const { db } = ctx;
  await db.run('DELETE FROM episodic_memories WHERE agent_id = ?', targetAgentId);
  for (const m of memories || []) {
    const id = `agent-git-memory-${targetAgentId}-${m.id}`;
    await db.run(`INSERT INTO episodic_memories (id, agent_id, session_id, task_id, turn_number, action_type, context_state, action_input, observation_output, reward_score, is_consolidated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, targetAgentId, m.session_id, m.task_id, m.turn_number || 0, m.action_type, m.context_state || '{}', m.action_input, m.observation_output, m.reward_score || 0, m.is_consolidated || 0);
  }
}

async function replaceRunState(ctx, targetAgentId, runs) {
  const { db } = ctx;
  await db.run('DELETE FROM strategy_execution_runs WHERE agent_id = ?', targetAgentId);
  for (const r of runs || []) {
    const id = `agent-git-run-${targetAgentId}-${r.id}`;
    await db.run(`INSERT INTO strategy_execution_runs (id, agent_id, contract_id, contract_version, status, budget_json, metrics_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, targetAgentId, r.contract_id, r.contract_version, r.status, r.budget_json || '{}', r.metrics_json || '{}', r.created_at);
  }
}

async function replacePlasmidState(ctx, targetAgentId, plasmids) {
  const { db, req } = ctx;
  await db.run('DELETE FROM plasmid_bindings WHERE owner_agent_id = ?', targetAgentId);
  for (const p of plasmids || []) {
    await db.run(`INSERT INTO plasmid_bindings (plasmid_id, owner_agent_id, source_agent_id, organization_id, project_id, status) VALUES (?, ?, ?, ?, ?, ?)`, p.plasmid_id, targetAgentId, p.source_agent_id, tenantValue(req, 'organizationId', p.organization_id), tenantValue(req, 'projectId', p.project_id), p.status || 'active');
  }
}

async function replacePermissionState(ctx, targetAgentId, permissions) {
  const { db, req } = ctx;
  await db.run('DELETE FROM agent_permissions WHERE agent_id = ?', targetAgentId);
  for (const p of permissions || []) {
    await db.run(`INSERT INTO agent_permissions (agent_id, permissions_json, denied_tools_json, organization_id, project_id) VALUES (?, ?, ?, ?, ?)`, targetAgentId, p.permissions_json || '[]', p.denied_tools_json || '[]', tenantValue(req, 'organizationId', p.organization_id), tenantValue(req, 'projectId', p.project_id));
  }
}

module.exports = { replaceAgentState, replaceDecisionState, replaceMemoryState, replaceRunState, replacePlasmidState, replacePermissionState };
