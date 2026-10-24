'use strict';

const crypto = require('node:crypto');
const DOMAINS = ['arithmetic', 'logic', 'records'];
const SEEDS = ['metacog-reserved-20261024-A', 'metacog-reserved-20261024-B', 'metacog-reserved-20261024-C'];
const DEVELOPMENT_SEED = 'metacog-development-20261024';
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function random(seed) {
  let state = parseInt(hash(seed).slice(0, 8), 16);
  return max => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % max; };
}

function problem(domain, next) {
  if (domain === 'arithmetic') {
    const values = [next(40) + 11, next(40) + 11, next(8) + 2];
    return { domain, values, prompt: `Compute (${values[0]} + ${values[1]}) * ${values[2]}.` };
  }
  if (domain === 'logic') {
    const values = [Boolean(next(2)), Boolean(next(2)), Boolean(next(2))];
    return { domain, values, prompt: `P=${values[0]}, Q=${values[1]}, R=${values[2]}. Evaluate (P AND NOT Q) OR (R AND Q). Return 1 for true or 0 for false.` };
  }
  const rows = Array.from({ length: 5 }, () => ({ label: ['A', 'B', 'C'][next(3)], amount: next(30) + 1 }));
  const label = ['A', 'B', 'C'][next(3)];
  return { domain, rows, label, prompt: `Records: ${JSON.stringify(rows)}. Sum amount for records whose label is ${label}.` };
}

function corpus(seed, perDomain = 2) {
  const next = random(seed);
  return DOMAINS.flatMap(domain => Array.from({ length: perDomain }, (_, index) => ({
    caseId: `${seed}:${domain}:${index}`, seed, ...problem(domain, next)
  })));
}

module.exports = { DOMAINS, SEEDS, DEVELOPMENT_SEED, hash, corpus };
