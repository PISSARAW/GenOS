const REQUIRED_STRINGS = {
  genos_philosophy: ['operation'],
  genos_agent_world_capsule: ['snapshot_id'],
  genos_snapshot: ['agent', 'out'],
  genos_world_sandbox_execute: ['world_id', 'command', 'backend'],
  genos_world_hardlink_create: ['world_id', 'seed'],
  genos_replay: [],
  genos_merge: ['branch_id'],
  genos_export_audit: ['snapshot_id'],
  genos_cost_accounting: ['agent_id'],
  genos_loop_detection_check: ['history_file'],
  genos_causality_fork: ['boundary_id', 'new_boundary_id'],
  genos_causal_replay_experiment: ['input_file', 'output_file'],
  genos_incident_experiment: ['manifest'],
  genos_bug_investigation: ['manifest'],
  genos_phenotype_measure_divergence: ['trait_name'],
  genos_allele_frequency_analyzer: ['swarm_id'],
  genos_compliance_report: ['standard', 'output_file'],
  genos_strategy_adaptation: ['agent_id', 'constraint'],
  genos_rebase_compute_plan: ['graph_file'],
  genos_guardrails_verify: [],
  genos_resilience_apoptosis: ['agent_id'],
  genos_parasitic_pressure: ['manifest'],
  genos_bisect_agent: ['agent_id', 'predicate'],
  genos_hypothesis_evidence: ['diagnosis_id', 'hypothesis_id', 'claim', 'source'],
  genos_biological_mode: ['mode', 'mission'],
  genos_fossil_record: ['lineage_id', 'reason'],
  genos_fossil_excavate: ['fossil_id'],
  genos_fossil_decode: ['fossil_id'],
  genos_fossil_candidate: ['fossil_id'],
  genos_genome_compile: ['input', 'out'],
  genos_genome_validate: ['file'],
  genos_genome_inspect: ['file'],
  genos_genome_cross: ['parent_a', 'parent_b', 'out'],
  genos_genome_mutate: ['input', 'out'],
  genos_genome_clone: ['input', 'out'],
  genos_genome_decoy: ['input', 'out'],
  genos_computer_use: ['prompt'],
  genos_topology_session: ['session_id', 'operation'],
  genos_orchestrate: ['mission'],
  genos_delegate_worker: ['mission'],
  genos_change_strategy: ['strategy', 'reason'],
  genos_report_progress: ['phase', 'message'],
  genos_change_organization: ['organization', 'reason'],
  genos_organization_state: [],
  genos_worker_publish: ['kind', 'signal_type', 'signal_data'],
  genos_evolution_assimilate_plasmid: ['agent_id', 'plasmid_id'],
  genos_worker_inbox: [],
  genos_capsule_create: ['snapshot_id'],
  genos_v2_init: [],
  genos_v2_fork: [],
  genos_trinity_launch: ['mission'],
  genos_a_team_preview: ['project_goal', 'sub_systems'],
  genos_audit: ['snapshot_id'],
  genos_biomimicry: ['feature', 'action'],
  // Primitives de stratégie — arity variable (un seul paramètre primit spécifie le comportement)
  genos_strat_snapshot: [],
  genos_strat_checkpoint: [],
  genos_strat_production_snapshot: [],
  genos_strat_last_good_snapshot: [],
  genos_strat_snapshot_test: [],
  genos_strat_cryptobiosis_freeze: [],
  genos_strat_freeze_spore: [],
  genos_strat_cryptobiosis_thaw: [],
  genos_strat_rehydrate: [],
  genos_strat_cryptobiosis: [],
  genos_strat_persist: [],
  genos_strat_vitrify: [],
  genos_strat_fork: [],
  genos_strat_recursive_fork: [],
  genos_strat_slm_route: [],
  genos_strat_provider_route: [],
  genos_strat_provider_fallback: [],
  genos_strat_fallback_chain: [],
  genos_strat_degraded_mode: [],
  genos_strat_independent_reports: [],
  genos_strat_neutral_observer: [],
  genos_strat_synthesis: [],
  genos_strat_security_coevolution: [],
  genos_strat_plan: [],
  genos_strat_role_forks: [],
  genos_strat_common_probes: [],
  genos_strat_probe: [],
  genos_strat_evidence: [],
  genos_strat_conditional_mutation: [],
  genos_strat_belief_update: [],
  genos_strat_expected_information_gain: [],
  genos_strat_next_probe: [],
  genos_strat_analyze_trajectory: [],
  genos_strat_rank_states: [],
  genos_strat_preserve_losers: [],
  genos_strat_variance_analysis: [],
  genos_strat_temperature_schedule: [],
  genos_strat_resource_shift: [],
  genos_strat_separation: [],
  genos_strat_alignment: [],
  genos_strat_cohesion: [],
  genos_strat_weighted_barycenter: [],
  genos_strat_path_conductivity: [],
  genos_strat_role_gradient: [],
  genos_strat_energy_observe: [],
  genos_strat_elo: [],
  genos_strat_uncertainty_gate: [],
  genos_strat_active_refusal: [],
  genos_strat_approval_request: [],
  genos_strat_drift_threshold: [],
  genos_strat_dead_letter_queue: [],
  genos_strat_alpha_beta_delta: [],
  genos_strat_position_update: [],
  genos_strat_capability_route: [],
  genos_strat_knowledge_transfer: [],
  genos_strat_dynamic_assignment: [],
  genos_strat_local_buffer: [],
  genos_strat_critical_or_success_flush: [],
  genos_strat_solver_tournament: [],
  genos_strat_frontier_escalation: [],
  genos_strat_impact_graph: [],
  genos_strat_invalidate_assumption: [],
  genos_strat_paired_evaluation: [],
  genos_strat_heredity_experiment: [],
  genos_strat_branch_evolution: [],
  genos_strat_adversarial_review: [],
  genos_strat_blind_critics: [],
  genos_strat_phenotype_evidence: [],
  genos_strat_validate_child: [],
  genos_strat_alternate_genome: [],
  genos_strat_hot_spare: [],
  genos_strat_health_switch: [],
  genos_strat_decoy_branch: [],
  genos_strat_observe: [],
  genos_strat_destroy_decoy: [],
  genos_strat_bisect_agent: [],
  genos_strat_entropy_check: [],
  genos_strat_shannon_entropy: [],
  genos_strat_evaluate: [],
  genos_strat_minimum_evaluation: [],
  genos_strat_verify: [],
  genos_strat_tests: [],
  genos_strat_independent_verify: [],
  genos_strat_vfs_dry_run: [],
  genos_strat_blast_radius: [],
  genos_strat_safe_revert: [],
  genos_strat_restore: [],
  genos_strat_run: [],
  genos_strat_worktree_cleanup: [],
  genos_strat_cas_gc: [],
  genos_strat_dag_mark_sweep: [],
  genos_strat_record_experience: [],
  genos_strat_compile_memory: [],
  genos_strat_source_refs: [],
  genos_strat_cherry_pick_golden_path: [],
  genos_strat_cherry_pick_experience: [],
  genos_strat_search_memory: [],
};

const ARRAY_FIELDS = new Set(['scenarios', 'injected_keys', 'dag_step', 'patterns_detected', 'facts', 'steps', 'preconditions', 'bbox', 'history']);
const NON_NEGATIVE_FIELDS = new Set(['budget_steps', 'exact_match', 'stagnation', 'injection_step', 'iteration', 'tokens', 'elapsed']);
const MAX_ONE_FIELDS = new Set(['similarity', 'expected', 'observed', 'tolerance', 'uncertainty', 'confidence']);
const FREEFORM_FIELDS = new Set(['agent', 'out', 'command', 'conditions', 'document', 'query', 'predicate', 'claim', 'source', 'artifact', 'strategies', 'focus', 'request', 'details', 'task', 'role', 'description', 'plan_action', 'expected', 'option_a', 'option_b', 'threat_context', 'target_path', 'target_process', 'target_file', 'action_id', 'payload', 'signals_json', 'intensity_or_signal', 'action_script', 'substrate_signature', 'action', 'observation', 'outcome', 'context', 'content', 'mission', 'message', 'reason', 'project_goal', 'projectGoal', 'notes', 'channel', 'topology', 'transmitterType', 'transmitter_type', 'prompt', 'goal', 'feature', 'primitive_name', 'mode', 'organization', 'kind', 'phase', 'backend', 'strategy', 'url', 'selector_id', 'selectorId', 'value', 'session_id', 'sessionId', 'target', 'html_content', 'html', 'image_path', 'imagePath', 'target_type', 'targetType', 'keyword', 'zoom_factor', 'zoomFactor', 'scout_id', 'scoutId', 'harvester_id', 'harvesterId', 'token_id', 'tokenId', 'artifact_type', 'local_path', 'localPath', 'input', 'file', 'parent_a', 'parent_b', 'locus', 'seed', 'selector', 'output']);
const MAX_STRING_LENGTH = 64 * 1024;

function invalid(field, message) {
  const error = new Error(`${field}: ${message}`);
  error.code = 'INVALID_TOOL_ARGUMENTS';
  return error;
}

function validateString(value, field, required = false) {
  if (value === undefined || value === null) {
    if (required) return invalid(field, 'is required.');
    return null;
  }
  if (typeof value !== 'string' || value.trim() === '') return invalid(field, 'must be a non-empty string.');
  if (value.length > MAX_STRING_LENGTH) return invalid(field, `must be at most ${MAX_STRING_LENGTH} characters.`);
  return null;
}

function validateToolArguments(toolName, args = {}) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return invalid('args', 'must be an object.');

  if (toolName === 'genos_synaptic_stdp_update') {
    const aliasGroups = [
      ['source_id', 'sourceId', 'causeId'],
      ['target_id', 'targetId', 'effectId'],
      ['pre_spike_at', 'preSpikeAt'],
      ['post_spike_at', 'postSpikeAt'],
      ['learning_rate', 'learningRate', 'outcome_score'],
      ['transmitter_type', 'transmitterType', 'trait'],
      ['agent_id', 'agentId']
    ];
    for (const aliases of aliasGroups) {
      const provided = aliases.filter((alias) => args[alias] !== undefined && args[alias] !== null);
      const values = [...new Set(provided.map((alias) => String(args[alias])))];
      if (values.length > 1) return invalid(aliases[0], `conflicting aliases supplied: ${provided.join(', ')}.`);
    }
    const legacyAliases = ['sourceId', 'targetId', 'preSpikeAt', 'postSpikeAt', 'learningRate', 'transmitterType', 'agentId'];
    if (legacyAliases.some((field) => Object.prototype.hasOwnProperty.call(args, field))) {
      return invalid('args', `MCP uses snake_case fields; use ${legacyAliases.map((field) => field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)).join(', ')}.`);
    }
  }
  if (toolName === 'genos_cell_division') {
    const legacyAliases = ['agentId', 'daughterVolume', 'mutationRate', 'hayflickLimit', 'merozoiteCount'];
    if (legacyAliases.some((field) => Object.prototype.hasOwnProperty.call(args, field))) {
      return invalid('args', 'MCP uses snake_case fields for cell division.');
    }
  }

  // sub_systems accepte un tableau (schéma MCP) ou une string CSV (rétrocompatibilité)
  if (toolName === 'genos_a_team_preview' && args.sub_systems !== undefined) {
    if (!Array.isArray(args.sub_systems) && typeof args.sub_systems !== 'string') {
      return invalid('sub_systems', 'must be an array of strings or a comma-separated string.');
    }
    if (Array.isArray(args.sub_systems) && args.sub_systems.some((item) => typeof item !== 'string' || item.trim() === '')) {
      return invalid('sub_systems', 'must contain only non-empty strings.');
    }
  }
  // signal_data accepte un object (schéma MCP) ou une string non vide (rétrocompatibilité)
  if (toolName === 'genos_worker_publish' && args.signal_data !== undefined) {
    if (typeof args.signal_data !== 'string' && typeof args.signal_data !== 'object') {
      return invalid('signal_data', 'must be a JSON object or a non-empty string.');
    }
    if (typeof args.signal_data === 'string' && args.signal_data.trim() === '') {
      return invalid('signal_data', 'must be a non-empty string.');
    }
    if (typeof args.signal_data === 'object' && args.signal_data !== null && Array.isArray(args.signal_data)) {
      return invalid('signal_data', 'must be a JSON object, not an array.');
    }
  }

  if (toolName === 'genos_replay' && args.snapshot === undefined && args.snapshot_id === undefined) {
    return invalid('snapshot', 'snapshot or snapshot_id is required (at least one).');
  }
  if (toolName === 'genos_execute_primitive' && typeof args.primitive !== 'string' && typeof args.primitive_name !== 'string' && typeof args.name !== 'string' && !Array.isArray(args.primitives)) {
    return invalid('primitive', 'primitive, primitive_name, or name is required.');
  }
  if (toolName === 'genos_execute_primitive' && args.args !== undefined && (typeof args.args !== 'object' || args.args === null || Array.isArray(args.args))) {
    return invalid('args', 'args must be an object.');
  }
  if (toolName === 'genos_execute_strategy_pipeline' && !Array.isArray(args.primitives || args.pipeline)) {
    return invalid('primitives', 'primitives or pipeline must be an array.');
  }
  if (toolName === 'genos_procedural_registry_list' && !['runners', 'evaluators', 'environments', 'snapshots'].includes(args.scope)) {
    return invalid('scope', 'scope must be one of: runners, evaluators, environments, snapshots.');
  }
  if (toolName === 'genos_procedural_runner_resolve' && typeof args.id !== 'string') {
    return invalid('id', 'id must be a string.');
  }
  if (toolName === 'genos_deterministic_sha256_rag') {
    if (!['ingest', 'search'].includes(args.action)) return invalid('action', 'must be ingest or search.');
    const field = args.action === 'ingest' ? 'document' : 'query';
    const error = validateString(args[field], field, true);
    if (error) return error;
  }

  for (const [field, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      if (value.includes('\0')) return invalid(field, 'contains null bytes.');
      if (!FREEFORM_FIELDS.has(field)) {
        if (/[\r\n]/.test(value) || /["'`\\;|&<>$]/.test(value)) return invalid(field, 'contains forbidden command characters.');
        if (/\s/.test(value)) return invalid(field, 'must not contain whitespace.');
      }
    }
    if (ARRAY_FIELDS.has(field) && value !== undefined && !Array.isArray(value)) return invalid(field, 'must be an array.');
    if (ARRAY_FIELDS.has(field) && Array.isArray(value) && value.some((item) => typeof item !== 'string' || /[\r\n"'`\\;|&<>$]/.test(item))) return invalid(field, 'must contain only safe strings.');
    if (NON_NEGATIVE_FIELDS.has(field) && value !== undefined) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0) return invalid(field, 'must be a finite non-negative number.');
    }
    if (MAX_ONE_FIELDS.has(field) && value !== undefined) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) return invalid(field, 'must be a finite number between 0 and 1.');
    }
  }

  const enumValues = {
    backend: ['directory', 'hardlink', 'copy_on_write', 'cow'],
    mode: ['petrification', 'external_mold', 'internal_mold', 'trace']
  };
  for (const [field, values] of Object.entries(enumValues)) {
    if (args[field] !== undefined && !values.includes(args[field])) return invalid(field, `must be one of: ${values.join(', ')}.`);
  }

  return null;
}

module.exports = { validateToolArguments, REQUIRED_STRINGS };
