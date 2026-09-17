/**
 * Tool lease policy (fail-closed).
 *
 * Centralizes every rule that bounds which MCP tools an agent may receive:
 * caller-supplied leases can only ever RESTRICT the policy-derived lease,
 * never widen it, and `genos_orchestrate` (any spelling) is always stripped.
 *
 * This module is dependency-free on purpose: it is required by both
 * agentOrchestrationState (lease derivation) and agentAuthorityService
 * (staleness verification) without creating require cycles.
 */

const WORKER_BASE_LEASE = [
  'genos_search_failures',
  'genos_diagnose',
  'genos_hypothesis_evidence',
  'genos_snapshot',
  'genos_diff',
  'genos_evaluate_trajectories',
  'genos_record_experience',
  'genos_replay',
  'genos_organization_state',
  'genos_worker_publish',
  'genos_worker_inbox',
  // Privileged review and security tools are added only for exact roles below.
];

const ORCHESTRATOR_CORE_LEASE = [
  'genos_search_failures',
  'genos_diagnose',
  'genos_hypothesis_evidence',
  'genos_snapshot',
  'genos_fork',
  'genos_create',
  'genos_solve',
  'genos_diff',
  'genos_evaluate_trajectories',
  'genos_merge',
  'genos_record_experience',
  'genos_record_decision',
  'genos_replay',
  'genos_adversarial_review',
  'genos_compile_memory',
  'genos_resilience_hypermutation',
  'genos_security_coevolution',
  'genos_delegate_worker',
  'genos_a_team_preview',
  'genos_trinity_launch',
  'genos_change_strategy',
  'genos_change_organization',
  'genos_organization_state',
  'genos_worker_publish',
  'genos_worker_inbox',
  'genos_report_progress'
];

// Exact role allow-lists (full-string match, case-insensitive). Role names
// below are the real ones assigned in code:
// - autonomousOrchestrationService: red_team, blue_team, neutral_observer,
//   implementation, independent_reviewer
// - aTeamService: security_reviewer, integration_observer
// - biologicalModeService: adversarial_reviewer, consensus_observer,
//   ecosystem_observer (+ non-privileged community/eco roles)
// - workerFailureRecoveryService: independent_reviewer
// - swarmMetricsService: observer
// Substring lookalikes (e.g. 'reviewer_spoof', 'red_teamer') match nothing.
const REVIEWER_ROLE_ALLOW_LIST = [
  'independent_reviewer',
  'security_reviewer',
  'adversarial_reviewer'
];

const OBSERVER_ROLE_ALLOW_LIST = [
  'observer',
  'integration_observer',
  'ecosystem_observer',
  'consensus_observer',
  'neutral_observer'
];

const RED_ROLE_ALLOW_LIST = ['red_team'];
const BLUE_ROLE_ALLOW_LIST = ['blue_team'];

// Benign, well-known MCP tools (mirror of the `mcp_tools` seed) that an
// autonomy plan may legitimately request on top of the orchestrator core.
// Anything outside core + this list is refused. Destructive tools
// (genos_restore, genos_resilience_apoptosis, ...) are excluded by design.
const KNOWN_TOOL_ALLOW_LIST = [
  ...ORCHESTRATOR_CORE_LEASE,
  ...WORKER_BASE_LEASE,
  'genos_inspect',
  'genos_lineage',
  'genos_bug_investigation',
  'genos_blame',
  'genos_cherry_pick_experience',
  'genos_future_ci',
  'genos_repository_genome',
  'genos_bisect_agent',
  'genos_analyze_trajectory',
  'genos_workspace_experiment',
  'genos_causal_replay_experiment',
  'genos_incident_experiment',
  'genos_scientific_experiment',
  'genos_browser_act',
  'genos_foveal_crop',
  'genos_optimal_foraging',
  'genos_computer_use',
  'genos_guardrails_verify',
  'genos_topology_session',
  'genos_execute_primitive',
  'genos_execute_strategy_pipeline'
];

// Maps a topology capability (see topologyCapabilityService.GENOS_CAPABILITIES)
// to the safe, well-known tools that realise it. Capabilities without a
// concrete tool map to none; every mapped tool is still filtered against
// KNOWN_TOOL_ALLOW_LIST so a contract can never widen the known surface.
const CAPABILITY_TOOLS = Object.freeze({
  STRATEGY_PORTFOLIO: ['genos_change_strategy'],
  STRATEGY_ADAPTATION: ['genos_change_strategy'],
  ARENA_COMPETITION: ['genos_adversarial_review', 'genos_evaluate_trajectories'],
  PROMOTION_GATE: ['genos_record_decision', 'genos_evaluate_trajectories'],
  TOKEN_ECONOMY: ['genos_report_progress', 'genos_execute_primitive'],
  EVIDENCE_BARRIER: ['genos_hypothesis_evidence', 'genos_evaluate_trajectories'],
  EPISTEMICS_BRIER: ['genos_evaluate_trajectories'],
  HALLUCINATION_MONITORING: ['genos_adversarial_review'],
  OUTPUT_GOVERNOR: ['genos_guardrails_verify'],
  PROVENANCE: ['genos_record_decision'],
  GRAPH_MEMORY: ['genos_compile_memory', 'genos_search_failures'],
  VECTOR_MEMORY: ['genos_compile_memory'],
  EPISODIC_MEMORY: ['genos_record_experience', 'genos_cherry_pick_experience'],
  SYNAPTIC_PLASTICITY: ['genos_record_experience'],
  SIGNALING_BUS: ['genos_worker_publish', 'genos_worker_inbox', 'genos_topology_session'],
  LIGAND_RECEPTOR: ['genos_worker_publish', 'genos_worker_inbox', 'genos_topology_session'],
  STIGMERGY: ['genos_worker_publish', 'genos_topology_session', 'genos_execute_primitive'],
  SWARM_METRICS: [],
  QUORUM: ['genos_evaluate_trajectories', 'genos_execute_primitive'],
  GENOME_EPIGENETICS: ['genos_repository_genome'],
  EVOLUTION_REPRODUCTION: ['genos_resilience_hypermutation'],
  IMMUNE_SYSTEM: ['genos_security_coevolution', 'genos_parasitic_pressure', 'genos_execute_primitive'],
  CONSCIENCE_HOMEOSTASIS: [],
  RESILIENCE_RECOVERY: ['genos_resilience_hypermutation'],
  CHAOS_ENGINEERING: [],
  CRDT_SHARED_STATE: ['genos_worker_publish', 'genos_worker_inbox', 'genos_topology_session'],
  VFS_SANDBOX: ['genos_run'],
  CAPSULES_SNAPSHOTS: ['genos_snapshot'],
  MODEL_ROUTING: [],
  LOCAL_INFERENCE: [],
  INFERENCE_GATEWAY: [],
  OBSERVABILITY: ['genos_report_progress', 'genos_organization_state'],
  GOVERNANCE_APPROVAL: ['genos_record_decision'],
  COMPLIANCE: [],
  WEB_FORAGING: ['genos_browser_act', 'genos_optimal_foraging'],
  FOVEAL_PERCEPTION: ['genos_foveal_crop', 'genos_execute_primitive'],
  COMPUTER_USE: ['genos_computer_use']
});

function normalizeToolName(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function canonicalToolKey(value) {
  return normalizeToolName(value).replace(/[^a-z0-9]/g, '');
}

function isOrchestrateVariant(value) {
  return canonicalToolKey(value) === 'genosorchestrate';
}

function normalizeRole(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function roleInAllowList(role, allowList) {
  return allowList.indexOf(normalizeRole(role)) !== -1;
}

function workerLeaseForRole(role) {
  const lease = [...WORKER_BASE_LEASE];
  const review = roleInAllowList(role, REVIEWER_ROLE_ALLOW_LIST);
  const observe = roleInAllowList(role, OBSERVER_ROLE_ALLOW_LIST);
  if (review || observe) lease.push('genos_adversarial_review');
  const red = roleInAllowList(role, RED_ROLE_ALLOW_LIST);
  const blue = roleInAllowList(role, BLUE_ROLE_ALLOW_LIST);
  if (red || blue) lease.push('genos_security_coevolution');
  return lease;
}

function orchestratorCoreLease() {
  return [...ORCHESTRATOR_CORE_LEASE];
}

function capabilityToolSet(capabilities) {
  const known = knownToolSet([]);
  const tools = [];
  for (const capability of Array.isArray(capabilities) ? capabilities : []) {
    const mapped = CAPABILITY_TOOLS[String(capability || '').trim().toUpperCase()] || [];
    for (const tool of mapped) {
      const name = normalizeToolName(tool);
      if (!name || isOrchestrateVariant(name) || !known.has(name)) continue;
      if (tools.indexOf(name) === -1) tools.push(name);
    }
  }
  return tools;
}

function leaseForCapabilities(baseLease, capabilities) {
  const merged = [...(Array.isArray(baseLease) ? baseLease : [])];
  for (const tool of capabilityToolSet(capabilities)) {
    if (merged.indexOf(tool) === -1) merged.push(tool);
  }
  return merged.filter((tool) => !isOrchestrateVariant(tool));
}

function knownToolSet(extraKnown) {
  const extras = Array.isArray(extraKnown) ? extraKnown : [];
  const allowed = new Set(KNOWN_TOOL_ALLOW_LIST);
  for (const tool of extras) {
    const name = normalizeToolName(tool);
    if (name) allowed.add(name);
  }
  return allowed;
}

function planRequiredTools(plan) {
  if (!plan) return [];
  if (!Array.isArray(plan.requiredTools)) return [];
  return plan.requiredTools;
}

function filterOrchestratorRequiredTools(requiredTools, extraKnown) {
  if (!Array.isArray(requiredTools)) return [];
  const allowed = knownToolSet(extraKnown);
  const filtered = [];
  for (const tool of requiredTools) {
    const name = normalizeToolName(tool);
    if (!name) continue;
    if (isOrchestrateVariant(name)) continue;
    if (!allowed.has(name)) continue;
    if (filtered.indexOf(name) === -1) filtered.push(name);
  }
  return filtered;
}

function orchestratorLeaseForPlan(plan, extraKnown) {
  const required = filterOrchestratorRequiredTools(planRequiredTools(plan), extraKnown);
  const capabilities = plan && plan.capabilityContract && Array.isArray(plan.capabilityContract.required)
    ? plan.capabilityContract.required
    : [];
  const lease = [...leaseForCapabilities(orchestratorCoreLease(), capabilities), ...required];
  return lease.filter((tool) => !isOrchestrateVariant(tool));
}

function derivePolicyLease(executionMode, role, plan) {
  const mode = normalizeToolName(executionMode);
  if (mode === 'worker') return workerLeaseForRole(role);
  return orchestratorLeaseForPlan(plan);
}

function restrictProvidedLease(provided, policyLease) {
  const policy = new Set((Array.isArray(policyLease) ? policyLease : []).map(normalizeToolName));
  if (!Array.isArray(provided)) return [...policy];
  if (provided.length === 0) return [...policy];
  const restricted = [];
  for (const tool of provided) {
    const name = normalizeToolName(tool);
    if (!name) continue;
    if (isOrchestrateVariant(name)) continue;
    if (!policy.has(name)) continue;
    if (restricted.indexOf(name) === -1) restricted.push(name);
  }
  return restricted;
}

function staleLeaseTools(agent, lease) {
  const provided = Array.isArray(lease) ? lease : [];
  const current = agent || {};
  const policy = new Set(derivePolicyLease(current.execution_mode, current.role, current.plan).map(normalizeToolName));
  const stale = [];
  for (const tool of provided) {
    const name = normalizeToolName(tool);
    if (policy.has(name) && !isOrchestrateVariant(name)) continue;
    if (stale.indexOf(name) === -1) stale.push(name);
  }
  return stale;
}

function isLeaseSubsetOf(stored, allowed) {
  const allowedSet = new Set((Array.isArray(allowed) ? allowed : []).map(normalizeToolName));
  const list = Array.isArray(stored) ? stored : [];
  for (const tool of list) {
    const name = normalizeToolName(tool);
    if (!name) return false;
    if (isOrchestrateVariant(name)) return false;
    if (!allowedSet.has(name)) return false;
  }
  return true;
}

function applyBiomimeticGating(toolLease, query, options = {}) {
  const { evaluateToolGating } = require('./biomimeticToolGatingService');
  const candidates = Array.isArray(toolLease) ? toolLease : [];
  const gating = evaluateToolGating(query, candidates, options);
  if (!gating.requiresTools) {
    return {
      gatedLease: [],
      gating
    };
  }
  return {
    gatedLease: gating.disinhibitedTools,
    gating
  };
}

module.exports = {
  WORKER_BASE_LEASE,
  ORCHESTRATOR_CORE_LEASE,
  KNOWN_TOOL_ALLOW_LIST,
  REVIEWER_ROLE_ALLOW_LIST,
  OBSERVER_ROLE_ALLOW_LIST,
  RED_ROLE_ALLOW_LIST,
  BLUE_ROLE_ALLOW_LIST,
  normalizeToolName,
  isOrchestrateVariant,
  normalizeRole,
  roleInAllowList,
  workerLeaseForRole,
  orchestratorCoreLease,
  CAPABILITY_TOOLS,
  capabilityToolSet,
  leaseForCapabilities,
  planRequiredTools,
  filterOrchestratorRequiredTools,
  orchestratorLeaseForPlan,
  derivePolicyLease,
  restrictProvidedLease,
  staleLeaseTools,
  isLeaseSubsetOf,
  applyBiomimeticGating
};
