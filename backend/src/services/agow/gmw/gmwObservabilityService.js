'use strict';

function measure(samples) {
  const vectors = samples.map((sample) => sample.output);
  if (!vectors.length) return { score: 0, distinguishableStates: 0 };
  const distinct = new Set(vectors.map((vector) => vector.map((value) => Number(value).toFixed(4)).join(',')));
  return { score: Math.min(1, distinct.size / vectors.length), distinguishableStates: distinct.size };
}

module.exports = { measure };
