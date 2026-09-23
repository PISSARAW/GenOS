'use strict';

/**
 * Compatibility (G16) : AgentFitness, ProceduralFitness et
 * HostProcedureCompatibility appris séparément (coévolution).
 */

const compat = new Map();

function recordOutcome(opts) {
  const o = opts || {};
  const key = `${o.hostPhenotype}::${o.procedureId}`;
  const prev = compat.get(key) || { samples: 0, success: 0 };
  const next = { samples: prev.samples + 1, success: prev.success + (o.success ? 1 : 0) };
  next.rate = next.success / next.samples;
  compat.set(key, next);
  return { key, ...next };
}

function compatibilityOf(opts) {
  const o = opts || {};
  return compat.get(`${o.hostPhenotype}::${o.procedureId}`) || { samples: 0, success: 0, rate: 0.5 };
}

module.exports = { recordOutcome, compatibilityOf };
