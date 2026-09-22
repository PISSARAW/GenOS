'use strict';

/**
 * @file goalEpitopeExtractor.js
 * @description Extracts structural epitopes from mathematical goals.
 * Supports both regex-based extraction (fallback) and Lean AST-based extraction (preferred).
 * Lean AST extraction provides structural guarantees regex cannot.
 */

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

/**
 * Regex-based epitope extraction (fallback when Lean AST unavailable).
 */
function extractEpitopesRegex(text) {
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

/**
 * Lean AST-based epitope extraction (preferred).
 * Extracts structural features directly from Lean's syntax tree.
 * @param {Object} leanAST - Parsed Lean AST (from lean --ast or similar)
 * @returns {Object} Epitope extraction result
 */
function extractEpitopesFromLeanAST(leanAST) {
  if (!leanAST) return { epitopes: {}, operators: [], structureHints: [], source: 'lean_ast' };

  const epitopes = {
    hasAssumptions: false,
    hasQuantifier: false,
    hasImplication: false,
    hasConjunction: false,
    hasDisjunction: false,
    hasNegation: false,
    isEquality: false,
    isInequality: false,
    hasSum: false,
    hasProduct: false,
    hasIntegral: false,
    hasLimit: false,
    isInductive: false,
    hasFunction: false,
    hasSet: false,
  };

  // Traverse Lean AST and extract structural features
  function traverse(node) {
    if (!node || typeof node !== 'object') return;

    const kind = node.kind || node.type || '';
    const name = node.name || '';

    // Quantifiers
    if (kind.includes('Forall') || kind.includes('Exists') || name === '∀' || name === '∃') {
      epitopes.hasQuantifier = true;
    }

    // Implications
    if (kind.includes('Implies') || kind.includes('Arrow') || name === '→' || name === '→') {
      epitopes.hasImplication = true;
    }

    // Equality/Inequality
    if (kind.includes('Eq') || name === '=') {
      epitopes.isEquality = true;
    }
    if (kind.includes('Le') || kind.includes('Lt') || kind.includes('Ge') || kind.includes('Gt') ||
        name === '<' || name === '>' || name === '≤' || name === '≥') {
      epitopes.isInequality = true;
    }

    // Logical connectives
    if (kind.includes('And') || name === '∧') epitopes.hasConjunction = true;
    if (kind.includes('Or') || name === '∨') epitopes.hasDisjunction = true;
    if (kind.includes('Not') || name === '¬') epitopes.hasNegation = true;

    // Sums/Products
    if (kind.includes('Sum') || kind.includes('Finset.sum') || name === '∑') epitopes.hasSum = true;
    if (kind.includes('Prod') || kind.includes('Finset.prod') || name === '∏') epitopes.hasProduct = true;

    // Integrals/Limits
    if (kind.includes('Integral') || name === '∫') epitopes.hasIntegral = true;
    if (kind.includes('Limit') || name === 'lim') epitopes.hasLimit = true;

    // Induction
    if (kind.includes('Induction') || kind.includes('Nat.rec') || kind.includes('Nat.strong_rec')) {
      epitopes.isInductive = true;
    }

    // Functions
    if (kind.includes('Fun') || kind.includes('Pi') || kind.includes('Lambda')) {
      epitopes.hasFunction = true;
    }

    // Sets
    if (kind.includes('Set') || kind.includes('Subset') || name === '∈' || name === '⊆') {
      epitopes.hasSet = true;
    }

    // Assumptions (hypotheses in context)
    if (kind.includes('Have') || kind.includes('Assume')) {
      epitopes.hasAssumptions = true;
    }

    // Recurse into children
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(traverse);
      } else if (child && typeof child === 'object') {
        traverse(child);
      }
    }
  }

  traverse(leanAST);

  // Derive operators and structure hints from epitopes
  const operators = [];
  for (const [epitope, operatorName] of OPERATOR_RULES) {
    if (epitopes[epitope]) operators.push(operatorName);
  }

  const structureHints = [];
  for (const [requiredEpitopes, hintName] of STRUCTURE_HINTS_RULES) {
    if (requiredEpitopes.every(e => epitopes[e])) {
      structureHints.push(hintName);
    }
  }

  return { epitopes, operators, structureHints, source: 'lean_ast' };
}

/**
 * Main extraction function - tries Lean AST first, falls back to regex.
 * @param {string|Object} goal - Goal statement string or object with statement/leanAST
 * @returns {Object} Epitope extraction result
 */
function extractEpitopes(goal) {
  if (!goal) return { epitopes: {}, operators: [], structureHints: [] };

  // If goal has Lean AST, use it
  if (goal.leanAST) {
    return extractEpitopesFromLeanAST(goal.leanAST);
  }

  // If goal is a FormalResult with Lean source, we could parse it
  if (goal.leanSource) {
    // Placeholder: would parse Lean source to AST here
    // For now, fall through to regex
  }

  // Fallback to regex extraction
  const text = typeof goal === 'string' ? goal : String(goal.statement || goal || '');
  return extractEpitopesRegex(text);
}

function epitopeSignature(epitopes) {
  return Object.entries(epitopes)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .sort()
    .join('|');
}

module.exports = {
  extractEpitopes,
  extractEpitopesRegex,
  extractEpitopesFromLeanAST,
  epitopeSignature,
  EPITOPE_DEFS,
  OPERATOR_RULES,
  STRUCTURE_HINTS_RULES,
};
