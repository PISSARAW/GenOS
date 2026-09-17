'use strict';

const BINARY = new Set(['and', 'or', 'implies', 'iff']);

function tokenize(source) {
  const tokens = String(source || '').match(/[A-Za-z][A-Za-z0-9_]*|[()!&|>~=]/g) || [];
  if (tokens.join('') !== String(source || '').replace(/\s+/g, '')) {
    throw new Error('Formula contains unsupported tokens.');
  }
  return tokens;
}

function parseFormula(source) {
  const tokens = tokenize(source);
  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];
  function primary() {
    if (peek() === '!') { take(); return { op: 'not', value: primary() }; }
    if (peek() === '(') { take(); const value = expression(0); if (take() !== ')') throw new Error('Missing closing parenthesis.'); return value; }
    const name = take();
    if (!name || !/^[A-Za-z]/.test(name)) throw new Error('Expected a proposition.');
    return { op: 'atom', name };
  }
  const precedence = { iff: 1, implies: 2, or: 3, and: 4 };
  function operator() {
    const token = peek();
    const value = { '&': 'and', '|': 'or', '>': 'implies', '=': 'iff', '~': 'iff' }[token];
    return value && BINARY.has(value) ? value : null;
  }
  function expression(min) {
    let left = primary();
    while (true) {
      const op = operator();
      if (!op || precedence[op] < min) break;
      take();
      left = { op, left, right: expression(precedence[op] + (op === 'implies' ? 0 : 1)) };
    }
    return left;
  }
  const ast = expression(1);
  if (position !== tokens.length) throw new Error('Unexpected token in formula.');
  return ast;
}

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
    names.map((name, bit) => [name, Boolean(index & (1 << (names.length - bit - 1)))]),
  ));
}

function truthTable({ formula } = {}) {
  const ast = parseFormula(formula);
  const names = [...atoms(ast)].sort();
  const rows = valuations(names).map((valuation) => ({
    valuation, value: evaluateAst(ast, valuation),
  }));
  return { formula, atoms: names, rows };
}

function classifyFormula({ formula } = {}) {
  const table = truthTable({ formula });
  const values = table.rows.map((row) => row.value);
  const result = values.every(Boolean) ? 'tautology' : values.every((value) => !value) ? 'contradiction' : 'contingency';
  return { ...table, result, semantics: 'classical', promotionEligible: false };
}

function areEquivalent({ left, right } = {}) {
  const leftTable = truthTable({ formula: left });
  const rightTable = truthTable({ formula: right });
  const names = [...new Set([...leftTable.atoms, ...rightTable.atoms])].sort();
  const equivalent = valuations(names).every((valuation) => evaluateAst(parseFormula(left), valuation) === evaluateAst(parseFormula(right), valuation));
  return { left, right, equivalent, semantics: 'classical', promotionEligible: false };
}

function findCounterexample({ premises = [], conclusion } = {}) {
  const premiseAsts = premises.map(parseFormula);
  const conclusionAst = parseFormula(conclusion);
  const names = [...new Set([...premiseAsts, conclusionAst].flatMap((ast) => [...atoms(ast)]))].sort();
  const valuation = valuations(names).find((candidate) => premiseAsts.every((ast) => evaluateAst(ast, candidate)) && !evaluateAst(conclusionAst, candidate));
  return { valid: !valuation, counterexample: valuation || null, semantics: 'classical' };
}

module.exports = { parseFormula, truthTable, classifyFormula, areEquivalent, findCounterexample };
