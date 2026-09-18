'use strict';

const VALUES = Object.freeze({ true: 'true', false: 'false', both: 'both', neither: 'neither' });
const SEMANTICS = new Set(['paraconsistent', 'paracomplete', 'classical']);
function negate(value, semantics) {
  if (semantics === 'paraconsistent') return value === 'both' ? 'both' : value === 'true' ? 'false' : value === 'false' ? 'true' : 'neither';
  return value === 'true' ? 'false' : value === 'false' ? 'true' : 'neither';
}
function evaluate({ value = 'neither', semantics = 'paraconsistent', negated = false } = {}) {
  if (!Object.values(VALUES).includes(value)) throw new Error('Unsupported many-valued truth value.');
  if (!SEMANTICS.has(semantics)) throw new Error('Unsupported non-classical semantics.');
  const result = negated ? negate(value, semantics) : value;
  return { semantics, value: result, explosion: semantics === 'paraconsistent' ? 'blocked' : 'not-evaluated', promotionEligible: false };
}
function compareExcludedMiddle({ semantics = 'paracomplete' } = {}) {
  if (!SEMANTICS.has(semantics)) throw new Error('Unsupported non-classical semantics.');
  return { semantics, formula: 'A|!A', valid: semantics === 'classical' || semantics === 'paraconsistent', status: semantics === 'paracomplete' ? 'undetermined' : 'evaluated', note: 'La validité dépend de la sémantique choisie.', promotionEligible: false };
}
module.exports = { evaluate, compareExcludedMiddle };
