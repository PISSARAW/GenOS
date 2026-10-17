'use strict';

const crypto = require('node:crypto');

const CANDIDATE_ID = 'roster-reduction:retain-evidence-front-v1';

function digest(plan) {
  const body = { candidateId: CANDIDATE_ID,
    currentWorkerIds: [...(plan.currentWorkerIds || [])].sort(),
    retainedWorkerIds: [...(plan.retainedWorkerIds || [])].sort(),
    requiredRoles: [...(plan.requiredRoles || [])].sort() };
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')}`;
}

function reasonFor(plan) {
  const current = plan?.currentWorkerIds;
  const retained = plan?.retainedWorkerIds;
  return shapeReason(current, retained) || roleReason(plan, retained);
}

function shapeReason(current, retained) {
  if (!Array.isArray(current) || !Array.isArray(retained)) return 'roster_reduction_plan_missing';
  if (current.length < 2 || retained.length < 1
    || retained.length >= current.length) return 'strict_roster_reduction_required';
  if (new Set(current).size !== current.length
    || new Set(retained).size !== retained.length) return 'roster_worker_identity_duplicated';
  return retained.some((id) => !current.includes(id))
    ? 'retained_worker_outside_current_roster' : null;
}

function roleReason(plan, retained) {
  const retainedRoles = new Set((plan.workers || [])
    .filter((worker) => retained.includes(worker.agentId)).map((worker) => worker.role).filter(Boolean));
  return (plan.requiredRoles || []).some((role) => !retainedRoles.has(role))
    ? 'required_role_would_be_removed' : null;
}

function describeAvailability(plan = null) {
  const reason = reasonFor(plan);
  return { candidateId: CANDIDATE_ID, scale: 'ROSTER_REDUCTION',
    status: reason ? 'unavailable' : 'available', reason,
    planDigest: reason ? null : digest(plan),
    retainedWorkerIds: reason ? [] : [...plan.retainedWorkerIds],
    removedWorkerIds: reason ? [] : plan.currentWorkerIds.filter((id) => !plan.retainedWorkerIds.includes(id)) };
}

function applyRosterReduction(mission = {}, selection = null, plan = null) {
  const availability = describeAvailability(plan);
  const selected = selection?.candidateId === CANDIDATE_ID
    && selection.scale === 'ROSTER_REDUCTION' && selection.status === 'selected';
  if (!selected) return { applied: false, reason: 'action_not_selected', mission };
  if (availability.status !== 'available') return { applied: false, reason: availability.reason, mission };
  if (!availability.retainedWorkerIds.includes(mission.agentId)) {
    return { applied: false, reason: 'worker_not_retained', mission };
  }
  if (!selection.transitionId) return { applied: false, reason: 'transition_identity_missing', mission };
  return { applied: true, reason: null, mission: { ...mission,
    rosterIntervention: { candidateId: CANDIDATE_ID, status: 'retained_at_epoch_boundary',
      transitionId: selection.transitionId, planDigest: availability.planDigest } } };
}

module.exports = { CANDIDATE_ID, digest, describeAvailability, applyRosterReduction };
