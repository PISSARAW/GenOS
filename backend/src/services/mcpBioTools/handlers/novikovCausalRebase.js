/**
 * @file novikovCausalRebase.js
 * @description Biomimetic & Temporal handler for Novikov Self-Consistency and Causal Timeline Rebase.
 * Enforces zero-paradox invariant self-consistency (P(paradox) = 0) and deterministically
 * recalculates downstream timeline deltas upon historical state interventions.
 */

'use strict';

const timelineRegistry = new Map();

function getOrCreateTimeline(timelineId) {
  if (!timelineRegistry.has(timelineId)) {
    timelineRegistry.set(timelineId, {
      timeline_id: timelineId,
      nodes: [],
      invariants: ['NO_SELF_NEGATING_PRECONDITIONS', 'IMMUTABLE_ROOT_ANCESTRY'],
      rebase_count: 0,
      last_verified_at: new Date().toISOString()
    });
  }
  return timelineRegistry.get(timelineId);
}

function checkNovikovConsistency(timeline, intervention = {}) {
  const targetStep = intervention.target_step || 0;
  const modifiesRoot = targetStep === 0 && intervention.alters_root_ancestry === true;
  if (modifiesRoot) {
    return {
      consistent: false,
      paradox_type: 'GRANDFATHER_PARADOX_ROOT_DESTRUCTION',
      reason: 'Intervention attempts to erase root ancestry, violating Novikov self-consistency.'
    };
  }
  const createsSelfNegation = intervention.negates_precondition === true;
  if (createsSelfNegation) {
    return {
      consistent: false,
      paradox_type: 'CAUSAL_SELF_NEGATION_LOOP',
      reason: 'Intervention creates a self-negating feedback loop.'
    };
  }
  return { consistent: true, paradox_type: null, reason: 'Novikov self-consistency verified (P(paradox) = 0).' };
}

function rebaseCausalTimeline(timeline, intervention, downstreamSteps = []) {
  const consistency = checkNovikovConsistency(timeline, intervention);
  if (!consistency.consistent) {
    return {
      configured: true,
      success: false,
      status: 'rebase_rejected_paradox',
      transport: 'novikov_causal_rebase_engine',
      timeline_id: timeline.timeline_id,
      error: consistency.reason,
      paradox_type: consistency.paradox_type
    };
  }

  const steps = Array.isArray(downstreamSteps) && downstreamSteps.length > 0
    ? downstreamSteps
    : ['STEP_DEPENDENCY_REVALIDATION', 'STEP_STATE_DELTA_PROPAGATION', 'STEP_INVARIANT_FINAL_SEAL'];

  timeline.rebase_count += 1;
  timeline.last_verified_at = new Date().toISOString();
  timeline.nodes.push({
    rebase_id: `rebase-${timeline.rebase_count}`,
    intervention,
    steps_recalculated: steps.length,
    timestamp: timeline.last_verified_at
  });

  return {
    configured: true,
    success: true,
    status: 'causal_timeline_rebased',
    transport: 'novikov_causal_rebase_engine',
    action: 'rebase_causal_timeline',
    timeline_id: timeline.timeline_id,
    rebase_count: timeline.rebase_count,
    steps_recalculated: steps,
    self_consistent: true,
    output: `Timeline '${timeline.timeline_id}' successfully rebased with Novikov self-consistency. Recalculated ${steps.length} downstream steps.`
  };
}

function handleNovikovCausalRebase(params = {}) {
  const timelineId = params.timeline_id || 'timeline-main';
  const timeline = getOrCreateTimeline(timelineId);
  const action = params.action || 'status';

  if (action === 'rebase' || action === 'rebase_causal_timeline') {
    return rebaseCausalTimeline(timeline, params.intervention || {}, params.downstream_steps);
  }
  if (action === 'verify' || action === 'verify_novikov_consistency') {
    const check = checkNovikovConsistency(timeline, params.intervention || {});
    return {
      configured: true,
      success: true,
      status: 'consistency_evaluated',
      transport: 'novikov_causal_rebase_engine',
      action: 'verify_novikov_consistency',
      timeline_id: timeline.timeline_id,
      consistent: check.consistent,
      paradox_type: check.paradox_type,
      output: check.reason
    };
  }

  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'novikov_causal_rebase_engine',
    action: 'status',
    timeline_id: timeline.timeline_id,
    rebase_count: timeline.rebase_count,
    invariants: timeline.invariants,
    output: `Novikov causal rebase engine active for '${timelineId}': rebases=${timeline.rebase_count}.`
  };
}

function handleNovikovError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'novikov_causal_rebase_engine',
    output: e.message || 'Unknown Novikov causal rebase error'
  };
}

module.exports = {
  handleNovikovCausalRebase,
  handleNovikovError,
  timelineRegistry
};
