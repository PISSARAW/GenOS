'use strict';

const { normalizeRelativePath } = require('../pathSafety');
const IDS = new Set(['discount', 'pagination', 'port']);

function assertContract(contract) {
  if (contract?.version !== 1 || contract.kind !== 'javascript_repair_cases'
      || contract.suite !== 'genos.pure-js-repair/v1' || !IDS.has(contract.caseId)) invalid();
  if (normalizeRelativePath(contract.artifactPath, 'JavaScript artifact') !== contract.artifactPath
      || !contract.artifactPath.endsWith('.js')) invalid();
  const artifact = contract.sources?.find(source => source.path === contract.artifactPath);
  if (artifact?.mutable !== true || contract.sources.length !== 1) invalid();
  return contract;
}

function invalid() {
  throw Object.assign(new Error('A registered, bounded JavaScript repair suite is required.'), {
    code: 'JAVASCRIPT_REPAIR_CONTRACT_INVALID'
  });
}

module.exports = { assertContract };
