'use strict';

const contract = require('./contract');

function bind(format, method) {
  if (method?.evaluator?.domain !== contract.DOMAIN) return format;
  const context = method.parameters?.context;
  if (!contract.contextValid(context)) throw Error('FUNCTION_INDUCTION_CONTEXT_INVALID');
  const integer = {type: 'integer', minimum: -3, maximum: 3};
  const properties = {op: {type: 'string', enum: [...new Set(context.requested.map(item => item.op))]},
    epoch: {type: 'integer', enum: [0, 1]},
    kind: {type: 'string', enum: ['affine', 'quadratic', 'hinge', 'unknown']},
    a: integer, b: integer, c: integer, confidence: {type: 'number', minimum: 0, maximum: 1},
    reason: {type: 'string', enum: ['answerable', 'missing', 'ambiguous']}};
  const rules = {type: 'array', minItems: context.requested.length, maxItems: context.requested.length,
    items: {type: 'object', additionalProperties: false, properties, required: Object.keys(properties)}};
  format.schema.properties.functionPrograms = {type: 'object', additionalProperties: false,
    properties: {rules}, required: ['rules']};
  delete format.schema.properties.artifactText;
  const candidateFields = (format.schema.allOf || []).flatMap(clause => clause.then?.required || []);
  format.schema.required = [...new Set([...format.schema.required, ...candidateFields, 'functionPrograms'])];
  return format;
}

module.exports = {bind};
