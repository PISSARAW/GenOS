'use strict';

function buildRule1(context) {
  return /partial\s+(?:numeric|number)|trailing\s+(?:numeric|number)/i.test(context.output)
      && /\bparseInt\s*\(/.test(context.code);
}

function buildRule2(context) {
  return /one decimal|decimal place|fixed precision/i.test(context.output)
      && /toFixed\s*\(\s*\d+\s*\)[\s\S]*?replace\s*\(/i.test(context.code);
}

module.exports = { buildRule1, buildRule2 };
