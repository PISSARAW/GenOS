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
  const item = {type: 'object', additionalProperties: false, properties, required: Object.keys(properties)};
  const rules = ruleSet(context, item, method.parameters.outputEncoding);
  format.schema.properties.functionPrograms = {type: 'object', additionalProperties: false,
    properties: {rules}, required: ['rules']};
  delete format.schema.properties.artifactText;
  const candidateFields = (format.schema.allOf || []).flatMap(clause => clause.then?.required || []);
  format.schema.required = [...new Set([...format.schema.required, ...candidateFields, 'functionPrograms'])];
  return format;
}

function ruleSet(context, item, encoding) {
  if (encoding === undefined) return {type: 'array', minItems: context.requested.length,
    maxItems: context.requested.length, items: item};
  if (encoding !== 'operator-keyed/v1') throw Error('FUNCTION_INDUCTION_ENCODING_UNSUPPORTED');
  const properties = Object.fromEntries(context.requested.map(pair => [contract.key(pair), {...item,
    properties: {...item.properties, op: {type: 'string', const: pair.op}, epoch: {type: 'integer', const: pair.epoch}}}]));
  return {type: 'object', additionalProperties: false, properties, required: Object.keys(properties)};
}

module.exports = {bind};
