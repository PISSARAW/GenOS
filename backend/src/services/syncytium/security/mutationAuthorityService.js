'use strict';

const domainsService = require('../domains/nuclearDomainService');

function authorize(domains, schema, operation) {
  if (!Object.keys(domains || {}).length) return { allowed: true };
  if (!isSharedWrite(operation)) return { allowed: true };
  const path = String(operation.kind.key || '').trim();
  const field = schema?.fields?.[path];
  const owner = resolveOwner(domains, field, path);
  const actorId = String(operation.actorId || operation.agentId || '').trim();
  if (!validAuthorityRequest(owner, actorId, operation.domainId)) return authorityViolation(path);
  const access = { owner, domains, actorId, path, policy: field?.authorityPolicy || 'MEMBERS' };
  if (isAuthorizedWriter(access)) return { allowed: true, domainId: owner.domainId };
  return authorityViolation(path);
}

function validAuthorityRequest(owner, actorId, requestedDomain) {
  return Boolean(owner && actorId && requestedDomainMatches(requestedDomain, owner.domainId));
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

function requestedDomainMatches(requested, ownerId) {
  return !requested || requested === ownerId;
}

function isAuthorizedWriter(access) {
  const ownerMember = access.owner.members.includes(access.actorId)
    && domainsService.matchesAny(access.owner.owns, access.path);
  if (access.policy === 'OWNER_ONLY') return ownerMember;
  const delegated = hasDelegatedWrite(access.domains, access.actorId, access.path);
  return access.policy === 'EXPLICIT' ? delegated : ownerMember || delegated;
}

function hasDelegatedWrite(domains, actorId, path) {
  return Object.values(domains).some((domain) =>
    domain.members.includes(actorId) && domainsService.matchesAny(domain.mayWrite, path)
  );
}

function authorityViolation(path) {
  throw Object.assign(new Error(`Actor is not authorized to write Syncytium field '${path}'.`), { code: 'SYNCYTIUM_AUTHORITY_VIOLATION' });
}

module.exports = { authorize };
