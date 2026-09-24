'use strict';

function createTopologyVersionRegistry() {
  const versions = new Map();
  const currentVersions = new Map();

  function register(contract, makeCurrent = false) {
    const topologyVersions = versions.get(contract.topologyId) || new Map();
    if (topologyVersions.has(contract.contractVersion)) throw new Error('topology contract version already registered');
    topologyVersions.set(contract.contractVersion, structuredClone(contract));
    versions.set(contract.topologyId, topologyVersions);
    if (makeCurrent || !currentVersions.has(contract.topologyId)) {
      currentVersions.set(contract.topologyId, contract.contractVersion);
    }
    return structuredClone(contract);
  }

  function get(topologyId, version) {
    const selected = version || currentVersions.get(topologyId);
    const contract = (versions.get(topologyId) || new Map()).get(selected);
    return contract ? structuredClone(contract) : null;
  }

  function list(topologyId) {
    return Array.from((versions.get(topologyId) || new Map()).keys());
  }

  return { register, get, list };
}

module.exports = { createTopologyVersionRegistry };
