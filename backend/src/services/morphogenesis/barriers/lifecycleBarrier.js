'use strict';

const DEFAULT_LATENCY = 0;

function timeoutOf(contract) {
  const value = contract && contract.lifecycleModel && contract.lifecycleModel.timeout;
  return Number.isFinite(value) ? Number(value) : null;
}

function warmupOf(contract) {
  const value = contract && contract.lifecycleModel && contract.lifecycleModel.warmup;
  return Number.isFinite(value) ? Number(value) : 0;
}

function check(contracts, latency = DEFAULT_LATENCY) {
  const lag = Number(latency) || 0;
  for (let i = 0; i < contracts.length; i++) {
    const timeout = timeoutOf(contracts[i]);
    if (timeout === null) {
      return { valid: false, reason: `lifecycle timeout missing on contract ${i}` };
    }
    for (let j = 0; j < contracts.length; j++) {
      if (timeout < warmupOf(contracts[j]) + lag) {
        return { valid: false, reason: `lifecycle incoherent: contract ${i} timeout < contract ${j} warmup + latency` };
      }
    }
  }
  return { valid: true };
}

module.exports = { check };
