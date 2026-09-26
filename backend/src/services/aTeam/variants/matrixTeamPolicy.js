'use strict';

function matrixTeamFullPotential(mission) {
  const decisions = mission.decisionAuthorities || [];
  if (!decisions.length) throw new Error('Matrix team requires authority entries by decision type.');

  const raciMatrix = {};
  const conflictingOwners = [];
  const escalationPaths = {};

  for (const entry of decisions) {
    if (!entry.decisionType || !entry.functionalOwnerId || !entry.productOwnerId) {
      throw new Error('Matrix decision authorities must uniquely name both owners.');
    }
    if (raciMatrix[entry.decisionType]) {
      throw new Error('Duplicate decision type in matrix authority.');
    }

    raciMatrix[entry.decisionType] = buildRaciEntry(entry);
    if (hasOwnerConflict(entry)) {
      conflictingOwners.push(buildConflictEntry(entry));
    }
    escalationPaths[entry.decisionType] = buildEscalationPath(entry);
  }

  return {
    authority_matrix_by_decision_type: {
      axes: ['functional', 'product'],
      decisionTypes: decisions.map((d) => d.decisionType),
      consultationRule: 'consult_both_owners',
      vetoMechanism: true,
      vetoRights: buildVetoRights(decisions)
    },
    conflicting_owners: buildConflictingOwnersResult(conflictingOwners),
    escalation_paths: escalationPaths,
    raci_dimensions: {
      raciMatrix,
      decisionLog: [],
      transactionalResolution: true,
      disagreementResolution: mission.disagreementResolution || 'escalate_to_named_sponsor'
    },
    transactional_disagreement_resolution: buildTransactionalResolution(mission)
  };
}

function buildRaciEntry(entry) {
  return {
    responsible: entry.responsibleIds || [entry.functionalOwnerId, entry.productOwnerId],
    accountable: entry.accountableId || entry.functionalOwnerId,
    consulted: entry.consultedIds || [],
    informed: entry.informedIds || [],
    functionalOwner: entry.functionalOwnerId,
    productOwner: entry.productOwnerId,
    vetoRights: entry.vetoRights || { functional: false, product: false }
  };
}

function hasOwnerConflict(entry) {
  return entry.functionalOwnerId === entry.productOwnerId;
}

function buildConflictEntry(entry) {
  return {
    decisionType: entry.decisionType,
    conflict: 'Same owner for both functional and product axes',
    resolution: 'split_ownership_required'
  };
}

function buildEscalationPath(entry) {
  const path = entry.escalationPath || [
    { level: 1, role: 'functional_owner', authority: entry.functionalOwnerId },
    { level: 2, role: 'product_owner', authority: entry.productOwnerId },
    { level: 3, role: 'named_sponsor', authority: entry.sponsorId || null }
  ];
  return path.filter((p) => p.authority);
}

function buildVetoRights(decisions) {
  const rights = {};
  for (const d of decisions) {
    rights[d.decisionType] = d.vetoRights || { functional: false, product: false };
  }
  return rights;
}

function buildConflictingOwnersResult(conflicts) {
  if (!conflicts.length) return { detected: [], resolution: 'no_conflicts' };
  return { detected: conflicts, resolution: 'resolve_before_activation' };
}

function buildTransactionalResolution(mission) {
  return {
    enabled: true,
    bothApprovalsRequired: true,
    functionalApprovalRequired: true,
    productApprovalRequired: true,
    escalationOnDeadlock: true,
    escalationTarget: mission.escalationTarget || 'named_sponsor',
    revisionTracking: true,
    approvalAuditTrail: true
  };
}

module.exports = { matrixTeamFullPotential };
