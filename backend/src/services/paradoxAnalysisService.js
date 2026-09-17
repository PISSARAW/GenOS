'use strict';

const PARADOXES = Object.freeze(['liar', 'russell', 'cantor', 'burali-forti', 'grelling-nelson', 'berry', 'richard', 'sorites', 'zeno', 'fitch', 'moore', 'curry', 'twin']);
function analyze({ type, statement } = {}) {
  const key = String(type || '').toLowerCase();
  if (!PARADOXES.includes(key)) throw new Error(`Unknown paradox '${type}'.`);
  return { type: key, statement: statement || null, solutions: key === 'liar' ? ['hierarchy', 'fixed-point', 'paraconsistent'] : [], status: 'comparative-analysis', contradiction: key === 'liar' || key === 'curry', promotionEligible: false };
}
module.exports = { PARADOXES, analyze };
