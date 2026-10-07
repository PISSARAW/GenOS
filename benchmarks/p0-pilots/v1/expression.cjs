'use strict';

const vm = require('node:vm');
const PRECEDENCE = { '||': 1, '&&': 2, '===': 3, '!==': 3, '<': 4, '>': 4,
  '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };
const TOKEN = /\s*(Math\.(?:abs|min|max|floor|ceil|round)|true|false|[abc]|(?:\d+(?:\.\d+)?)|===|!==|<=|>=|&&|\|\||[()+*/%!,?:<>-])/y;

function tokensFor(text) {
  if (typeof text !== 'string' || text.length > 1000) throw new Error('Invalid bounded expression');
  const tokens = [];
  let position = 0;
  while (position < text.trimEnd().length) {
    TOKEN.lastIndex = position;
    const match = TOKEN.exec(text);
    if (!match) throw new Error('Forbidden expression token');
    tokens.push(match[1]);
    position = TOKEN.lastIndex;
    if (tokens.length > 180) throw new Error('Expression token budget exceeded');
  }
  return tokens;
}

class Parser {
  constructor(text) { this.tokens = tokensFor(text); this.position = 0; }
  take() { return this.tokens[this.position++]; }
  peek() { return this.tokens[this.position]; }
  expect(token) { if (this.take() !== token) throw new Error('Invalid expression grammar'); }

  primary() {
    const token = this.take();
    if (['+', '-', '!'].includes(token)) { this.primary(); return; }
    if (token === '(') { this.expression(0); this.expect(')'); return; }
    if (/^Math\./.test(token || '')) { this.call(token); return; }
    if (!/^(?:true|false|[abc]|\d+(?:\.\d+)?)$/.test(token || '')) throw new Error('Invalid expression atom');
  }

  call(token) {
    this.expect('(');
    this.expression(0);
    let count = 1;
    while (this.peek() === ',') { this.take(); this.expression(0); count++; }
    this.expect(')');
    const maximum = ['Math.min', 'Math.max'].includes(token) ? 3 : 1;
    if (count > maximum) throw new Error('Invalid numeric call arity');
  }

  expression(minimum) {
    this.primary();
    while (PRECEDENCE[this.peek()] >= minimum) {
      const priority = PRECEDENCE[this.take()];
      this.expression(priority + 1);
    }
    if (minimum === 0 && this.peek() === '?') {
      this.take(); this.expression(0); this.expect(':'); this.expression(0);
    }
  }

  validate() {
    this.expression(0);
    if (this.position !== this.tokens.length) throw new Error('Trailing expression tokens');
  }
}

function compile(expression) {
  new Parser(expression).validate();
  return new vm.Script(`function solve(a,b,c) { return (${expression}); } solve(a,b,c);`);
}

function execute(script, input) {
  if (!Array.isArray(input) || input.length !== 3 || !input.every(Number.isFinite)) throw new Error('Invalid numeric inputs');
  const result = script.runInNewContext({ a: input[0], b: input[1], c: input[2] },
    { timeout: 100, contextCodeGeneration: { strings: false, wasm: false } });
  if (typeof result !== 'boolean' && !Number.isFinite(result)) throw new Error('Non-finite candidate output');
  return result;
}

module.exports = { compile, execute, tokensFor };
