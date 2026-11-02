'use strict';

const FIELD_SCHEMAS = Object.freeze({
  text: { type: 'string', minLength: 5, maxLength: 2000 },
  probability: { type: 'number', minimum: 0, maximum: 1 },
  number: { type: 'number' }, boolean: { type: 'boolean' },
  number_vector: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
  boolean_vector: { type: 'array', items: { type: 'boolean' }, minItems: 5, maxItems: 5 }
});

function actionResponseFormat(observation) {
  const next = observation.nextAction;
  const fields = next?.requiredFields || { answerId: 'candidate' };
  const candidates = observation.candidates.map(({ id }) => id);
  const properties = { type: { const: next?.type || 'submit_answer' } };
  for (const [field, kind] of Object.entries(fields)) {
    properties[field] = kind === 'candidate'
      ? { type: 'string', enum: candidates } : FIELD_SCHEMAS[kind];
    if (!properties[field]) throw new Error(`Unknown action field kind: ${kind}`);
  }
  return { name: 'ett_action', schema: { type: 'object', required: ['action'],
    additionalProperties: false, properties: { action: { type: 'object',
      required: Object.keys(properties), additionalProperties: false, properties } } } };
}

function actionInstructions(observation) {
  return ['Return one JSON object with an action object. Put all required fields directly inside action.',
    'requiredFields describes field types; do not copy it into your response.',
    `Response schema: ${JSON.stringify(actionResponseFormat(observation).schema)}`].join('\n');
}

function applyModelAction(world, value) {
  if (typeof value?.action?.type === 'string') return world.act(value.action);
  if (typeof value?.type === 'string') return world.act(value);
  if (typeof value?.answerId === 'string') {
    return world.act({ type: 'submit_answer', answerId: value.answerId });
  }
  return world.act(null);
}

module.exports = { actionResponseFormat, actionInstructions, applyModelAction };
