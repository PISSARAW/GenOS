'use strict';

function calculateConflictSeverity(entry, other) {
  const overlap = entry.expertise.filter((skill) => other.expertise.includes(skill)).length;
  const total = new Set([...entry.expertise, ...other.expertise]).size;
  return overlap / total;
}

function buildCompatibilityMatrix(contracts) {
  const domains = [...new Set(contracts.flatMap((c) => [c.fromDomain, c.toDomain]))];
  const matrix = {};
  for (const from of domains) {
    matrix[from] = {};
    for (const to of domains) {
      if (from === to) continue;
      const contract = contracts.find((c) => c.fromDomain === from && c.toDomain === to);
      matrix[from][to] = contract ? {
        compatible: true,
        driftRisk: contract.semanticDriftDetection?.threshold || 0.15,
        dualValidated: contract.dualValidationRequired === true
      } : { compatible: false, reason: 'no_contract' };
    }
  }
  return matrix;
}

function buildEscalationPaths(decisions) {
  const paths = {};
  for (const decision of decisions) {
    paths[decision.decisionType] = decision.escalationPath || [
      { level: 1, role: 'functional_owner', authority: decision.functionalOwnerId },
      { level: 2, role: 'product_owner', authority: decision.productOwnerId },
      { level: 3, role: 'named_sponsor', authority: decision.sponsorId || null }
    ].filter((p) => p.authority);
  }
  return paths;
}

function buildDivisions(members, roles, spanOfControl) {
  const leaders = ['operations', 'planning', 'logistics', 'safety', 'liaison', 'publicInfo']
    .map((role) => ({ role, id: roles[role] }))
    .filter((entry) => entry.id);
  const assignments = leaders.map(({ role, id }) => ({
    divisionId: role,
    supervisor: id,
    members: members.filter((member) => member.supervisorId === id && memberId(member) !== id).map(memberId)
  }));
  if (leaders.length > spanOfControl) throw Object.assign(new Error('Incident commander exceeds span of control.'), { code: 'ATEAM_ICS_SPAN_EXCEEDED' });
  for (const member of members) {
    const id = memberId(member);
    if (!id || id === roles.commander || leaders.some((leader) => leader.id === id)) continue;
    const assigned = assignments.find((division) => division.supervisor === member.supervisorId);
    const fallback = assignments.find((division) => division.divisionId === 'operations');
    (assigned || fallback).members.push(id);
  }
  for (const division of assignments) {
    if (division.members.length > spanOfControl) throw Object.assign(new Error(`ICS supervisor ${division.supervisor} exceeds span of control.`), { code: 'ATEAM_ICS_SPAN_EXCEEDED' });
    division.spanOfControl = spanOfControl;
  }
  return assignments;
}

function normalizeStopCriteria(criteria) {
  return criteria.map((criterion, index) => typeof criterion === 'string'
    ? { criterionId: `stop_${index + 1}`, description: criterion, evaluated: false, evidenceRequired: true }
    : { ...criterion, evaluated: false, evidenceRequired: true });
}

function validateControlledSummary(summary, maxLength) {
  if (summary.length > maxLength) throw Object.assign(new Error('Relay summary exceeds the configured length limit.'), { code: 'ATEAM_RELAY_SUMMARY_TOO_LONG' });
  return summary;
}

function calculateAutonomyMetric(dependencies, limit) {
  if (limit === 0) return dependencies.length === 0 ? 1 : 0;
  return Math.max(0, 1 - dependencies.length / limit);
}

function buildInternalContracts(members) {
  return members.flatMap((member) =>
    (member.internalContracts || []).map((contract) => ({
      ...contract,
      from: memberId(member),
      validated: false
    }))
  );
}

function buildExternalContracts(mission, members) {
  return (mission.externalContracts || []).map((contract) => ({
    ...contract,
    validated: false,
    owner: members.find((m) => m.memberId === contract.ownerId) ? contract.ownerId : memberId(members[0])
  }));
}

function defaultTo(value, fallback) { return value || fallback; }

function memberId(member = {}) { return member.memberId || member.agentId || member.workerId || member.domain || member.subSystem || member.label || member.role || null; }
module.exports = { calculateConflictSeverity, buildCompatibilityMatrix, buildEscalationPaths, buildDivisions, normalizeStopCriteria, validateControlledSummary, calculateAutonomyMetric, buildInternalContracts, buildExternalContracts, defaultTo };
