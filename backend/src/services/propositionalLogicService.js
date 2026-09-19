'use strict';

const BINARY = new Set(['and', 'or', 'implies', 'iff']);

function tokenize(source) {
  const raw = String(source || '').replace(/\s+/g, '');
  const tokens = raw.match(/[A-Za-z][A-Za-z0-9_]*|[()!&|>~=]/g) || [];
  if (tokens.join('') !== raw) throw new Error('Formula contains unsupported tokens.');
  return tokens;
}

function parseFormula(source) {
  const tokens = tokenize(source);
  let pos = 0;
  const peek = () => tokens[pos];
  const take = () => tokens[pos++];
  const ctx = { tokens, peek, take, pos };
  const ast = parseExpression(ctx, 1);
  if (ctx.pos !== tokens.length) throw new Error('Unexpected token in formula.');
  return ast;
}

function parseExpression(ctx, minPrec) {
  let left = parsePrimary(ctx);
  while (true) {
    const op = currentOperator(ctx);
    if (!op || PRECEDENCE[op] < minPrec) break;
    ctx.take();
    const rhs = parseExpression(ctx, PRECEDENCE[op] + (op === 'implies' ? 0 : 1));
    left = { op, left, right: rhs };
  }
  return left;
}

function parsePrimary(ctx) {
  if (ctx.peek() === '!') {
    ctx.take();
    return { op: 'not', value: parsePrimary(ctx) };
  }
  if (ctx.peek() === '(') {
    ctx.take();
    const val = parseExpression(ctx, 1);
    if (ctx.take() !== ')') throw new Error('Missing closing parenthesis.');
    return val;
  }
  const name = ctx.take();
  if (!name || !NAME_RE.test(name)) throw new Error('Expected a proposition.');
  return { op: 'atom', name };
}

function currentOperator(ctx) {
  const t = ctx.peek();
  return OP_MAP[t] && BINARY.has(OP_MAP[t]) ? OP_MAP[t] : null;
}

const NAME_RE = /^[A-Za-z]/;
const OP_MAP = { '&': 'and', '|': 'or', '>': 'implies', '=': 'iff', '~': 'iff' };
const PRECEDENCE = { iff: 1, implies: 2, or: 3, and: 4 };

function atoms(ast, result = new Set()) {
  if (ast.op === 'atom') result.add(ast.name);
  else if (ast.op === 'not') atoms(ast.value, result);
  else { atoms(ast.left, result); atoms(ast.right, result); }
  return result;
}

function evaluateAst(ast, valuation) {
  if (ast.op === 'atom') return Boolean(valuation[ast.name]);
  if (ast.op === 'not') return !evaluateAst(ast.value, valuation);
  const left = evaluateAst(ast.left, valuation);
  const right = evaluateAst(ast.right, valuation);
  if (ast.op === 'and') return left && right;
  if (ast.op === 'or') return left || right;
  if (ast.op === 'implies') return !left || right;
  return left === right;
}

function valuations(names) {
  return Array.from({ length: 2 ** names.length }, (_, index) => Object.fromEntries(
    names.map((name, bit) => [name, Boolean(index & (1 << (names.length - bit - 1)))])
  ));
}

function truthTable({ formula } = {}) {
  const ast = parseFormula(formula);
  const names = [...atoms(ast)].sort();
  return {
    formula,
    atoms: names,
    rows: valuations(names).map((v) => ({ valuation: v, value: evaluateAst(ast, v) }))
  };
}

function classifyFormula({ formula } = {}) {
  const table = truthTable({ formula });
  const values = table.rows.map((r) => r.value);
  return {
    ...table,
    result: values.every(Boolean) ? 'tautology'
      : values.every((v) => !v) ? 'contradiction' : 'contingency',
    semantics: 'classical',
    promotionEligible: false
  };
}

function areEquivalent({ left, right } = {}) {
  const leftTable = truthTable({ formula: left });
  const rightTable = truthTable({ formula: right });
  const names = [...new Set([...leftTable.atoms, ...rightTable.atoms])].sort();
  const equivalent = valuations(names).every((v) =>
    evaluateAst(parseFormula(left), v) === evaluateAst(parseFormula(right), v));
  return { left, right, equivalent, semantics: 'classical', promotionEligible: false };
}

function findCounterexample({ premises = [], conclusion } = {}) {
  const premiseAsts = premises.map(parseFormula);
  const conclusionAst = parseFormula(conclusion);
  const names = [...new Set([...premiseAsts, conclusionAst].flatMap((a) => [...atoms(a)]))].sort();
  const valuation = valuations(names).find((v) =>
    premiseAsts.every((a) => evaluateAst(a, v)) && !evaluateAst(conclusionAst, v));
  return { valid: !valuation, counterexample: valuation || null, semantics: 'classical' };
}

module.exports = { parseFormula, truthTable, classifyFormula, areEquivalent, findCounterexample };
