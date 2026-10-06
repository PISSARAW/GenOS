'use strict';

const { createHash } = require('node:crypto');
const OPERATIONS = Object.freeze({
  sort: (values) => [...values].sort((a, b) => a - b),
  unique: (values) => [...new Set(values)],
  absolute: (values) => values.map(Math.abs),
  reverse: (values) => [...values].reverse(),
});

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validateProgram(program) {
  if (program?.schema !== 'genos.nce.procedure.v1' || !Array.isArray(program.steps)) {
    throw new Error('A versioned NCE procedure is required');
  }
  if (program.steps.length > 16 || program.steps.some((step) =>
    typeof step !== 'string' || !Object.hasOwn(OPERATIONS, step))) {
    throw new Error('Unsupported or excessive NCE procedure steps');
  }
  return { schema: program.schema, steps: [...program.steps] };
}

function executeProgram(program, input) {
  const validated = validateProgram(program);
  if (!Array.isArray(input) || input.length > 4096 ||
      input.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error('NCE input must contain at most 4096 finite numbers');
  }
  return validated.steps.reduce((values, step) => OPERATIONS[step](values), [...input]);
}

function program(steps = []) { return validateProgram({ schema: 'genos.nce.procedure.v1', steps }); }

function candidatePrograms() {
  return [[], ['sort'], ['unique', 'sort'], ['absolute', 'sort'],
    ['absolute', 'unique', 'sort'], ['sort', 'reverse']].map(program);
}

module.exports = { validateProgram, executeProgram, program, candidatePrograms, digest };
