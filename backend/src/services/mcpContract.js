const REQUIRED_STRINGS = {
  genos_agent_world_capsule: ['snapshot_id'],
  genos_world_sandbox_execute: ['world_id', 'command', 'backend'],
  genos_world_hardlink_create: ['world_id', 'seed'],
  genos_snapshot: ['agent', 'out'],
  genos_replay: [],
  genos_merge: ['branch_id'],
  genos_export_audit: ['snapshot_id'],
  genos_cost_accounting: ['agent_id'],
  genos_loop_detection_check: ['history_file'],
  genos_causality_fork: ['boundary_id', 'new_boundary_id'],
  genos_causal_replay_experiment: ['input_file', 'output_file'],
  genos_incident_experiment: ['manifest'],
  genos_bug_investigation: ['manifest'],
  genos_compliance_report: ['standard', 'output_file'],
  genos_strategy_adaptation: ['agent_id', 'constraint'],
  genos_rebase_compute_plan: ['graph_file'],
  genos_resilience_apoptosis: ['agent_id'],
  genos_parasitic_pressure: ['manifest'],
  genos_bisect_agent: ['agent_id', 'predicate'],
  genos_hypothesis_evidence: ['diagnosis_id', 'hypothesis_id', 'claim', 'source']
};

const ARRAY_FIELDS = new Set(['scenarios', 'injected_keys', 'dag_step', 'patterns_detected', 'facts', 'steps', 'preconditions']);
const INTEGER_FIELDS = new Set(['after_id', 'limit', 'budget_steps', 'exact_match', 'stagnation', 'injection_step', 'iteration', 'tokens']);
const NUMBER_FIELDS = new Set(['similarity', 'expected', 'observed', 'tolerance', 'elapsed', 'uncertainty', 'confidence']);
const MCP_CONTRACT_VERSION = 'genos.mcp/v1';

function getToolInputSchema(toolName, baseSchema = {}) {
  const schema = {
    type: 'object',
    properties: { ...(baseSchema.properties || {}) },
    required: [...(baseSchema.required || [])],
    additionalProperties: baseSchema.additionalProperties !== false
  };
  if (toolName === 'genos_replay') {
    schema.anyOf = [{ required: ['snapshot'] }, { required: ['snapshot_id'] }];
    schema.properties.snapshot = { type: 'string' };
    schema.properties.snapshot_id = { type: 'string' };
  }
  if (toolName === 'genos_execute_primitive') {
    schema.properties.primitive_name = { type: 'string' };
    schema.properties.args = { type: 'object' };
    schema.required.push('primitive_name');
  }
  if (toolName === 'genos_execute_strategy_pipeline') {
    schema.properties.primitives = { type: 'array', items: { type: 'string' } };
    schema.properties.context = { type: 'object' };
  }
  if (toolName === 'genos_synaptic_stdp_update') {
    schema.additionalProperties = false;
    schema.properties = {
      source_id: { type: 'string' }, target_id: { type: 'string' },
      pre_spike_at: { type: 'number' }, post_spike_at: { type: 'number' },
      learning_rate: { type: 'number' }, transmitter_type: { type: 'string' }, agent_id: { type: 'string' }
    };
  }
  if (toolName === 'genos_cell_division') {
    schema.additionalProperties = false;
    schema.properties = {
      agent_id: { type: 'string' }, mode: { type: 'string' },
      daughter_volume: { type: 'number' }, mutation_rate: { type: 'number' },
      hayflick_limit: { type: 'integer', minimum: 0 }, merozoite_count: { type: 'integer', minimum: 0 }, seed: { type: 'string' }
    };
  }
  for (const field of REQUIRED_STRINGS[toolName] || []) {
    schema.properties[field] = { ...(schema.properties[field] || {}), type: 'string' };
    if (!schema.required.includes(field)) schema.required.push(field);
  }
  for (const field of ARRAY_FIELDS) schema.properties[field] = { ...(schema.properties[field] || {}), type: 'array', items: { type: 'string' } };
  for (const field of INTEGER_FIELDS) schema.properties[field] = { ...(schema.properties[field] || {}), type: 'integer', minimum: 0 };
  for (const field of NUMBER_FIELDS) schema.properties[field] = { ...(schema.properties[field] || {}), type: 'number', minimum: 0 };
  return schema;
}

function normalizeMcpEnvelope(body = {}) {
  return {
    toolName: body.toolName ?? body.tool_name,
    args: body.args || {},
    timeoutMs: body.timeoutMs ?? body.timeout_ms
  };
}

module.exports = { MCP_CONTRACT_VERSION, getToolInputSchema, normalizeMcpEnvelope };
