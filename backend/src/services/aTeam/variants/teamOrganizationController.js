'use strict';

const { buildVariantPlan } = require('./variantRegistry');

function planOrganizations(input = {}) {
  const phases = Array.isArray(input.phases) && input.phases.length ? input.phases : [{ id: 'mission', ...input.mission }];
  return phases.map((phase, index) => ({
    phaseId: phase.id || `phase-${index + 1}`,
    ...buildVariantPlan({ ...input.mission, ...phase })
  }));
}

function transitionOrganization(currentPlan, nextPlan, evidence = {}) {
  if (!nextPlan || !nextPlan.variant) throw Object.assign(new Error('A target organization plan is required.'), { code: 'ATEAM_ORGANIZATION_TARGET_REQUIRED' });
  return {
    from: currentPlan?.variant || null,
    to: nextPlan.variant,
    changed: currentPlan?.variant !== nextPlan.variant,
    reason: evidence.reason || (currentPlan?.variant === nextPlan.variant ? 'same_fit' : 'phase_fit_changed'),
    evidence: Array.isArray(evidence.evidence) ? evidence.evidence : []
  };
}

module.exports = { planOrganizations, transitionOrganization };
