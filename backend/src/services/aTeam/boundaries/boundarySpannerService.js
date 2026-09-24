'use strict';

function assignBoundarySpanners(interfaces = [], members = []) {
  return (Array.isArray(interfaces) ? interfaces : []).map((boundary) => ({
    boundaryId: boundary.id || `${boundary.from || 'domain'}:${boundary.to || 'domain'}`,
    fromDomain: boundary.from || null,
    toDomain: boundary.to || null,
    ownerMemberId: findOwner(boundary, members),
    responsibility: 'translate_and_validate_interface_contract',
    authorityScope: 'interface_only'
  }));
}

function findOwner(boundary, members) {
  const list = Array.isArray(members) ? members : [];
  const domains = [boundary.from, boundary.to].filter(Boolean);
  const match = list.find((member) => isBoundarySpanner(member) && domains.includes(memberDomain(member)))
    || list.find(isBoundarySpanner);
  return match?.memberId || match?.agentId || match?.workerId || match?.domain || match?.subSystem || match?.label || null;
}

function isBoundarySpanner(member) {
  return (member.capabilities || []).includes('boundary_spanning');
}

function memberDomain(member) {
  return member.domain || member.subSystem || member.label;
}

module.exports = { assignBoundarySpanners };
