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
const { workerAssignmentsSchema } = require('./workerAssignmentsSchema');
const { trinityDesignSchema } = require('./trinityDesignSchema');

function applyToolSpecificOverrides(toolName, schema) {
  if (toolName === 'genos_replay') {
    schema.anyOf = [{ required: ['snapshot'] }, { required: ['snapshot_id'] }];
    schema.properties.snapshot = { type: 'string' };
    schema.properties.snapshot_id = { type: 'string' };
    schema.required = [];
  } else if (toolName === 'genos_execute_primitive') {
    schema.properties.primitive_name = { type: 'string' };
    schema.properties.args = { type: 'object' };
    schema.required.push('primitive_name');
  } else if (toolName === 'genos_execute_strategy_pipeline') {
    schema.properties.primitives = { type: 'array', items: { type: 'string' } };
    schema.properties.context = { type: 'object' };
  } else if (toolName === 'genos_synaptic_stdp_update') {
    schema.additionalProperties = false;
    schema.properties = {
      source_id: { type: 'string' }, target_id: { type: 'string' },
      pre_spike_at: { type: 'number' }, post_spike_at: { type: 'number' },
      learning_rate: { type: 'number' }, transmitter_type: { type: 'string' }, agent_id: { type: 'string' }
    };
  } else if (toolName === 'genos_cell_division') {
    schema.additionalProperties = false;
    schema.properties = {
      agent_id: { type: 'string' }, mode: { type: 'string' },
      daughter_volume: { type: 'number' }, mutation_rate: { type: 'number' },
      hayflick_limit: { type: 'integer', minimum: 0 }, merozoite_count: { type: 'integer', minimum: 0 }, seed: { type: 'string' }
    };
  }
}

function applyRequiredStrings(toolName, schema) {
  const req = REQUIRED_STRINGS[toolName];
  if (!req) return;
  for (const field of req) {
    schema.properties[field] = { ...(schema.properties[field] || {}), type: 'string' };
    if (!schema.required.includes(field)) schema.required.push(field);
  }
}

function applyPrimitiveFields(schema) {
  for (const field of ARRAY_FIELDS) schema.properties[field] = { ...(schema.properties[field] || {}), type: 'array', items: { type: 'string' } };
  for (const field of INTEGER_FIELDS) schema.properties[field] = { ...(schema.properties[field] || {}), type: 'integer', minimum: 0 };
  for (const field of NUMBER_FIELDS) schema.properties[field] = { ...(schema.properties[field] || {}), type: 'number', minimum: 0 };
}

function getToolInputSchema(toolName, baseSchema = {}) {
  const schema = {
    type: 'object',
    properties: { ...(baseSchema.properties || {}) },
    required: [...(baseSchema.required || [])],
    additionalProperties: baseSchema.additionalProperties !== false
  };
  applyToolSpecificOverrides(toolName, schema);
  applyRequiredStrings(toolName, schema);
  applyPrimitiveFields(schema);
  return schema;
}

const TOOL_BASE_SCHEMAS = {
  genos_orchestrate: {
    type: 'object',
    properties: {
      mission: { type: 'string', description: 'Goal or user request to achieve.' },
      worker_assignments: workerAssignmentsSchema(),
      strategy: { type: 'string', description: 'Optional strategy hint from the available strategies.' },
      background: { type: 'boolean', description: 'Defaults to true: return a launch receipt and run detached. False waits within the MCP timeout.' },
      executor: { type: 'string', enum: ['caller_mcp', 'codex', 'local', 'hermes', 'antigravity'], description: 'Cognitive executor: Codex, Hermes/Nous, Antigravity host, or all discovered local models.' },
      provider: { type: 'string', description: 'Optional provider identity recorded for caller_mcp provenance.' },
    },
    required: ['mission'],
  },
  genos_fossil_record: {
    type: 'object',
    properties: {
      lineage_id: { type: 'string' }, reason: { type: 'string' }, mode: { type: 'string' },
      hard_parts: { type: 'array', items: { type: 'string' } },
      soft_parts_lost: { type: 'array', items: { type: 'string' } },
      phenotype_markers: { type: 'array' }, mineral_payload: { type: 'object' }
    },
    required: ['lineage_id', 'reason']
  },
  genos_fossil_list: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 1000 } } },
  genos_fossil_strata: { type: 'object', properties: {} },
  genos_fossil_excavate: { type: 'object', properties: { fossil_id: { type: 'string' } }, required: ['fossil_id'] },
  genos_fossil_decode: { type: 'object', properties: { fossil_id: { type: 'string' } }, required: ['fossil_id'] },
  genos_fossil_candidate: { type: 'object', properties: { fossil_id: { type: 'string' }, base_genome_ref: { type: 'string' } }, required: ['fossil_id'] },
  genos_delegate_worker: {
    type: 'object',
    properties: {
      mission: { type: 'string', description: 'Sub-task for the delegated worker.' },
      role: { type: 'string', description: 'Specialized role of the worker.' },
      background: { type: 'boolean', description: 'Defaults to true. False waits within the MCP timeout.' },
      executor: { type: 'string', enum: ['caller_mcp', 'codex', 'local', 'hermes', 'antigravity'], description: 'Cognitive executor inherited by the worker.' },
      provider: { type: 'string', description: 'Optional provider identity for the worker.' },
    },
    required: ['mission'],
  },
  genos_snapshot: {
    type: 'object',
    properties: {
      agent: { type: 'string', description: 'Path to the agent genome input.' },
      out: { type: 'string', description: 'Output path for the snapshot JSON.' },
    },
    required: ['agent', 'out'],
  },
  genos_replay: {
    type: 'object',
    properties: {
      snapshot: { type: 'string', description: 'Snapshot path relative to the GenOS workspace root.' },
    },
    required: [],
  },
  genos_capsule_create: {
    type: 'object',
    properties: {
      snapshot_id: { type: 'string', description: 'Source snapshot ID.' },
      seed: { type: 'string', description: 'Optional seed identifier.' },
    },
    required: ['snapshot_id'],
  },
  genos_evolution_assimilate_plasmid: {
    type: 'object',
    properties: {
      agent_id: { type: 'string', description: 'Local recipient agent that assimilates the plasmid.' },
      plasmid_id: { type: 'string', description: 'Identifier or name of the local plasmid.' },
      source_agent: { type: 'string', description: 'Optional local donor label.' },
      orchestrator_id: { type: 'string', description: 'Optional owning orchestrator; enables a bounded organization notification.' }
    },
    required: ['agent_id', 'plasmid_id']
  },
  genos_execute_primitive: {
    type: 'object',
    properties: {
      primitive_name: { type: 'string', description: 'Name of the primitive (e.g. mcts_select, stdp_update).' },
      args: { type: 'object', description: 'Input arguments for the primitive.' },
    },
    required: ['primitive_name'],
  },
  genos_procedural_registry_list: {
    type: 'object',
    properties: {
      scope: { type: 'string', enum: ['runners', 'evaluators', 'environments', 'snapshots'], description: 'Registry scope to list.' },
    },
    required: ['scope'],
  },
  genos_procedural_runner_resolve: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Runner ID to resolve.' },
    },
    required: ['id'],
  },
  genos_change_strategy: {
    type: 'object',
    properties: {
      strategy: { type: 'string', description: 'Target strategy identifier.' },
      reason: { type: 'string', description: 'Evidence justifying the transition.' },
    },
    required: ['strategy', 'reason'],
  },
  genos_report_progress: {
    type: 'object',
    properties: {
      phase: { type: 'string', description: 'Current phase name.' },
      message: { type: 'string', description: 'Outcome and next steps.' },
      progress_percent: { type: 'number', minimum: 0, maximum: 100 },
    },
    required: ['phase', 'message'],
  },
  genos_change_organization: {
    type: 'object',
    properties: {
      organization: { type: 'string', description: 'Target organization topology.' },
      reason: { type: 'string', description: 'Justification for topology change.' },
    },
    required: ['organization', 'reason'],
  },
  genos_organization_state: {
    type: 'object',
    properties: {},
  },
  genos_worker_publish: {
    type: 'object',
    properties: {
      kind: { type: 'string', description: 'Type of publication.' },
      signal_type: { type: 'string', enum: ['ligand', 'voltage', 'pheromone', 'plasmid', 'tensor'], description: 'Required non-text biomimetic signal type.' },
      signal_data: { type: ['object', 'string'], description: 'Physico-chemical signal payload (0-token) — object or string.' },
      orchestrator_id: { type: 'string', description: 'Owning orchestrator that may react to the collective signal.' }
    },
    required: ['kind', 'signal_type', 'signal_data'],
  },
  genos_worker_inbox: {
    type: 'object',
    properties: {
      after_id: { type: 'integer', description: 'Cursor offset.' },
      limit: { type: 'integer', description: 'Max messages to return.' },
      orchestrator_id: { type: 'string', description: 'Owning orchestrator to monitor.' },
    },
  },
  genos_trinity_launch: {
    type: 'object',
    properties: {
      mission: { type: 'string', description: 'Mission to analyze.' },
      variant_id: { type: 'string', enum: ['controlled', 'heterogeneous', 'adversarial', 'counterfactual', 'factorial', 'pareto', 'jury', 'recursive', 'adaptive', 'temporal', 'oracular', 'exploratory'], description: 'Optional Trinity variant; conceptual variants are rejected, and partial variants report their limits.' },
      experimental_design: { type: 'object', description: 'Composable Trinity policy axes. Omitted axes use the controlled three-world baseline.', properties: trinityDesignSchema() },
      trinity_jury: { type: 'object', description: 'Optional advisory jury configuration. Jury variant requires enabled=true and at least two distinct modelUris.', properties: { enabled: { type: 'boolean' }, modelUris: { type: 'array', items: { type: 'string' } }, maxCostUsd: { type: 'number' } } },
      worker_assignments: workerAssignmentsSchema()
    },
    required: ['mission'],
  },
  genos_a_team_preview: {
    type: 'object',
    properties: {
      project_goal: { type: 'string', description: 'Overarching project goal.' },
      sub_systems: { type: ['array', 'string'], items: { type: 'string' }, description: 'Distinct subsystems (array of strings or comma-separated string).' },
      worker_assignments: workerAssignmentsSchema(),
    },
    required: ['project_goal', 'sub_systems'],
  },
  genos_biological_mode: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['biome', 'syncytium', 'holobionte', 'biocenose', 'rhizome', 'metapopulation'], description: 'Biological organization mode.' },
        mission: { type: 'string', description: 'Mission shared by the collective.' },
        variant_id: { type: 'string', description: 'Optional variant identifier for the selected topology; unknown or incompatible variants are rejected.' },
        scope: { type: 'string', description: 'Optional session scope such as mission, workspace, project, or persistent.' },
        configuration: { type: 'object', description: 'Optional topology-specific runtime configuration.' },
        worker_assignments: workerAssignmentsSchema(),
        orchestrator_id: { type: 'string', description: 'Orchestrator whose organization should be changed.' },
    },
    required: ['mode', 'mission'],
  },
  genos_topology_session: {
    type: 'object',
    properties: {
      session_id: { type: 'string' },
      operation: { type: 'string', enum: ['snapshot', 'apply', 'schema', 'domains', 'history', 'explain', 'branch', 'promote', 'invariants', 'conflicts', 'replicas', 'health', 'morphogenesis', 'add_node', 'add_edge', 'deposit', 'direct_member', 'route', 'slime', 'gap', 'grow', 'evaporate', 'record_outcome', 'conductivity', 'bridge', 'signal', 'locus', 'repair', 'prune', 'allocate', 'forage'] },
      op: { type: 'object' }, transaction: { type: 'object' }, branch: { type: 'object' },
      node: { type: 'object' }, edge: { type: 'object' },
      signals: { type: 'object' },
      branch_id: { type: 'string' }, domain_id: { type: 'string' }, path: { type: 'string' },
      version: { type: ['string', 'number', 'object'] }, marker: { type: 'string' }, amount: { type: 'number' },
      is_repellent: { type: 'boolean' }, need: { type: ['string', 'object'] }, edges: { type: 'array', items: { type: 'object' } },
      gap_id: { type: 'string' }, candidates: { type: 'array', items: { type: 'object' } }, threshold: { type: 'number' },
      trail_kind: { type: 'string' }, capability: { type: 'string' }, source: { type: 'string' },
      evidence_refs: { type: 'array', items: { type: 'string' } }, confidence: { type: 'number' }, half_life_ms: { type: 'number' },
      scope: { type: 'string', enum: ['mission', 'workspace', 'persistent'] },
      receipt: { type: 'object' },
      alpha: { type: 'number' }, beta: { type: 'number' }, decay: { type: 'number' },
      bridge: { type: 'object' }, proof: { type: 'object' },
      signal: { type: 'object' },
      action: { type: 'string', enum: ['assign', 'transfer', 'drop'] }, locus: { type: 'object' }, locus_id: { type: 'string' },
      now: { type: 'number' }, max_idle_ms: { type: 'number' }, utility_threshold: { type: 'number' },
      populations: { type: 'array', items: { type: 'object' } }, total_budget: { type: 'number' },
      minimum_per_population: { type: 'number' }, patch_history: { type: 'array', items: { type: 'object' } },
      iteration: { type: 'number' }, elapsed_time_sec: { type: 'number' }, observations: { type: 'array' },
      current_patch_id: { type: 'string' }, current_descriptor: { type: 'string' }, current_marginal_return: { type: 'number' },
      alternative_patch: { type: 'string' }, alternative_patches: { type: 'array', items: { type: 'object' } },
      switch_cost: { type: 'number' }, population_id: { type: 'string' }, individual_id: { type: 'string' },
      migration_cost: { type: 'object' }, current_space: { type: 'object' },
      steps_without_progress: { type: 'number' }
    },
    required: ['session_id', 'operation']
  },
  genos_merge: {
    type: 'object',
    properties: {
      branch_id: { type: 'string', description: 'Branch ID to merge.' },
      conditions: { type: 'string', description: 'Conditions to satisfy.' },
    },
    required: ['branch_id'],
  },
  genos_audit: {
    type: 'object',
    properties: {
      snapshot_id: { type: 'string', description: 'Snapshot ID to audit.' },
      output: { type: 'string', description: 'Audit output path.' },
    },
    required: ['snapshot_id'],
  },
  genos_biomimicry: {
    type: 'object',
    properties: {
      feature: { type: 'string', description: 'Biomimetic feature name.' },
      action: { type: 'string', description: 'Feature action.' },
      params: { type: 'object', description: 'Optional feature parameters.' },
    },
    required: ['feature', 'action'],
  },
  genos_v2_init: {
    type: 'object',
    properties: {},
  },
  genos_v2_fork: {
    type: 'object',
    properties: {
      parent_id: { type: 'string', description: 'Parent snapshot or branch ID.' },
    },
  },
};

function normalizeMcpEnvelope(body = {}) {
  return {
    toolName: body.toolName ?? body.tool_name,
    args: body.args ?? body.arguments ?? {},
    timeoutMs: body.timeoutMs ?? body.timeout_ms
  };
}

function getFullToolSchema(toolName) {
  const baseSchema = TOOL_BASE_SCHEMAS[toolName] || {};
  return getToolInputSchema(toolName, baseSchema);
}

function validateStericOrSchema(toolName, args) {
  const { dockLigandToReceptor } = require('./mcpLigandReceptorService');
  const docking = dockLigandToReceptor(toolName, args);
  if (docking.reflexDischarged) {
    return { valid: false, reflexDischarged: true, error: docking.error, docking };
  }
  if (docking.docked) {
    return { valid: true, mode: 'catalytic_docking', docking };
  }
  return { valid: true, mode: 'fallback_json_schema', docking };
}

const BIOMIMETIC_GATING_POLICY = {
  restingPotentialMv: -70.0,
  depolarizationThresholdMv: -55.0,
  levels: [
    { level: 1, name: 'chemoreceptor_membrane_potential', target: 'zero_token_fast_filter' },
    { level: 2, name: 'thalamic_cognitive_guardrail', target: 'binary_twilight_resolution' },
    { level: 3, name: 'basal_ganglia_selective_disinhibition', target: 'striatal_affordance_recruitment' }
  ]
};

function getGatedToolSchemas(query, candidateTools = [], options = {}) {
  const { evaluateToolGating } = require('./biomimeticToolGatingService');
  const candidates = candidateTools.length > 0 ? candidateTools : Object.keys(TOOL_BASE_SCHEMAS);
  const gating = evaluateToolGating(query, candidates, options);

  const disinhibited = gating.disinhibitedTools || [];
  const schemas = {};
  for (const tool of disinhibited) {
    schemas[tool] = getFullToolSchema(tool);
  }

  return {
    gating,
    requiresTools: gating.requiresTools,
    disinhibitedTools: disinhibited,
    schemas
  };
}

module.exports = {
  MCP_CONTRACT_VERSION,
  BIOMIMETIC_GATING_POLICY,
  getToolInputSchema,
  getFullToolSchema,
  getGatedToolSchemas,
  normalizeMcpEnvelope,
  TOOL_BASE_SCHEMAS,
  validateStericOrSchema
};


