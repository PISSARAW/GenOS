/**
 * MCP Tools Seed Definitions
 */

const MCP_TOOLS_LIST = [
  // Workspace Control
  { name: 'genos_create', cat: 'Workspace Control', risk: 'Amber', desc: 'Creates isolated branch workspace' },
  { name: 'genos_snapshot', cat: 'Workspace Control', risk: 'Low', desc: 'Captures full workspace timeline snapshot' },
  { name: 'genos_restore', cat: 'Workspace Control', risk: 'High', desc: 'Destructive rollback to prior snapshot' },
  { name: 'genos_fork', cat: 'Workspace Control', risk: 'Amber', desc: 'Forks workspace into parallel universe' },
  { name: 'genos_run', cat: 'Workspace Control', risk: 'High', desc: 'Executes sandboxed terminal commands' },
  { name: 'genos_inspect', cat: 'Workspace Control', risk: 'Low', desc: 'Inspects file AST and workspace state' },
  { name: 'genos_diff', cat: 'Workspace Control', risk: 'Low', desc: 'Calculates structural diffs between snapshots' },
  { name: 'genos_lineage', cat: 'Workspace Control', risk: 'Low', desc: 'Extracts full MCTS DAG lineage tree' },
  { name: 'genos_replay', cat: 'Workspace Control', risk: 'Low', desc: 'Step-by-step causal replay traversal' },
  { name: 'genos_merge', cat: 'Workspace Control', risk: 'High', desc: 'Merges parallel universe branch into master' },

  // Experimental Labs
  { name: 'genos_workspace_experiment', cat: 'Experimental Labs', risk: 'Amber', desc: 'Runs hypothesis testing in workspace' },
  { name: 'genos_causal_replay_experiment', cat: 'Experimental Labs', risk: 'Low', desc: 'Causal counterfactual incident replay' },
  { name: 'genos_incident_experiment', cat: 'Experimental Labs', risk: 'Amber', desc: 'Simulates fault injection and recovery' },
  { name: 'genos_scientific_experiment', cat: 'Experimental Labs', risk: 'Amber', desc: 'Executes scientific experiment protocols' },
  { name: 'genos_security_coevolution', cat: 'Experimental Labs', risk: 'High', desc: 'Red vs Blue adversarial security simulation' },
  { name: 'genos_bug_investigation', cat: 'Experimental Labs', risk: 'Low', desc: 'Automated root-cause fault localization' },
  { name: 'genos_diagnose', cat: 'Experimental Labs', risk: 'Low', desc: 'Diagnostic health and latency analysis' },
  { name: 'genos_hypothesis_evidence', cat: 'Experimental Labs', risk: 'Low', desc: 'Attaches evidence to causal hypotheses' },
  { name: 'genos_solve', cat: 'Experimental Labs', risk: 'Amber', desc: 'Synthesizes verified algorithmic solutions' },
  { name: 'genos_evaluate_trajectories', cat: 'Experimental Labs', risk: 'Low', desc: 'Evaluates candidate code trajectory scores' },

  // Knowledge & Experience
  { name: 'genos_record_decision', cat: 'Knowledge & Experience', risk: 'Low', desc: 'Persists architectural decision records' },
  { name: 'genos_blame', cat: 'Knowledge & Experience', risk: 'Low', desc: 'Performs semantic blame analysis on faults' },
  { name: 'genos_invalidate_assumption', cat: 'Knowledge & Experience', risk: 'Amber', desc: 'Invalidates stale architectural axioms' },
  { name: 'genos_record_experience', cat: 'Knowledge & Experience', risk: 'Low', desc: 'Encodes episodic memory trajectory' },
  { name: 'genos_search_failures', cat: 'Knowledge & Experience', risk: 'Low', desc: 'Searches historical failure taxonomy' },
  { name: 'genos_cherry_pick_experience', cat: 'Knowledge & Experience', risk: 'Low', desc: 'Transfers learned heuristics across swarms' },
  { name: 'genos_adversarial_review', cat: 'Knowledge & Experience', risk: 'Low', desc: 'Performs CVE and logic vulnerability scan' },
  { name: 'genos_future_ci', cat: 'Knowledge & Experience', risk: 'Low', desc: 'Simulates forward CI impact of changes' },
  { name: 'genos_repository_genome', cat: 'Knowledge & Experience', risk: 'Low', desc: 'Synthesizes structural repository graph' },
  { name: 'genos_bisect_agent', cat: 'Knowledge & Experience', risk: 'Low', desc: 'Binary search agent decisions for regressions' },
  { name: 'genos_analyze_trajectory', cat: 'Knowledge & Experience', risk: 'Low', desc: 'Deep AST inspect of trajectory code' },
  { name: 'genos_compile_memory', cat: 'Knowledge & Experience', risk: 'Amber', desc: 'Distills episodic memory into concise rules' },

  // Resilience & Biomimicry
  { name: 'genos_resilience_apoptosis', cat: 'Resilience & Security', risk: 'High', desc: 'Programmed self-termination of runaway nodes' },
  { name: 'genos_resilience_cryptobiosis', cat: 'Resilience & Security', risk: 'High', desc: 'State freeze and memory hibernation' },
  { name: 'genos_resilience_hypermutation', cat: 'Resilience & Security', risk: 'High', desc: 'Accelerated genetic prompt mutation' },
  { name: 'genos_resilience_circuit_breaker', cat: 'Resilience & Security', risk: 'High', desc: 'Manual trip or reset of tool circuit breaker' },
  { name: 'genos_biomimicry_swarm_consensus', cat: 'Swarm Biomimicry', risk: 'Low', desc: 'Honeybee dance quorum voting protocol' },
  { name: 'genos_biomimicry_flocking_explore', cat: 'Swarm Biomimicry', risk: 'Low', desc: 'Boids flocking exploration algorithm' },
  { name: 'genos_biomimicry_network_quorum', cat: 'Swarm Biomimicry', risk: 'Low', desc: 'Mycelial network quorum communication' },
  { name: 'genos_biomimicry_distributed_huddle', cat: 'Swarm Biomimicry', risk: 'Low', desc: 'Penguin huddle energy conservation mode' }
];

async function seedMcpTools(db) {
  for (const t of MCP_TOOLS_LIST) {
    await db.run(
      `INSERT OR REPLACE INTO mcp_tools (id, name, provider, category, risk_level, description, actions_json, is_locked, circuit_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      t.name, t.name, 'genos', t.cat, t.risk, t.desc, JSON.stringify([t.name]), 0, 'CLOSED'
    );
  }
}

module.exports = { seedMcpTools, MCP_TOOLS_LIST };
