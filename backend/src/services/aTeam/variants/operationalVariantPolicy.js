'use strict';

const { createHash } = require('crypto');

function buildOperationalPolicy(input = {}) {
  const { mission = {}, plan = {}, members = [], boundaries = { interfaces: [] } } = input;
  const policies = {
    expert_committee: () => expertCommittee(mission, members),
    boundary_spanner: () => interfaceContracts(mission, boundaries),
    matrix_team: () => matrixDecisions(mission),
    tiger_team: () => tigerMandate(mission),
    incident_command: () => incidentStructure(mission, members),
    adaptive: () => staffingPlan(mission, members),
    relay_team: () => relayPackage(mission, members),
    cross_functional_pod: () => podOwnership(mission, members),
    pipeline: () => stageContracts(members),
    project_dag: () => stageContracts(members)
  };
  return policies[plan.variant]?.() || {};
}

function expertCommittee(mission, members) {
  const expertise = members.map((member) => ({ memberId: memberId(member), expertise: [...new Set(member.expertise || member.capabilities || [])] }));
  const conflicts = expertise.flatMap((entry, index) => expertise.slice(index + 1)
    .filter((other) => entry.expertise.some((skill) => other.expertise.includes(skill)))
    .map((other) => ({ members: [entry.memberId, other.memberId], overlap: entry.expertise.filter((skill) => other.expertise.includes(skill)) })));
  const protocol = mission.consensusProtocol || { quorum: Math.ceil(members.length * 2 / 3), dissentRequired: true, rounds: 2, tieBreak: 'evidence_review' };
  if (protocol.quorum < 1 || protocol.quorum > members.length) throw coded('Expert committee quorum is outside team size.', 'ATEAM_CONSENSUS_QUORUM_INVALID');
  return { expertiseMatrix: expertise, expertiseConflicts: conflicts, independence: { initialContext: 'mission_and_member_scope_only', sharedPeerReviews: false }, consensusProtocol: protocol, calibrationRequired: true };
}

function interfaceContracts(mission, boundaries) {
  const supplied = Array.isArray(mission.interfaceContracts) ? mission.interfaceContracts : [];
  const contracts = boundaries.interfaces.map((boundary) => {
    const found = supplied.find((contract) => contract.fromDomain === boundary.from && contract.toDomain === boundary.to);
    if (!found) throw coded(`Boundary ${boundary.from} → ${boundary.to} requires a semantic interface contract.`, 'ATEAM_INTERFACE_CONTRACT_REQUIRED');
    return { ...found, boundaryId: boundary.id, provenanceRequired: true, compatibilityChecksRequired: true, dualValidationRequired: true };
  });
  return { interfaceContracts: contracts, semanticDriftCheck: true };
}

function matrixDecisions(mission) {
  const decisions = mission.decisionAuthorities || [];
  if (!decisions.length) throw coded('Matrix team requires authority entries by decision type.', 'ATEAM_MATRIX_AUTHORITY_REQUIRED');
  const types = new Set();
  for (const entry of decisions) {
    if (!entry.decisionType || !entry.functionalOwnerId || !entry.productOwnerId || types.has(entry.decisionType)) throw coded('Matrix decision authorities must uniquely name both owners.', 'ATEAM_MATRIX_AUTHORITY_INVALID');
    types.add(entry.decisionType);
  }
  return { decisionAuthorities: decisions, disagreementResolution: mission.disagreementResolution || 'escalate_to_named_sponsor', transactionalResolution: true };
}

function tigerMandate(mission) {
  const mandate = mission.urgentMandate || {};
  if (!mandate.scope || !Number.isFinite(mandate.timeboxMinutes) || mandate.timeboxMinutes <= 0 || !mandate.stopCriteria?.length) throw coded('Tiger team requires a bounded scope, timebox and stop criteria.', 'ATEAM_TIGER_MANDATE_REQUIRED');
  return { urgentMandate: { ...mandate, temporaryPrivileges: mandate.temporaryPrivileges || [], auditRequired: true, postMortemRequired: true, privilegeReturnRequired: true } };
}

function incidentStructure(mission, members) {
  const roles = mission.incidentRoles || {};
  const required = ['commander', 'operations', 'planning', 'logistics'];
  const missing = required.filter((role) => !roles[role] || !members.some((member) => memberId(member) === roles[role]));
  if (missing.length) throw coded(`Incident command is missing assigned ICS roles: ${missing.join(', ')}.`, 'ATEAM_ICS_ROLES_REQUIRED');
  if (!Number.isFinite(mission.sitrepIntervalMinutes) || mission.sitrepIntervalMinutes <= 0 || !mission.operationalObjectives?.length) throw coded('Incident command requires a SITREP cadence and operational objectives.', 'ATEAM_ICS_PERIOD_REQUIRED');
  return { incidentRoles: roles, sitrepIntervalMinutes: mission.sitrepIntervalMinutes, operationalObjectives: mission.operationalObjectives, incidentTimelineRequired: true, handoverRequired: true, closureRequired: true };
}

function staffingPlan(mission, members) {
  const required = new Set(mission.requiredCapabilities || []);
  const covered = new Set(members.flatMap((member) => member.capabilities || member.expertise || []));
  const gaps = [...required].filter((capability) => !covered.has(capability));
  return { capabilityGaps: gaps, staffingActions: gaps.map((capability) => ({ capability, action: 'RECRUIT', verificationRequired: true })), reconfigurationCost: Number(mission.reconfigurationCost) || 0, hysteresisThreshold: Number(mission.hysteresisThreshold) || 0.2 };
}

function relayPackage(mission, members) {
  const packageBody = { version: Number(mission.handoffVersion) || 1, summary: mission.handoffSummary || '', state: mission.handoffState || {}, previousOwner: memberId(members[0]), nextOwner: memberId(members[1]) };
  return { relayHandoff: { ...packageBody, digest: createHash('sha256').update(JSON.stringify(packageBody)).digest('hex'), receiverValidationRequired: true, rollbackOwner: packageBody.previousOwner, ownershipLeaseRequired: true } };
}

function podOwnership(mission, members) {
  const owners = members.flatMap((member) => (member.ownedResponsibilities || []).map((artifact) => ({ artifact, owner: memberId(member) })));
  const externalLimit = Number.isInteger(mission.externalDependencyLimit) ? mission.externalDependencyLimit : 0;
  return { artifactOwners: owners, externalDependencyLimit: externalLimit, autonomyMetric: { dependencies: [...new Set(members.flatMap((member) => member.dependsOn || []))].length, limit: externalLimit } };
}

function stageContracts(members) {
  return { stageContracts: members.map((member) => ({ memberId: memberId(member), inputSchema: member.inputSchema || null, outputSchema: member.outputSchema || null, contractValidationRequired: true })) };
}

function memberId(member = {}) { return member.memberId || member.agentId || member.workerId || member.domain || member.subSystem || member.label || member.role || null; }
function coded(message, code) { return Object.assign(new Error(message), { code }); }

module.exports = { buildOperationalPolicy };
