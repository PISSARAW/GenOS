'use strict';

const domainsService = require('../domains/nuclearDomainService');

function pathsFor(domain, schema) {
  return Object.entries(schema?.fields || {})
    .filter(([path, field]) => canReceive(domain, path, field))
    .map(([path]) => path);
}

function canReceive(domain, path, field) {
  const owner = field.ownerDomain === domain.domainId || domainsService.matchesAny(domain.owns, path);
  const privateField = field.visibility === 'PRIVATE' || field.replicationPolicy === 'OWNER_ONLY';
  if (privateField) return owner;
  if (field.visibility === 'GLOBAL') return true;
  return owner || domainsService.matchesAny(domain.mayRead, path)
    || domainsService.matchesAny(domain.mayWrite, path)
    || domainsService.matchesAny(domain.subscriptions, path);
}

function recipients(path, schema, domains) {
  const field = schema?.fields?.[path] || { visibility: 'DOMAIN', replicationPolicy: 'ALL_SUBSCRIBED' };
  return Object.values(domains || {})
    .filter((domain) => canReceive(domain, path, field))
    .map((domain) => domain.domainId)
    .sort();
}

module.exports = { pathsFor, canReceive, recipients };
