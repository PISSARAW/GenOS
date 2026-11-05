'use strict';
const text = minimum => ({ type: 'string', minLength: minimum });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
function reviewSchema(criteria, artifact, options = {}) {
  const quote = require('./qualityQuoteCandidates').quotedSchema(artifact);
  const count = quote.properties.quote.enum?.length || 0;
  const index = object({ quoteId: { type: 'integer', minimum: 0, maximum: count - 1 } });
  return { ...object({ checks: { type: 'array', minItems: criteria.length, maxItems: criteria.length,
    items: {oneOf: criteria.flatMap(criterion => reviewVariants(criterion))} } }),
    $defs: { sourceQuote: options.indexedQuotes ? index : count ? { oneOf: [quote, index] } : quote } };
}
function reviewVariants(criterion) {
  const shared = {criterionId: {type: 'string', const: criterion.id}, reason: text(10),
    evidence: {type: 'array', items: {$ref: '#/$defs/sourceQuote'}}};
  const known = object({...shared, verdict: {type: 'string', enum: ['pass', 'fail']},
    evidence: {...shared.evidence, minItems: 1}, rating: criterion.kind === 'soft'
      ? {type: 'integer', minimum: 0, maximum: 4} : {type: 'null'}});
  const unknown = object({...shared, verdict: {type: 'string', const: 'unknown'}, rating: {type: 'null'}});
  return [known, unknown];
}
function planSchema(contract) {
  const scene = object({ id: text(2), heading: text(6), goal: text(1), obstacle: text(1), decision: text(1),
    consequence: text(1), stateAfter: text(1), plannedMinutes: { type: 'number', exclusiveMinimum: 0 }, timingRationale: text(1) });
  return object({ premise: text(1), rules: { type: 'array', minItems: 1, items: text(1) },
    characters: { type: 'array', minItems: 1, items: object({ name: text(1), want: text(1), fear: text(1), knowledge: text(1) }) },
    scenes: { type: 'array', minItems: contract.minSceneCount, maxItems: contract.maxSceneCount, items: scene } });
}
function comparisonSchema(texts = {}) {
  const { quotedSchema } = require('./qualityQuoteCandidates');
  return object({ preferred: { type: 'string', enum: ['A', 'B', 'tie', 'uncertain'] }, reason: text(10),
    evidence: object({ A: quotedSchema(texts.A), B: quotedSchema(texts.B) }) });
}
module.exports = { reviewSchema, planSchema, comparisonSchema };
