'use strict';

const { randomUUID } = require('node:crypto');
const { VARIANT_WORKERS } = require('../../syncytiumVariantWorkerService');

function prepare(orchestratorId, variantId, configuration = {}) {
  const count = 4 + Number(Boolean(VARIANT_WORKERS[variantId]));
  const workerIds = Array.from({ length: count }, (_, index) =>
    `worker_${orchestratorId}_${index + 1}_${randomUUID().replaceAll('-', '').slice(0, 12)}`);
  const resolve = (principal) => {
    const match = /^worker:([1-5])$/.exec(String(principal || ''));
    return prepareCondition(match, workerIds, principal);
  };
  const configured = { ...configuration };
  if (variantId === 'hard') {
    configured.authorityMembers = Array.isArray(configuration.authorityMembers)
      ? configuration.authorityMembers.map(resolve) : workerIds;
  }
  if (variantId === 'hierarchical' && Array.isArray(configuration.regions)) {
    configured.regions = configuration.regions.map((region) => ({ ...region,
      members: (region.members || []).map(resolve) }));
  }
  if (variantId === 'humanAi' && Array.isArray(configuration.nuclei)) {
    configured.nuclei = configuration.nuclei.map((nucleus) => ({ ...nucleus,
      principalId: resolve(nucleus.principalId) }));
  }
  return { workerIds, configuration: configured };
}

module.exports = { prepare };

function prepareCondition(match, workerIds, principal) {
  return match ? workerIds[Number(match[1]) - 1] || principal : principal;
}
