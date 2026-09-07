const REQUIRED_STRINGS = {
  genos_agent_world_capsule: ['snapshot_id'],
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
  genos_trinity_deploy: ['mission_id', 'strategies'],
  genos_allele_frequency_analyzer: ['swarm_id'],
  genos_compliance_report: ['standard', 'output_file'],
  genos_strategy_adaptation: ['agent_id', 'constraint'],
  genos_rebase_compute_plan: ['graph_file'],
  genos_guardrails_verify: [],
  genos_resilience_apoptosis: ['agent_id'],
  genos_parasitic_pressure: ['manifest'],
  genos_bisect_agent: ['agent_id', 'predicate'],
  genos_hypothesis_evidence: ['diagnosis_id', 'hypothesis_id', 'claim', 'source']
};

const ARRAY_FIELDS = new Set(['scenarios', 'injected_keys', 'dag_step', 'patterns_detected', 'facts', 'steps', 'preconditions']);
const NON_NEGATIVE_FIELDS = new Set(['budget_steps', 'exact_match', 'stagnation', 'similarity', 'expected', 'observed', 'tolerance', 'injection_step', 'iteration', 'tokens', 'elapsed', 'uncertainty', 'confidence']);
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

  for (const field of REQUIRED_STRINGS[toolName] || []) {
    const error = validateString(args[field], field, true);
    if (error) return error;
  }

  if (toolName === 'genos_replay' && args.snapshot === undefined && args.snapshot_id === undefined) {
    return invalid('snapshot', 'snapshot or snapshot_id is required.');
  }
  if (toolName === 'genos_deterministic_sha256_rag') {
    if (!['ingest', 'search'].includes(args.action)) return invalid('action', 'must be ingest or search.');
    const field = args.action === 'ingest' ? 'document' : 'query';
    const error = validateString(args[field], field, true);
    if (error) return error;
  }

  for (const [field, value] of Object.entries(args)) {
    if (ARRAY_FIELDS.has(field) && value !== undefined && !Array.isArray(value)) return invalid(field, 'must be an array.');
    if (ARRAY_FIELDS.has(field) && Array.isArray(value) && value.some((item) => typeof item !== 'string')) return invalid(field, 'must contain only strings.');
    if (NON_NEGATIVE_FIELDS.has(field) && value !== undefined) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0) return invalid(field, 'must be a finite non-negative number.');
    }
  }

  const enumValues = {
    backend: ['directory', 'hardlink', 'copy_on_write'],
    strategy: ['canary', 'ab']
  };
  for (const [field, values] of Object.entries(enumValues)) {
    if (args[field] !== undefined && !values.includes(args[field])) return invalid(field, `must be one of: ${values.join(', ')}.`);
  }

  return null;
}

module.exports = { validateToolArguments };
