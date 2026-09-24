'use strict';

const SOURCE_ORDER = Object.freeze(['snapshot', 'successfulMorphology', 'lineage', 'fossil', 'alternativePattern']);

function recoveryCandidates(input = {}) {
  const candidates = [];
  for (const source of SOURCE_ORDER) {
    const entries = Array.isArray(input[source]) ? input[source] : [];
    for (const entry of entries) {
      if (entry && entry.graph && entry.evidenceValid === true) candidates.push({ source, graph: entry.graph, evidence: entry.evidence || [] });
    }
  }
  return candidates;
}

async function selectRegeneration(input = {}) {
  const candidates = recoveryCandidates(input);
  if (typeof input.verify !== 'function') return { selected: null, reason: 'verification adapter required' };
  for (const candidate of candidates) {
    const result = await input.verify(candidate);
    if (result && result.valid === true) return { selected: candidate, verification: result };
  }
  return { selected: null, reason: 'no verified recovery morphology' };
}

module.exports = { SOURCE_ORDER, recoveryCandidates, selectRegeneration };
