'use strict';

const THEORIES = new Set(['frege', 'russell', 'strawson', 'donnellan', 'kripke', 'kaplan']);

function text(value, field) {
  const result = String(value || '').trim();
  if (!result) throw new Error(`${field} must be a non-empty string.`);
  return result;
}

function analyzeExpression(input = {}) {
  const expression = text(input.expression, 'expression');
  const theory = input.theory || 'frege';
  if (!THEORIES.has(theory)) throw new Error(`Unknown reference theory '${theory}'.`);
  return {
    expression,
    theory,
    layers: {
      expression,
      sense: input.sense || null,
      reference: input.reference || null,
      extension: input.extension || null
    },
    status: 'structured',
    interpretationStatus: input.reference ? 'contextualized' : 'underdetermined',
    limitations: ['Une expression seule ne suffit pas à déterminer une référence unique.']
  };
}

function resolveReference(input = {}) {
  const expression = text(input.expression, 'expression');
  const context = input.context && typeof input.context === 'object' ? input.context : {};
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  const selected = input.reference || context[expression] || null;
  return {
    expression,
    context,
    candidates,
    reference: selected,
    resolved: selected !== null,
    status: selected === null ? 'unresolved' : 'resolved',
    evidence: selected === null ? [] : ['explicit_reference_or_context_binding']
  };
}

function evaluateDefiniteDescription(input = {}) {
  const description = text(input.description, 'description');
  const domain = Array.isArray(input.domain) ? input.domain : [];
  const matches = domain.filter((item) => item && item.satisfies === true);
  const russell = matches.length === 1;
  return {
    description,
    matches,
    uniqueness: matches.length === 1,
    existence: matches.length > 0,
    russell: { true: russell, reason: russell ? 'existence_and_uniqueness' : 'failed_existence_or_uniqueness' },
    strawson: { presuppositionSatisfied: matches.length === 1 },
    donnellan: { reading: input.use || 'undetermined' },
    status: 'theory_comparison'
  };
}

module.exports = { THEORIES, analyzeExpression, resolveReference, evaluateDefiniteDescription };
