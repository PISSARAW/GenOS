'use strict';

const DIMENSIONS = Object.freeze(['N', 'Q', 'S', 'D', 'T', 'E', 'O', 'H']);
const SCHEMA = 'genos.creative-phenotype.v1';

function creativePhenotypeVector(measurements = {}) {
  const values = [];
  const known = [];
  const evidence = [];
  for (const dimension of DIMENSIONS) {
    const item = measurements[dimension];
    if (item !== undefined) validateMeasurement(item);
    values.push(item?.value ?? 0);
    known.push(item !== undefined);
    evidence.push(item?.evidenceRef ?? null);
  }
  return { schema: SCHEMA, dimensions: [...DIMENSIONS], values, known, evidence };
}

function validateMeasurement(item) {
  if (!item || typeof item.value !== 'number' || !Number.isFinite(item.value)
      || item.value < 0 || item.value > 1) throw new Error('Creative measurement must be in [0,1]');
  if (typeof item.evidenceRef !== 'string' || !item.evidenceRef.trim()) {
    throw new Error('Creative measurement requires an evidence reference');
  }
}

function fromExperiment(receipt) {
  if (!receipt.measured) return creativePhenotypeVector();
  const evidenceRef = receipt.evidenceRef;
  const measure = (value) => ({ value, evidenceRef });
  return creativePhenotypeVector({
    N: measure(receipt.novelty), Q: measure(receipt.after.heldOut.successRate),
    S: measure(Math.abs(receipt.delta)), D: measure(receipt.diversity),
    T: measure(Math.max(0, receipt.delta)), E: measure(1000 / (1000 + receipt.durationMs)),
  });
}

module.exports = { DIMENSIONS, SCHEMA, creativePhenotypeVector, fromExperiment };
