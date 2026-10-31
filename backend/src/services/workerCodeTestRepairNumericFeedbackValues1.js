'use strict';

function buildValue1(__genosValueScope1) {
  return /partial\s+(?:numeric|number)|trailing\s+(?:numeric|number)/i.test(__genosValueScope1.output)
      && /\bparseInt\s*\(/.test(__genosValueScope1.code);
}

function buildValue2(__genosValueScope2) {
  return /one decimal|decimal place|fixed precision/i.test(__genosValueScope2.output)
      && /toFixed\s*\(\s*\d+\s*\)[\s\S]*?replace\s*\(/i.test(__genosValueScope2.code);
}

module.exports = { buildValue1, buildValue2 };
