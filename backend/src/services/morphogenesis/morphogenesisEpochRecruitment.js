'use strict';

const MAX_COHORT_WORKERS = 12;

function preferredCohortSize(state, survivorCount) {
  const configured = Number(state.normalizedMission?.morphogenesisPolicy?.targetWorkers);
  const requested = Number.isSafeInteger(configured) && configured > 0
    ? configured : Math.max(3, survivorCount);
  return Math.max(1, Math.min(MAX_COHORT_WORKERS, requested));
}

function reserveCohortBudget(budget, preferredSize, controller) {
  let last = null;
  for (let count = preferredSize; count > 0; count -= 1) {
    const reservation = controller.reserveEpoch(budget, count);
    if (reservation.status === 'reserved') return { ...reservation, targetWorkerCount: count };
    last = reservation;
  }
  return { ...last, targetWorkerCount: 0 };
}

function candidateWorkers(adaptation, survivors, limit) {
  if (adaptation.rosterIntervention) {
    const retained = new Set(adaptation.rosterPlan?.retainedWorkerIds || []);
    return survivors.filter((survivor) => retained.has(survivor.agentId)).slice(0, limit);
  }
  const assignments = adaptation.cohortBlueprint?.assignments;
  if (!Array.isArray(assignments) || !assignments.length) return survivors;
  return assignments.slice(0, limit).map((assignment, index) => {
    const candidateId = assignment.candidateId || assignment.sourceAgentId || `cohort-slot-${index + 1}`;
    return { ...assignment, agentId: candidateId, candidateId,
      sourceAgentId: assignment.sourceAgentId || null, status: 'completed',
      payload: assignment.sourceEvidence || {} };
  });
}

function cohortAssignment(blueprint, candidate, index) {
  const candidateId = candidate.candidateId || candidate.agentId;
  const assignment = blueprint.assignments.find((entry, entryIndex) =>
    (entry.candidateId || entry.sourceAgentId || `cohort-slot-${entryIndex + 1}`) === candidateId);
  if (!assignment) throw Object.assign(new Error('MORPHOGENESIS_COHORT_CANDIDATE_MISSING'), {
    code: 'MORPHOGENESIS_COHORT_CANDIDATE_MISSING'
  });
  return assignment;
}

module.exports = { MAX_COHORT_WORKERS, preferredCohortSize, reserveCohortBudget,
  candidateWorkers, cohortAssignment };
