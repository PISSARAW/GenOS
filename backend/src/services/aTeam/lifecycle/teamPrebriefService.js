'use strict';

function normalizedList(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => String(item || '').trim()).filter(Boolean))];
}

function responsibilitiesOf(member) {
  const authority = member.authority || {};
  return normalizedList(authority.owns || member.ownedResponsibilities || member.capabilities);
}

function memberBrief(member) {
  return {
    memberId: member.memberId || member.agentId || member.workerId || member.label || member.role,
    role: member.role || 'specialist',
    responsibilities: responsibilitiesOf(member),
    consumes: normalizedList(member.dependsOn),
    provides: normalizedList(member.provides || member.capabilities)
  };
}

function compilePrebrief(input = {}) {
  return {
    schema: 'genos.ateam-prebrief/v1',
    goal: String(input.goal || '').trim(),
    successCriteria: normalizedList(input.successCriteria),
    organization: input.organization || null,
    members: (Array.isArray(input.members) ? input.members : []).map(memberBrief)
  };
}

module.exports = { compilePrebrief };
