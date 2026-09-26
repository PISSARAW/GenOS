'use strict';

const { createHash } = require('crypto');

function incidentCommandFullPotential(mission, members) {
  const roles = mission.incidentRoles || {};
  const requiredRoles = ['commander', 'operations', 'planning', 'logistics'];
  const missingRoles = requiredRoles.filter(
    (role) => !roles[role] || !memberMatches(roles[role], members)
  );

  if (missingRoles.length) {
    throw new Error(`Incident command is missing assigned ICS roles: ${missingRoles.join(', ')}.`);
  }

  if (!Number.isFinite(mission.sitrepIntervalMinutes) || mission.sitrepIntervalMinutes <= 0) {
    throw new Error('Incident command requires a SITREP cadence.');
  }
  if (!Array.isArray(mission.operationalObjectives) || !mission.operationalObjectives.length) {
    throw new Error('Incident command requires operational objectives.');
  }

  const spanOfControl = clampSpanOfControl(mission.spanOfControl || 5);

  return {
    mandatory_ics_roles: buildRolesConfig(roles, requiredRoles, missingRoles),
    sitrep_cadence: buildSitrepConfig(mission),
    incident_timeline: buildTimelineConfig(mission),
    objectives_per_operational_period: buildPeriodConfig(mission),
    span_of_control: buildSpanConfig(spanOfControl),
    structured_handover: buildHandoverConfig(),
    structured_closure: buildClosureConfig()
  };
}

function memberMatches(id, members) {
  return members.some((m) => (m.memberId || m.agentId || m.workerId) === id);
}

function clampSpanOfControl(span) {
  if (span < 1) return 1;
  if (span > 7) return 7;
  return span;
}

function buildRolesConfig(roles, required, missing) {
  return {
    roles,
    required,
    allAssigned: missing.length === 0,
    assignmentVerification: true
  };
}

function buildSitrepConfig(mission) {
  return {
    intervalMinutes: mission.sitrepIntervalMinutes,
    mandatory: true,
    automatedIfPossible: mission.autoSitrep !== false,
    format: 'ics_standard_sitrep'
  };
}

function buildTimelineConfig(mission) {
  return {
    required: true,
    autoTracking: true,
    events: [],
    milestones: mission.milestones || [],
    startedAt: new Date().toISOString()
  };
}

function buildPeriodConfig(mission) {
  return {
    currentPeriod: 1,
    objectives: mission.operationalObjectives,
    periodDuration: mission.periodDurationMinutes || 120,
    objectiveAssignmentRequired: true,
    objectiveCompletionTracking: true
  };
}

function buildSpanConfig(span) {
  return {
    max: span,
    enforced: true,
    directReportsPerSupervisor: {},
    violationAction: 'reassign_or_add_supervisor'
  };
}

function buildHandoverConfig() {
  return {
    required: true,
    briefingTemplate: 'ics_handover_briefing',
    acknowledgmentRequired: true,
    handoverValidation: true,
    nextIncidentCommanderConfirmation: true,
    stateTransferComplete: true
  };
}

function buildClosureConfig() {
  return {
    required: true,
    finalSitrep: true,
    lessonsLearned: true,
    resourceRelease: true,
    afterActionReview: true,
    documentationComplete: true,
    closureApprovalRequired: true
  };
}

module.exports = { incidentCommandFullPotential };
