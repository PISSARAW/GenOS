'use strict';

function tigerTeamFullPotential(mission) {
  const mandate = resolveMandate(mission);
  validateMandate(mandate);

  return {
    hard_timebox: buildHardTimebox(mandate),
    emergency_scope: buildEmergencyScope(mandate),
    temporary_privileges: buildTemporaryPrivileges(mandate),
    full_audit: buildFullAudit(),
    stop_criteria: buildStopCriteria(mandate),
    privilege_return: buildPrivilegeReturn(mandate),
    automatic_postmortem: buildAutomaticPostmortem(mandate)
  };
}

function resolveMandate(mission) {
  return mission.urgentMandate || {};
}

function validateMandate(mandate) {
  if (!mandate.scope) throw new Error('Tiger team requires a bounded scope.');
  if (!Number.isFinite(mandate.timeboxMinutes) || mandate.timeboxMinutes <= 0) {
    throw new Error('Tiger team requires a valid timebox.');
  }
  if (!Array.isArray(mandate.stopCriteria) || !mandate.stopCriteria.length) {
    throw new Error('Tiger team requires stop criteria.');
  }
}

function buildHardTimebox(mandate) {
  return {
    durationMinutes: mandate.timeboxMinutes,
    absoluteDeadline: Date.now() + mandate.timeboxMinutes * 60000,
    autoTerminate: true,
    gracePeriodMinutes: mandate.gracePeriodMinutes || 0,
    terminationOnExpiry: true
  };
}

function buildEmergencyScope(mandate) {
  return {
    bounded: true,
    scope: mandate.scope,
    allowedActions: mandate.allowedActions || [],
    prohibitedActions: mandate.prohibitedActions || [],
    resourceLimits: mandate.resourceLimits || {},
    scopeChangeRequiresCommanderApproval: true
  };
}

function buildTemporaryPrivileges(mandate) {
  return {
    granted: true,
    privileges: mandate.temporaryPrivileges || [],
    scopeLimited: true,
    timeLimited: true,
    requireExplicitAuthorization: true
  };
}

function buildFullAudit() {
  return {
    enabled: true,
    logAllActions: true,
    immutableLog: true,
    evidenceRetention: true,
    everyDecisionLogged: true,
    everyActionAttributed: true
  };
}

function buildStopCriteria(mandate) {
  return mandate.stopCriteria.map((criterion, index) => ({
    criterionId: `stop_${index + 1}`,
    description: extractDescription(criterion),
    evaluated: false,
    evidenceRequired: true,
    mustBeExplicit: true
  }));
}

function extractDescription(criterion) {
  return typeof criterion === 'string' ? criterion : criterion.description;
}

function buildPrivilegeReturn(mandate) {
  return {
    required: true,
    deadlineMinutes: mandate.privilegeReturnMinutes || 60,
    verificationRequired: true,
    allPrivilegesRevoked: true,
    confirmationRequired: true
  };
}

function buildAutomaticPostmortem(mandate) {
  return {
    required: true,
    template: 'tiger_team_postmortem',
    participants: 'all_members',
    deadlineHours: mandate.postMortemHours || 24,
    mustInclude: [
      'timeline',
      'decisions',
      'stop_criteria_evaluation',
      'privilege_return_verification',
      'lessons_learned'
    ],
    automatedTriggerOnCompletion: true
  };
}

module.exports = { tigerTeamFullPotential };
