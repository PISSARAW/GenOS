'use strict';

const domainsService = require('../domains/nuclearDomainService');

function authorize(domains, schema, operation) {
  if (!Object.keys(domains || {}).length) return { allowed: true };
  if (!isSharedWrite(operation)) return { allowed: true };
  const path = String(operation.kind.key || '').trim();
  const field = schema?.fields?.[path];
  const owner = resolveOwner(domains, field, path);
  const actorId = String(operation.actorId || operation.agentId || '').trim();
  const source = actorDomain(domains, actorId, operation.domainId);
  if (!validAuthorityRequest(owner, actorId, source)) return authorityViolation(path);
  const access = { owner, source, actorId, path, policy: field?.authorityPolicy || 'MEMBERS' };
  if (isAuthorizedWriter(access)) return { allowed: true, domainId: owner.domainId };
  return authorityViolation(path);
}

function validAuthorityRequest(owner, actorId, source) {
  return Boolean(owner && actorId && source?.members.includes(actorId));
}

function isSharedWrite(operation) {
  return ['set_field', 'typed_field'].includes(operation?.kind?.type);
}

function resolveOwner(domains, field, path) {
  const ownerId = field?.ownerDomain || field?.domainId;
  if (!ownerId) return domainsService.ownerFor(domains, path);
  const owner = domains[ownerId];
  return owner ? { ...owner, owns: [...owner.owns, path] } : null;
}

function actorDomain(domains, actorId, requestedDomain) {
  if (requestedDomain) return domains[requestedDomain] || null;
  return Object.values(domains).find((domain) => domain.members.includes(actorId)) || null;
}

function isAuthorizedWriter(access) {
  const ownerMember = access.source.domainId === access.owner.domainId
    && access.owner.members.includes(access.actorId)
    && domainsService.matchesAny(access.owner.owns, access.path);
  if (access.policy === 'OWNER_ONLY') return ownerMember;
  const delegated = access.source.members.includes(access.actorId)
    && domainsService.matchesAny(access.source.mayWrite, access.path);
  return access.policy === 'EXPLICIT' ? delegated : ownerMember || delegated;
}

function authorityViolation(path) {
  throw Object.assign(new Error(`Actor is not authorized to write Syncytium field '${path}'.`), { code: 'SYNCYTIUM_AUTHORITY_VIOLATION' });
}

module.exports = { authorize };
