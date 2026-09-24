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
  const match = list.find((member) => domains.includes(member.domain) && (member.capabilities || []).includes('boundary_spanning'));
  return match?.memberId || match?.agentId || null;
}

module.exports = { assignBoundarySpanners };
