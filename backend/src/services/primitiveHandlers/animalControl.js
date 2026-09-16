const CONTRACTS = Object.freeze({
  probe_system: ['target_accessible', 'probe_is_non_destructive'],
  observe_response: ['response_available'],
  infer_hidden_structure: ['response_trace_present'],
  adapt_next_action: ['inference_available'],
  follow_trace_gradient: ['search_space_available'],
  reinforce_causal_trail: ['finding_has_source'],
  falsify_false_trail: ['hypothesis_is_falsifiable'],
  peripheral_watch: ['watch_scope_defined'],
  focus_region: ['region_selected'],
  verify_focus: ['focused_evidence_available'],
  detect_weak_signal: ['baseline_available'],
  amplify_anomaly: ['signal_detected'],
  confirm_signal: ['independent_check_available'],
  build_landmark_map: ['landmarks_available'],
  navigate_by_landmark: ['map_available'],
  return_to_safe_point: ['safe_point_known'],
  safe_checkpoint: ['checkpoint_accessible'],
  validate_return: ['validation_available'],
  deposit_trace: ['finding_has_location'],
  reinforce_trace: ['confirmation_available'],
  evaporate_trace: ['decay_policy_defined'],
  assign_local_probe: ['global_intent_defined'],
  collect_limb_signal: ['worker_signal_available'],
  arbitrate_limb_feedback: ['authority_boundary_known'],
  publish_waggle_signal: ['direction_and_yield_known'],
  validate_recruitment: ['peer_feedback_available'],
  allocate_quorum_budget: ['quorum_threshold_defined'],
  adversarial_challenge: ['candidate_decision_present'],
  permission_challenge: ['permission_scope_known'],
  promotion_quarantine: ['rollback_available'],
  reduce_attack_surface: ['internal_sandbox_scope'],
  observe_threat_persistence: ['observation_window_defined'],
  restore_visibility: ['restore_condition_defined'],
  estimate_patch_yield: ['candidate_patch_present'],
  compare_metabolic_cost: ['budget_known'],
  select_next_patch: ['yield_cost_scores_available']
});

const META = Object.freeze({
  probe_system: ['FOVEAL_PERCEPTION', 'low_to_medium', 'low'],
  observe_response: ['FOVEAL_PERCEPTION', 'low', 'low'],
  infer_hidden_structure: ['EVIDENCE_BARRIER', 'medium', 'low'],
  adapt_next_action: ['STRATEGY_ADAPTATION', 'low', 'low'],
  follow_trace_gradient: ['GRAPH_MEMORY', 'low_to_medium', 'low'],
  reinforce_causal_trail: ['GRAPH_MEMORY', 'low', 'medium'],
  falsify_false_trail: ['EVIDENCE_BARRIER', 'low', 'low'],
  peripheral_watch: ['OBSERVABILITY', 'low', 'low'],
  focus_region: ['FOVEAL_PERCEPTION', 'low', 'low'],
  verify_focus: ['EVIDENCE_BARRIER', 'low', 'low'],
  detect_weak_signal: ['OBSERVABILITY', 'low', 'low'],
  amplify_anomaly: ['HALLUCINATION_MONITORING', 'medium', 'medium'],
  confirm_signal: ['EVIDENCE_BARRIER', 'low', 'low'],
  build_landmark_map: ['GRAPH_MEMORY', 'medium', 'low'],
  navigate_by_landmark: ['GRAPH_MEMORY', 'low', 'low'],
  return_to_safe_point: ['RESILIENCE_RECOVERY', 'low', 'low'],
  safe_checkpoint: ['CAPSULES_SNAPSHOTS', 'low', 'low'],
  validate_return: ['EVIDENCE_BARRIER', 'low', 'low'],
  deposit_trace: ['STIGMERGY', 'low', 'medium'],
  reinforce_trace: ['STIGMERGY', 'low', 'medium'],
  evaporate_trace: ['STIGMERGY', 'low', 'low'],
  assign_local_probe: ['SIGNALING_BUS', 'medium', 'low'],
  collect_limb_signal: ['SIGNALING_BUS', 'low', 'low'],
  arbitrate_limb_feedback: ['GOVERNANCE_APPROVAL', 'low', 'low'],
  publish_waggle_signal: ['SIGNALING_BUS', 'low', 'medium'],
  validate_recruitment: ['QUORUM', 'low', 'low'],
  allocate_quorum_budget: ['TOKEN_ECONOMY', 'medium', 'medium'],
  adversarial_challenge: ['IMMUNE_SYSTEM', 'medium', 'low'],
  permission_challenge: ['OUTPUT_GOVERNOR', 'low', 'low'],
  promotion_quarantine: ['PROMOTION_GATE', 'medium', 'low'],
  reduce_attack_surface: ['VFS_SANDBOX', 'low', 'medium'],
  observe_threat_persistence: ['IMMUNE_SYSTEM', 'low', 'medium'],
  restore_visibility: ['RESILIENCE_RECOVERY', 'low', 'low'],
  estimate_patch_yield: ['TOKEN_ECONOMY', 'low', 'low'],
  compare_metabolic_cost: ['TOKEN_ECONOMY', 'low', 'low'],
  select_next_patch: ['TOKEN_ECONOMY', 'low', 'low']
});

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function confidence(context) {
  const raw = Number(context.confidence ?? context.score ?? 0.5);
  if (!Number.isFinite(raw)) return 0.5;
  return Math.min(1, Math.max(0, raw));
}

function evidence(context, primitive) {
  const source = asArray(context.evidence || context.traces || context.receipts);
  if (source.length) return source;
  return [`primitive:${primitive}`, `timestamp:${new Date().toISOString()}`];
}

function stateFor(context) {
  return {
    trigger: context.stimulus || context.trigger || context.problem || null,
    location: context.location || context.target || context.region || null,
    confidence: confidence(context)
  };
}

function feedbackFor(context, primitive) {
  return {
    expected: context.expectedFeedback || context.feedback || 'reinforce_or_falsify_signal',
    failureModes: asArray(context.failureModes).concat(CONTRACTS[primitive].length ? [] : ['unknown_primitive_contract'])
  };
}

async function execute(primitive, context = {}) {
  const contract = CONTRACTS[primitive];
  if (!contract) return { success: false, error: `Unknown animal control primitive '${primitive}'.`, code: 'ANIMAL_PRIMITIVE_UNKNOWN' };
  const [capability, cost, risk] = META[primitive];
  return {
    success: true,
    primitive,
    capability,
    controlLoop: ['stimulus', 'internal_state', 'decision', 'action', 'feedback', 'evidence'],
    preconditions: contract,
    action: primitive,
    state: stateFor(context),
    feedback: feedbackFor(context, primitive),
    output: {
      map: context.map || context.partialStructure || null,
      confidence: confidence(context),
      nextProbe: context.nextProbe || null
    },
    cost,
    risk,
    guardrails: primitive === 'reduce_attack_surface' ? ['internal_sandbox_only', 'no_user_deception'] : ['rollback_required', 'evidence_required'],
    evidence: evidence(context, primitive)
  };
}

const HANDLERS = Object.fromEntries(Object.keys(CONTRACTS).map((primitive) => [primitive, (context) => execute(primitive, context)]));

module.exports = { HANDLERS, CONTRACTS, execute };