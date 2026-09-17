'use strict';

const VALUES = Object.freeze({ true: 'true', false: 'false', both: 'both', neither: 'neither' });
function negate(value, semantics) {
  if (semantics === 'paraconsistent') return value === 'both' ? 'both' : value === 'true' ? 'false' : value === 'false' ? 'true' : 'neither';
  return value === 'true' ? 'false' : value === 'false' ? 'true' : 'neither';
}
function evaluate({ value = 'neither', semantics = 'paraconsistent', negated = false } = {}) {
  if (!Object.values(VALUES).includes(value)) throw new Error('Unsupported many-valued truth value.');
  const result = negated ? negate(value, semantics) : value;
  return { semantics, value: result, explosion: semantics === 'paraconsistent' ? 'blocked' : 'not-evaluated', promotionEligible: false };
}
function compareExcludedMiddle({ semantics = 'paracomplete' } = {}) {
  return { semantics, formula: 'A|!A', valid: semantics === 'classical' || semantics === 'paraconsistent', note: 'La validité dépend de la sémantique choisie.' };
}
module.exports = { evaluate, compareExcludedMiddle };
