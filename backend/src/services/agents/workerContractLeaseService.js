'use strict';

const enforcement = require('./workerContractEnforcement');

function restrict(contract, lease) {
  if (!contract) return Array.isArray(lease) ? lease : [];
  return (Array.isArray(lease) ? lease : []).filter((tool) => {
    try {
      enforcement.assertWorkerToolAllowed(contract, tool);
      return true;
    } catch (_) {
      return false;
    }
  });
}

module.exports = { restrict };
