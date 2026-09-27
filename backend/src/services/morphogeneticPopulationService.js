'use strict';

function generatePopulation(input) {
  const data = input || {};
  const signals = Array.isArray(data.signals) ? data.signals : [];
  const limit = Math.max(1, Math.min(32, Math.floor(Number(data.limit) || 8)));
  const operators = Array.isArray(data.operators) ? data.operators : ['clone', 'mutate'];
  const population = signals.slice(0, limit).map((signal, index) => ({
    id: `variant_${index + 1}`,
    parentId: signal.parentId || null,
    genome: { ...signal.genome, operator: operators[index % operators.length] },
    provenance: { signalId: signal.id || `signal_${index + 1}`, operator: operators[index % operators.length], generatedAt: new Date().toISOString() },
    status: 'candidate'
  }));
  return { population, bounded: signals.length > limit, limit };
}

function validateProvenance(population) {
  const list = Array.isArray(population) ? population : [];
  const valid = list.filter((item) => item?.provenance?.signalId && item?.provenance?.operator);
  return { valid: valid.length === list.length, count: list.length, missing: list.length - valid.length };
}

module.exports = { generatePopulation, validateProvenance };
