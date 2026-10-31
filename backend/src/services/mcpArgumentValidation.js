const Ajv = require('ajv');
const { validateReplaySnapshotPath } = require('./mcpReplaySnapshotPathValidation');
const PUBLIC_TOOLS = require('../../../shared/toolDefinitions.json').tools;
const schemaCompiler = new Ajv({ strict: false });
const publicValidators = new Map(PUBLIC_TOOLS.map((tool) => [tool.name, {
  schema: tool.inputSchema,
  validate: schemaCompiler.compile(tool.inputSchema)
}]));
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
  genos_biological_mode: ['mode'],
  genos_fossil_record: ['lineage_id', 'reason', 'source_event_id'],
  genos_fossil_list: [],
  genos_fossil_strata: [],
  genos_fossil_excavate: ['fossil_id'],
  genos_fossil_decode: ['fossil_id'],
  genos_fossil_candidate: ['fossil_id'],
  genos_signal_ground: ['signal_id', 'agent_id', 'grounding_level'],
  genos_diagnose: ['task'],
  genos_analyze_trajectory: [],
  genos_record_decision: ['agentId', 'title', 'decision'],
  genos_record_experience: ['agentId', 'actionInput', 'observationOutput'],
  genos_compile_memory: ['agentId'],
  genos_working_memory: ['action'],
  genos_ancestral_memory: ['action', 'lineageId'],
  genos_risk_inheritance: ['action', 'lineageId'],
  genos_collective_plasticity: ['action'],
  genos_teaching_worker: ['action'],
  genos_blame: ['target_id'],
  genos_search_failures: [],
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
  genos_organization_state: [], genos_worker_status: [],
  genos_worker_publish: ['kind', 'signal_type'],
  genos_evolution_assimilate_plasmid: ['agent_id', 'plasmid_id'],
  genos_worker_inbox: [],
  genos_capsule_create: ['snapshot_id'],
  genos_v2_init: [],
  genos_v2_fork: [],
  genos_agent_fork_snapshot: ['agent_id', 'snapshot_id', 'idempotency_key'],
  genos_agent_inherited_memory_read: ['agent_id', 'kind'],
  genos_agent_state_restore_inspect: ['agent_id', 'snapshot_id'],
  genos_trinity_launch: ['mission'],
  genos_a_team_preview: ['project_goal'],
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
const ORGANIZATION_MESSAGE_KINDS = new Set([
  'evidence', 'question', 'answer', 'challenge', 'proposal', 'vote', 'trace',
  'budget', 'critical', 'success', 'handoff'
]);

const ARRAY_FIELDS = new Set(['scenarios', 'injected_keys', 'dag_step', 'patterns_detected', 'facts', 'steps', 'preconditions', 'bbox', 'history']);
const NON_NEGATIVE_FIELDS = new Set(['budget_steps', 'exact_match', 'stagnation', 'injection_step', 'iteration', 'tokens', 'elapsed']);
const MAX_ONE_FIELDS = new Set(['similarity', 'expected', 'observed', 'tolerance', 'uncertainty', 'confidence']);
const FREEFORM_FIELDS = new Set(['agent', 'out', 'command', 'conditions', 'document', 'query', 'predicate', 'claim', 'source', 'artifact', 'strategies', 'focus', 'request', 'details', 'task', 'role', 'description', 'plan_action', 'expected', 'option_a', 'option_b', 'threat_context', 'target_path', 'target_process', 'target_file', 'action_id', 'payload', 'signals_json', 'intensity_or_signal', 'action_script', 'substrate_signature', 'action', 'observation', 'outcome', 'context', 'content', 'mission', 'message', 'reason', 'project_goal', 'projectGoal', 'notes', 'channel', 'topology', 'transmitterType', 'transmitter_type', 'prompt', 'goal', 'feature', 'primitive_name', 'mode', 'organization', 'kind', 'phase', 'backend', 'strategy', 'url', 'selector_id', 'selectorId', 'value', 'session_id', 'sessionId', 'target', 'html_content', 'html', 'image_path', 'imagePath', 'target_type', 'targetType', 'keyword', 'zoom_factor', 'zoomFactor', 'scout_id', 'scoutId', 'harvester_id', 'harvesterId', 'token_id', 'tokenId', 'artifact_type', 'local_path', 'localPath', 'input', 'file', 'parent_a', 'parent_b', 'locus', 'seed', 'selector', 'output']);
const MAX_STRING_LENGTH = 64 * 1024;
for (const field of ['actionInput', 'action_input', 'observationOutput', 'observation_output']) FREEFORM_FIELDS.add(field);

function invalid(field, message) {
  const error = new Error(`${field}: ${message}`);
  error.code = 'INVALID_TOOL_ARGUMENTS';
  return error;
}

function validateScopedReplayArguments(args = {}) {
  const allowed = new Set(['root', 'snapshot', 'snapshot_id', 'scenarios', 'injected_keys', 'dag_step', 'patterns_detected']);
  for (const field of Object.keys(args)) if (!allowed.has(field)) return invalid(field, 'is not supported for worker-scoped replay.');
  if (args.snapshot === undefined && args.snapshot_id === undefined) return invalid('snapshot', 'snapshot or snapshot_id is required.');
  { const __genosStageResult14 = require('./mcpArgumentValidationStages1.js').validateScopedReplayArgumentsStage14({ MAX_STRING_LENGTH, args, invalid, require, undefined }); if (__genosStageResult14) return __genosStageResult14.value; }
  if (args.root !== undefined && !require('node:path').isAbsolute(args.root)) return invalid('root', 'must be an absolute worker workspace path.');
  for (const field of ['scenarios', 'injected_keys', 'dag_step', 'patterns_detected']) {
    if (require('./mcpArgumentValidationValues1.js').validateScopedReplayArgumentsValue18({ Array, args, field, undefined })) {
      return invalid(field, 'must contain safe replay strings.');
    }
  }
  return null;
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

function bioRequiredArgs(toolName) {
  try {
    const required = require('./mcpBioTools/handlers').HANDLER_REQUIRED;
    if (required && Array.isArray(required[toolName])) return required[toolName];
  } catch (_) {}
  return null;
}

function validatePublicSchema(toolName, args) {
  const entry = publicValidators.get(toolName);
  if (!entry) return null;
  if (!entry.validate(args)) {
    const fault = entry.validate.errors[0];
    return invalid(fault.instancePath || fault.params?.missingProperty || 'args', fault.message);
  }
  for (const field of entry.schema.required || []) {
    if (typeof args[field] === 'string' && args[field].trim() === '') {
      return invalid(field, 'must be a non-empty string.');
    }
  }
  return null;
}

function validateToolEnums(toolName, args) {
  const enums = {
    genos_world_sandbox_execute: { backend: ['directory', 'hardlink', 'copy_on_write', 'cow'] },
    genos_fossil_record: { mode: ['petrification', 'external_mold', 'internal_mold', 'trace'] }
  };
  for (const [field, values] of Object.entries(enums[toolName] || {})) {
    if (args[field] !== undefined && !values.includes(args[field])) return invalid(field, `must be one of: ${values.join(', ')}.`);
  }
  return null;
}

function validateToolArguments(toolName, args = {}) {
  if (require('./mcpArgumentValidationValues1.js').validateToolArgumentsValue6({ Array, args })) return invalid('args', 'must be an object.');
  const publicSchemaError = validatePublicSchema(toolName, args);
  if (publicSchemaError) return publicSchemaError;
  // Validation générique: si le handler déclare required[], chaque champ doit
  // être fourni (non vide). Rejet => invalid_args, jamais de défaut silencieux.
  for (const validate of [validateRequiredFields, validateStructuredFields, validateRemainingFields]) {
    const result = validate(toolName, args);
    if (result) return result;
  }
  return null;
}
function validateRequiredFields(toolName, args) {
  const required = bioRequiredArgs(toolName);
  const statusInspection = require('./mcpArgumentValidationValues1.js').validateToolArgumentsValue10({ args, undefined });
  { const __genosStageResult6 = require('./mcpArgumentValidationStages1.js').validateToolArgumentsStage6({ String, args, invalid, require, required, statusInspection, undefined }); if (__genosStageResult6) return __genosStageResult6.value; }
  const declaredRequired = REQUIRED_STRINGS[toolName] || [];
  { const __genosStageResult9 = require('./mcpArgumentValidationStages1.js').validateToolArgumentsStage9({ args, declaredRequired, validateString }); if (__genosStageResult9) return __genosStageResult9.value; }

  { const __genosStageResult4 = require('./mcpArgumentValidationStages1.js').validateToolArgumentsStage4({ Object, Set, String, args, invalid, toolName, undefined }); if (__genosStageResult4) return __genosStageResult4.value; }
  { const __genosStageResult13 = require('./mcpArgumentValidationStages1.js').validateToolArgumentsStage13({ Object, args, invalid, toolName }); if (__genosStageResult13) return __genosStageResult13.value; }

  return null;
}

function validateStructuredFields(toolName, args) {
  // sub_systems accepte un tableau (schéma MCP) ou une string CSV (rétrocompatibilité)
  { const __genosStageResult3 = require('./mcpArgumentValidationStages1.js').validateToolArgumentsStage3({ Array, args, invalid, require, toolName, undefined }); if (__genosStageResult3) return __genosStageResult3.value; }
  // signal_data accepte un object (schéma MCP) ou une string non vide (rétrocompatibilité)
  { const __genosStageResult1 = require('./mcpArgumentValidationStages1.js').validateToolArgumentsStage1({ Array, args, invalid, require, toolName, undefined }); if (__genosStageResult1) return __genosStageResult1.value; }
  { const __genosStageResult11 = require('./mcpArgumentValidationStages1.js').validateToolArgumentsStage11({ ORGANIZATION_MESSAGE_KINDS, args, invalid, toolName }); if (__genosStageResult11) return __genosStageResult11.value; }
  { const __genosStageResult8 = require('./mcpArgumentValidationStages1.js').validateToolArgumentsStage8({ Array, Number, args, invalid, require, toolName, undefined }); if (__genosStageResult8) return __genosStageResult8.value; }

  return null;
}

function validateRemainingFields(toolName, args) {
  if (require('./mcpArgumentValidationValues1.js').validateToolArgumentsValue12({ args, toolName, undefined })) {
    return invalid('snapshot', 'snapshot or snapshot_id is required (at least one).');
  }
  { const __genosStageResult7 = require('./mcpArgumentValidationStages1.js').validateToolArgumentsStage7({ args, toolName, undefined, validateReplaySnapshotPath }); if (__genosStageResult7) return __genosStageResult7.value; }
  if (require('./mcpArgumentValidationValues1.js').validateToolArgumentsValue3({ Array, args, toolName })) {
    return invalid('primitive', 'primitive, primitive_name, or name is required.');
  }
  if (require('./mcpArgumentValidationValues1.js').validateToolArgumentsValue2({ Array, args, toolName, undefined })) {
    return invalid('args', 'args must be an object.');
  }
  if (require('./mcpArgumentValidationValues1.js').validateToolArgumentsValue14({ Array, args, toolName })) {
    return invalid('primitives', 'primitives or pipeline must be an array.');
  }
  { const __genosStageResult12 = require('./mcpArgumentValidationStages1.js').validateToolArgumentsStage12({ args, invalid, toolName }); if (__genosStageResult12) return __genosStageResult12.value; }
  { const __genosStageResult10 = require('./mcpArgumentValidationStages1.js').validateToolArgumentsStage10({ args, invalid, toolName }); if (__genosStageResult10) return __genosStageResult10.value; }
  { const __genosStageResult5 = require('./mcpArgumentValidationStages1.js').validateToolArgumentsStage5({ args, invalid, toolName, validateString }); if (__genosStageResult5) return __genosStageResult5.value; }

  { const __genosStageResult2 = require('./mcpArgumentValidationStages1.js').validateToolArgumentsStage2({ ARRAY_FIELDS, Array, FREEFORM_FIELDS, MAX_ONE_FIELDS, NON_NEGATIVE_FIELDS, Number, Object, args, invalid, require, toolName, undefined }); if (__genosStageResult2) return __genosStageResult2.value; }

  return validateToolEnums(toolName, args);
}

module.exports = { validateToolArguments, validateScopedReplayArguments, REQUIRED_STRINGS };
