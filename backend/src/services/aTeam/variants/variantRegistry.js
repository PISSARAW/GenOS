'use strict';

const VARIANTS = Object.freeze({
  expert_committee: {
    organization: 'specialist_expert_committee',
    minMembers: 3,
    communication: 'parallel_review',
    authority: 'consensus',
    maturity: 'implemented',
    description: 'Non-redundant experts produce parallel analyses then a joint decision. Architecture, multi-domain audit.',
    fullPotential: [
      'real_initial_independence',
      'expertise_matrix',
      'competency_conflicts',
      'calibration_protocol',
      'explicit_consensus_dissent'
    ],
    requiredCapabilities: ['analysis', 'domain_expertise', 'evidence_evaluation'],
    preconditions: ['minMembers >= 3', 'diverse_expertise']
  },
  pipeline: {
    organization: 'specialist_expert_committee',
    minMembers: 2,
    communication: 'sequential_handoff',
    authority: 'stage_owner',
    maturity: 'implemented',
    description: 'A→B→C, each stage transforms the previous artifact. Serialized dependencies with TYPED_STAGE_HANDOFF.',
    fullPotential: [
      'input_output_schemas_per_stage',
      'contractual_validation',
      'local_retry',
      'backpressure',
      'streaming',
      'stage_cache',
      'resume_from_last_valid'
    ],
    requiredCapabilities: ['sequential_processing', 'schema_validation', 'artifact_transformation'],
    preconditions: ['ordered_stages', 'defined_contracts']
  },
  project_dag: {
    organization: 'specialist_expert_committee',
    minMembers: 2,
    communication: 'dependency_driven',
    authority: 'node_owner',
    maturity: 'implemented',
    description: 'Generalization of pipeline with parallel branches and joins. WorkGraph DAG enables parallel execution.',
    fullPotential: [
      'critical_path_scheduler',
      'resource_scheduling',
      'typed_fan_in_fan_out',
      'conditional_joins',
      'incremental_invalidation',
      'minimal_recalculation'
    ],
    requiredCapabilities: ['dag_execution', 'dependency_management', 'parallel_coordination'],
    preconditions: ['acyclic_graph', 'defined_dependencies']
  },
  cross_functional_pod: {
    organization: 'specialist_expert_committee',
    minMembers: 3,
    communication: 'continuous_sync',
    authority: 'pod_lead',
    maturity: 'implemented',
    description: 'Small autonomous team with all end-to-end skills. Continuous sync and peer domain consultation.',
    fullPotential: [
      'limit_external_dependencies',
      'artifact_ownership',
      'full_design_build_test_ship',
      'autonomy_metric',
      'contractual_boundaries'
    ],
    requiredCapabilities: ['full_lifecycle', 'cross_domain', 'autonomous_delivery'],
    preconditions: ['complete_skill_coverage', 'bounded_context']
  },
  boundary_spanner: {
    organization: 'specialist_expert_committee',
    minMembers: 2,
    communication: 'contracted_interfaces',
    authority: 'domain_owners',
    maturity: 'implemented',
    description: 'Translation/interface specialists between domains. Runtime detects interfaces and assigns owners.',
    fullPotential: [
      'semantic_contract_models',
      'translation_schemas',
      'compatibility_tests',
      'transformation_provenance',
      'semantic_drift_detection',
      'dual_domain_validation'
    ],
    requiredCapabilities: ['domain_translation', 'interface_management', 'contract_validation'],
    preconditions: ['multiple_domains', 'defined_interfaces']
  },
  matrix_team: {
    organization: 'specialist_expert_committee',
    minMembers: 3,
    communication: 'dual_reporting',
    authority: 'shared',
    maturity: 'partial',
    description: 'Each member reports to both a product axis and a functional axis. Authority matrix with dual consultation.',
    fullPotential: [
      'authority_matrix_by_decision_type',
      'conflicting_owners',
      'escalation_paths',
      'raci_dimensions',
      'transactional_disagreement_resolution'
    ],
    requiredCapabilities: ['dual_authority', 'conflict_resolution', 'decision_governance'],
    preconditions: ['defined_decision_types', 'dual_ownership_structure']
  },
  tiger_team: {
    organization: 'specialist_expert_committee',
    minMembers: 2,
    communication: 'incident_channel',
    authority: 'commander',
    maturity: 'implemented',
    description: 'Small urgent unit with limited mandate and commander. Dedicated incident channel and authority.',
    fullPotential: [
      'hard_timebox',
      'emergency_scope',
      'temporary_privileges',
      'full_audit',
      'stop_criteria',
      'privilege_return',
      'automatic_postmortem'
    ],
    requiredCapabilities: ['rapid_response', 'incident_management', 'authority_delegation'],
    preconditions: ['urgent_mission', 'bounded_scope', 'explicit_mandate']
  },
  incident_command: {
    organization: 'specialist_expert_committee',
    minMembers: 3,
    communication: 'fixed_briefings',
    authority: 'incident_commander',
    maturity: 'partial',
    description: 'ICS-like structure: commander + ops + planning + logistics. Commander and policy exist; full ICS not materialized.',
    fullPotential: [
      'mandatory_ics_roles',
      'sitrep_cadence',
      'incident_timeline',
      'objectives_per_operational_period',
      'span_of_control',
      'structured_handover',
      'structured_closure'
    ],
    requiredCapabilities: ['ics_structure', 'incident_management', 'period_based_execution'],
    preconditions: ['multi_role_team', 'defined_operational_periods']
  },
  multiteam: {
    organization: 'specialist_expert_committee',
    minMembers: 4,
    communication: 'integration_council',
    authority: 'council',
    maturity: 'implemented',
    description: 'Multiple autonomous A-Teams united around a meta-mission. composeMultiteam() is actually called.',
    fullPotential: [
      'recursive_team_of_teams',
      'local_and_system_objectives',
      'integration_council',
      'inter_team_contracts',
      'boundary_spanners',
      'global_local_budget',
      'systemic_conflict_detection'
    ],
    requiredCapabilities: ['multi_team_coordination', 'contract_management', 'budget_allocation'],
    preconditions: ['multiple_subteams', 'meta_mission']
  },
  adaptive: {
    organization: 'specialist_expert_committee',
    minMembers: 2,
    communication: 'feedback_loop',
    authority: 'phase_owner',
    maturity: 'partial',
    description: 'Team changes with the problem: recruits, releases, reorganizes. Runtime plans phases but dynamic gap→recruit→verify→release loop is less complete.',
    fullPotential: [
      'continuous_staffing_by_capability_gap',
      'real_recruitment',
      'transactional_morphogenesis_transition',
      'memory_transfer',
      'reconfiguration_cost',
      'hysteresis_anti_thrashing'
    ],
    requiredCapabilities: ['dynamic_reconfiguration', 'capability_gap_detection', 'morphogenesis_integration'],
    preconditions: ['uncertain_requirements', 'evolving_mission']
  },
  relay_team: {
    organization: 'specialist_expert_committee',
    minMembers: 2,
    communication: 'serialized_handoff',
    authority: 'current_owner',
    maturity: 'implemented',
    description: 'Single holder of full context at a time; exclusive sequential transfer. EXCLUSIVE_SERIAL_TRANSFER.',
    fullPotential: [
      'cryptographic_versioned_handoff',
      'receiver_validation',
      'controlled_summary',
      'state_ownership_lease',
      'rollback_to_previous_owner'
    ],
    requiredCapabilities: ['exclusive_context', 'secure_handoff', 'state_management'],
    preconditions: ['sequential_execution', 'single_context_holder']
  }
});

function countMatches(pattern, text) {
  return (text.match(pattern) || []).length;
}

const TEXT_PATTERNS = Object.freeze({
  tiger_team: /\burgent\b|\bcritical\b|zero-day|incident|\burgence\b|timebox/gi,
  incident_command: /\boutage\b|\bpanne\b|incident multi|\bcrise\b|\bics\b|incident\.command/gi,
  pipeline: /\bcollect\b|\bextract\b|summari|publish|séquence|sequence|pipeline|linear/gi,
  cross_functional_pod: /feature|end\.to\.end|bout en bout|\bproduct\b|autonomous|full\.lifecycle/gi
});

function scoreVariant(name, mission = {}) {
  const text = String(mission.goal || mission.mission || '').toLowerCase();
  return textHits(name, text) + structuredHits(name, mission);
}

function textHits(name, text) {
  const pattern = TEXT_PATTERNS[name];
  if (!pattern) return 0;
  return countMatches(pattern, text);
}

function structuredHits(name, mission) {
  const hits = {
    multiteam: Number(mission.teamCount) > 1 || Boolean(mission.subTeams?.length),
    boundary_spanner: Number(mission.interfaceCount) > 1 || Boolean(mission.boundaries?.interfaces?.length),
    matrix_team: Boolean(mission.functionalAndProductOwners) || Boolean(mission.decisionAuthorities?.length),
    relay_team: Boolean(mission.singleContextOwner) || Boolean(mission.sequentialContext),
    adaptive: Number(mission.uncertainty) >= 0.7 || Boolean(mission.evolvingRequirements),
    project_dag: Number(mission.parallelWorkstreams) > 1 || Boolean(mission.dagNodes?.length)
  };
  return hits[name] ? 1 : 0;
}

function selectVariant(mission = {}) {
  const requested = mission.variant;
  if (requested) {
    if (!VARIANTS[requested]) throw Object.assign(new Error(`Unknown A-Team variant '${requested}'.`), { code: 'ATEAM_VARIANT_UNKNOWN' });
    return requested;
  }
  const candidates = Object.keys(VARIANTS).filter((name) => name !== 'expert_committee');
  const scored = candidates.map((name) => ({ name, score: scoreVariant(name, mission) }));
  scored.sort((left, right) => right.score - left.score);
  const best = scored[0];
  return best && best.score > 0 ? best.name : 'expert_committee';
}

function buildVariantPlan(mission = {}) {
  const variant = selectVariant(mission);
  const policy = VARIANTS[variant];
  return {
    variant,
    ...policy,
    minMembers: Math.max(policy.minMembers, Number(mission.minMembers) || 0),
    evidence: {
      explicit: Boolean(mission.variant),
      signals: Object.keys(mission).filter((key) => Boolean(mission[key]))
    }
  };
}

function getVariantInfo(variant) {
  const definition = VARIANTS[variant];
  return definition ? { id: variant, ...definition } : null;
}

function listVariants() {
  return Object.entries(VARIANTS).map(([id, def]) => ({ id, ...def }));
}

module.exports = { VARIANTS, selectVariant, buildVariantPlan, scoreVariant, getVariantInfo, listVariants };
