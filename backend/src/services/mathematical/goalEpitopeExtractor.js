'use strict';

const EPITOPE_DEFS = [
  ['hasAssumptions', /assume|假设|given|suppose|soit/i],
  ['hasQuantifier', /forall|exists|∀|∃|for all|there exists/i],
  ['hasImplication', /implies|→|→|if.*then/i],
  ['hasConjunction', /and|∧|\\band\\b/i],
  ['hasDisjunction', /or|∨|\\bor\\b/i],
  ['hasNegation', /not|¬|\\bnot\\b/i],
  ['isEquality', /=/],
  ['isInequality', /[<>]=?/],
  ['hasSum', /sum|Σ|∑/],
  ['hasProduct', /product|Π|∏/],
  ['hasIntegral', /integral|∫/],
  ['hasLimit', /lim_|limit|limite/i],
  ['isInductive', /induc|recursif|récursif|base case|case de base/i],
  ['hasFunction', /function|mapping|application|fonction|application/i],
  ['hasSet', /set|ensemble|subset|sous-ensemble|∈|in /],
];

const OPERATOR_RULES = [
  ['hasAssumptions', 'assume_then_prove'],
  ['isEquality', 'equality_manipulation'],
  ['isInequality', 'inequality_reasoning'],
  ['isInductive', 'induction'],
  ['hasQuantifier', 'quantifier_reasoning'],
  ['hasSum', 'rewrite'],
  ['hasProduct', 'rewrite'],
  ['hasIntegral', 'analytic_reasoning'],
  ['hasLimit', 'analytic_reasoning'],
];

const STRUCTURE_HINTS_RULES = [
  [['hasAssumptions', 'hasImplication'], 'implication'],
  [['isInductive', 'hasQuantifier'], 'inductive_universal'],
  [['isInequality', 'hasSum'], 'algebraic_inequality'],
  [['hasFunction', 'isEquality'], 'functional_equation'],
];

function extractEpitopes(goal) {
  if (!goal) return { epitopes: {}, operators: [], structureHints: [] };
  const text = typeof goal === 'string' ? goal : String(goal.statement || goal || '');

  const epitopes = {};
  for (const [name, pattern] of EPITOPE_DEFS) {
    epitopes[name] = pattern.test(text);
  }

  const operators = [];
  for (const [epitope, operatorName] of OPERATOR_RULES) {
    if (epitopes[epitope]) {
      operators.push(operatorName);
    }
  }

  const structureHints = [];
  for (const [requiredEpitopes, hintName] of STRUCTURE_HINTS_RULES) {
    const allMatch = requiredEpitopes.every(e => epitopes[e]);
    if (allMatch) {
      structureHints.push(hintName);
    }
  }

  return { epitopes, operators, structureHints };
}

function epitopeSignature(epitopes) {
  return Object.entries(epitopes)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .sort()
    .join('|');
}

module.exports = { extractEpitopes, epitopeSignature };
