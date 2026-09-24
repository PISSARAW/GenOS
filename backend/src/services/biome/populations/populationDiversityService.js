'use strict';

function measureDiversity(individuals) {
  const list = Array.isArray(individuals) ? individuals : [];
  if (list.length < 2) return 0;
  const counts = new Map();
  for (const individual of list) {
    const signature = phenotypeSignature(individual);
    counts.set(signature, (counts.get(signature) || 0) + 1);
  }
  if (counts.size < 2) return 0;
  const entropy = [...counts.values()].reduce((sum, count) => {
    const probability = count / list.length;
    return sum - probability * Math.log(probability);
  }, 0);
  return Number((entropy / Math.log(list.length)).toFixed(6));
}

function phenotypeSignature(individual) {
  const capabilities = Array.isArray(individual.capabilities) ? [...individual.capabilities].sort() : [];
  const phenotype = individual.phenotype || {};
  const strategy = phenotype.strategy || phenotype.cognitiveRecipe || '';
  return JSON.stringify({ role: individual.role || 'worker', capabilities, strategy });
}

module.exports = { measureDiversity };
