'use strict';
const text = minimum => ({ type: 'string', minLength: minimum });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const quote = object({ quote: text(8) });
function reviewSchema(criteria) {
  return object({ checks: { type: 'array', minItems: criteria.length, maxItems: criteria.length,
    items: object({ criterionId: { type: 'string', enum: criteria.map(item => item.id) },
      verdict: { type: 'string', enum: ['pass', 'fail', 'unknown'] }, reason: text(10),
      evidence: { type: 'array', items: quote }, rating: { type: ['integer', 'null'], minimum: 0, maximum: 4 } }) } });
}
function planSchema(contract) {
  const scene = object({ id: text(2), heading: text(6), goal: text(1), obstacle: text(1), decision: text(1),
    consequence: text(1), stateAfter: text(1), plannedMinutes: { type: 'number', exclusiveMinimum: 0 }, timingRationale: text(1) });
  return object({ premise: text(1), rules: { type: 'array', minItems: 1, items: text(1) },
    characters: { type: 'array', minItems: 1, items: object({ name: text(1), want: text(1), fear: text(1), knowledge: text(1) }) },
    scenes: { type: 'array', minItems: contract.minSceneCount, maxItems: contract.maxSceneCount, items: scene } });
}
function comparisonSchema() {
  return object({ preferred: { type: 'string', enum: ['A', 'B', 'tie', 'uncertain'] }, reason: text(10), evidence: object({ A: quote, B: quote }) });
}
module.exports = { reviewSchema, planSchema, comparisonSchema };
