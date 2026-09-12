const REQUIRED_STRINGS = {
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
  genos_trinity_deploy: ['mission_id', 'strategies'],
  genos_allele_frequency_analyzer: ['swarm_id'],
  genos_compliance_report: ['standard', 'output_file'],
  genos_strategy_adaptation: ['agent_id', 'constraint'],
  genos_rebase_compute_plan: ['graph_file'],
  genos_guardrails_verify: [],
  genos_resilience_apoptosis: ['agent_id'],
  genos_parasitic_pressure: ['manifest'],
  genos_bisect_agent: ['agent_id', 'predicate'],
  genos_hypothesis_evidence: ['diagnosis_id', 'hypothesis_id', 'claim', 'source'],
  genos_biological_mode: ['mode', 'mission']
};

const ARRAY_FIELDS = new Set(['scenarios', 'injected_keys', 'dag_step', 'patterns_detected', 'facts', 'steps', 'preconditions', 'bbox', 'history']);
const NON_NEGATIVE_FIELDS = new Set(['budget_steps', 'exact_match', 'stagnation', 'injection_step', 'iteration', 'tokens', 'elapsed', 'top_k', 'topK']);
const MAX_ONE_FIELDS = new Set(['similarity', 'expected', 'observed', 'tolerance', 'uncertainty', 'confidence']);
const FREEFORM_FIELDS = new Set(['agent', 'out', 'command', 'conditions', 'document', 'query', 'predicate', 'claim', 'source', 'artifact', 'strategies', 'focus', 'request', 'details', 'task', 'role', 'description', 'plan_action', 'expected', 'option_a', 'option_b', 'threat_context', 'target_path', 'target_process', 'target_file', 'action_id', 'payload', 'signals_json', 'intensity_or_signal', 'action_script', 'substrate_signature', 'action', 'observation', 'outcome', 'context', 'content', 'mission', 'message', 'reason', 'project_goal', 'projectGoal', 'notes', 'channel', 'topology', 'transmitterType', 'transmitter_type', 'prompt', 'goal', 'feature', 'primitive_name', 'mode', 'organization', 'kind', 'phase', 'backend', 'strategy', 'url', 'selector_id', 'selectorId', 'value', 'session_id', 'sessionId', 'target', 'html_content', 'html', 'image_path', 'imagePath', 'target_type', 'targetType', 'keyword', 'zoom_factor', 'zoomFactor', 'scout_id', 'scoutId', 'harvester_id', 'harvesterId', 'token_id', 'tokenId', 'artifact_type', 'local_path', 'localPath', 'problem_statement', 'problemStatement', 'issue', 'repo_name', 'repoName']);
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

  for (const field of REQUIRED_STRINGS[toolName] || []) {
    const error = validateString(args[field], field, true);
    if (error) return error;
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
    backend: ['directory', 'hardlink', 'copy_on_write', 'cow']
  };
  for (const [field, values] of Object.entries(enumValues)) {
    if (args[field] !== undefined && !values.includes(args[field])) return invalid(field, `must be one of: ${values.join(', ')}.`);
  }

  return null;
}

module.exports = { validateToolArguments, REQUIRED_STRINGS };
