'use strict';

const SCENARIO_IDS = Object.freeze(Array.from({ length: 12 }, (_, index) => `ETT-${String(index + 1).padStart(2, '0')}`));
const LEVELS = Object.freeze(['simple', 'difficult', 'open']);

function seeded(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function buildCase(scenarioId, difficulty, seed) {
  if (!SCENARIO_IDS.includes(scenarioId) || !LEVELS.includes(difficulty) || !Number.isSafeInteger(seed)) {
    throw new TypeError('Unknown scenario, difficulty, or seed.');
  }
  const random = seeded(seed ^ (Number(scenarioId.slice(4)) * 7919));
  const size = difficulty === 'simple' ? 3 : difficulty === 'difficult' ? 6 : 9;
  const answer = Math.floor(random() * size);
  const candidates = Array.from({ length: size }, (_, index) => ({
    id: `candidate-${index}`,
    clue: `signal-${Math.floor(random() * Math.max(2, size / 2))}`,
    evidence: Array.from({ length: 3 }, () => Math.floor(random() * 100))
  }));
  candidates[answer].evidence[0] = 100;
  const publicCase = {
    scenarioId, difficulty, caseId: `${scenarioId}-${difficulty}-${seed}`,
    observation: { candidates, task: `Identify the candidate supported by independent evidence for ${scenarioId}.` },
    budget: difficulty === 'open' ? 12 : difficulty === 'difficult' ? 8 : 5
  };
  return { ...publicCase, oracle: { answerId: candidates[answer].id, hiddenSeed: seed } };
}

function validateProposal(proposal) {
  return proposal && typeof proposal.answerId === 'string'
    && Array.isArray(proposal.evidenceRefs) && Number.isInteger(proposal.actions)
    && proposal.actions >= 0;
}

module.exports = { SCENARIO_IDS, LEVELS, buildCase, validateProposal };
