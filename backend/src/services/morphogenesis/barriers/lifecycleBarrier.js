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

function resolveLatency(latency, i, j) {
  if (typeof latency === 'function') {
    const value = Number(latency(i, j));
    return Number.isFinite(value) ? value : 0;
  }
  const numeric = Number(latency);
  return Number.isFinite(numeric) ? numeric : DEFAULT_LATENCY;
}

function checkPairTimeout(contracts, index, latency) {
  const timeout = timeoutOf(contracts[index]);
  if (timeout === null) {
    return { valid: false, reason: `lifecycle timeout missing on contract ${index}` };
  }
  for (let j = 0; j < contracts.length; j += 1) {
    const lag = resolveLatency(latency, index, j);
    if (timeout < warmupOf(contracts[j]) + lag) {
      return { valid: false, reason: `lifecycle incoherent: contract ${index} timeout < contract ${j} warmup + latency` };
    }
  }
  return { valid: true };
}

function check(contracts, latency = DEFAULT_LATENCY) {
  const list = Array.isArray(contracts) ? contracts : [];
  for (let i = 0; i < list.length; i += 1) {
    const result = checkPairTimeout(list, i, latency);
    if (!result.valid) return result;
  }
  return { valid: true };
}

module.exports = { DEFAULT_LATENCY, check };
