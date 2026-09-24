'use strict';

const domainsService = require('../domains/nuclearDomainService');
const utils = require('./conflictUtils');

function detect({ operation, history, schema, domains }) {
  const path = utils.pathOf(operation);
  const fieldOwner = schema?.fields?.[path]?.ownerDomain || domainsService.ownerFor(domains || {}, path)?.domainId;
  if (!operation.domainId || !fieldOwner) return [];
  return history.filter((prior) => utils.concurrentPair(prior, operation)
    && utils.sameTarget(prior, operation)
    && prior.domainId && prior.domainId !== operation.domainId)
    .map((prior) => utils.conflict({ type: 'AUTHORITY_CONFLICT', left: prior, right: operation, description: `Concurrent writes cross domain authority for owner '${fieldOwner}'.` }));
}

module.exports = { detect };
