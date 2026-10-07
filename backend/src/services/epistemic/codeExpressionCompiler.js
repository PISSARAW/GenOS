'use strict';

const values = require('../trinityProvenanceValues');
const PRIORITY = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2 };
const TOKEN = /\s*(Math\.(?:abs|min|max|floor|ceil)|[ab]|\d+(?:\.\d+)?|[()+*/%,\-])/y;

function tokensFor(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 1000) throw values.failure('CODE_EXPRESSION_OUTSIDE_LANGUAGE');
  const tokens = [];
  let position = 0;
  while (position < text.trimEnd().length) {
    TOKEN.lastIndex = position;
    const match = TOKEN.exec(text);
    if (!match || tokens.length >= 180) throw values.failure('CODE_EXPRESSION_OUTSIDE_LANGUAGE');
    tokens.push(match[1]);
    position = TOKEN.lastIndex;
  }
  return tokens;
}

class Parser {
  constructor(text) { this.tokens = tokensFor(text); this.position = 0; }
  take() { return this.tokens[this.position++]; }
  peek() { return this.tokens[this.position]; }
  expect(token) { if (this.take() !== token) throw values.failure('CODE_EXPRESSION_GRAMMAR_INVALID'); }
  primary() {
    const token = this.take();
    if (token === '+' || token === '-') return { type: 'unary', operator: token, value: this.primary() };
    if (token === '(') { const value = this.expression(0); this.expect(')'); return value; }
    if (token?.startsWith('Math.')) return this.call(token.slice(5));
    if (token === 'a' || token === 'b') return { type: 'input', name: token };
    if (!/^\d+(?:\.\d+)?$/.test(token || '')) throw values.failure('CODE_EXPRESSION_GRAMMAR_INVALID');
    return { type: 'number', value: Number(token) };
  }
  call(name) {
    this.expect('(');
    const args = [this.expression(0)];
    while (this.peek() === ',') { this.take(); args.push(this.expression(0)); }
    this.expect(')');
    const maximum = ['min', 'max'].includes(name) ? 3 : 1;
    if (args.length > maximum) throw values.failure('CODE_EXPRESSION_GRAMMAR_INVALID');
    return { type: 'call', name, args };
  }
  expression(minimum) {
    let left = this.primary();
    while (PRIORITY[this.peek()] >= minimum) {
      const operator = this.take();
      left = { type: 'binary', operator, left, right: this.expression(PRIORITY[operator] + 1) };
    }
    return left;
  }
}

function compile(text) {
  const parser = new Parser(text);
  const result = parser.expression(0);
  if (parser.position !== parser.tokens.length) throw values.failure('CODE_EXPRESSION_GRAMMAR_INVALID');
  return result;
}

module.exports = { compile };
