'use strict';

const corpus = require('../competence-five-arms/corpus.cjs');
const KINDS = ['affine', 'quadratic', 'hinge'];

function schema(query) {
  const coefficient = { type: 'integer', minimum: -3, maximum: 3 };
  const ops = [...new Set(corpus.operators(query.expression))];
  return { type: 'object', additionalProperties: false,
    properties: {
      programs: { type: 'array', maxItems: ops.length, items: { type: 'object', additionalProperties: false,
        properties: { op: { type: 'string', enum: ops }, epoch: { type: 'integer', minimum: 0, maximum: 1 },
          kind: { type: 'string', enum: KINDS }, a: coefficient, b: coefficient, c: coefficient },
        required: ['op', 'epoch', 'kind', 'a', 'b', 'c'] } },
      confidence: { type: 'number', minimum: 0, maximum: 1 }, abstain: { type: 'boolean' },
      reason: { type: 'string', enum: ['answerable', 'missing', 'ambiguous'] },
      missing: { type: 'array', items: { type: 'string', enum: ops } } },
    required: ['programs', 'confidence', 'abstain', 'reason', 'missing'] };
}

function programValid(program) {
  if (!program || !KINDS.includes(program.kind)) return false;
  if (!/^op_[a-f0-9]{8}$/.test(program.op)) return false;
  if (![0, 1].includes(program.epoch)) return false;
  const bounded = ['a', 'b', 'c'].every(key => Number.isInteger(program[key]) && Math.abs(program[key]) <= 3);
  return bounded && (program.kind !== 'affine' || program.c === 0);
}

function valid(value) {
  if (!value || !Array.isArray(value.programs)) return false;
  if (!value.programs.every(programValid)) return false;
  if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) return false;
  if (typeof value.abstain !== 'boolean' || !['answerable', 'missing', 'ambiguous'].includes(value.reason)) return false;
  return Array.isArray(value.missing) && value.missing.every(op => typeof op === 'string');
}

module.exports = { schema, valid, programValid, KINDS };
