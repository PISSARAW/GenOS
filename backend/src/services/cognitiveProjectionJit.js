'use strict';

function chooseRepresentation(profile, requested) {
  const supported = profile.representations || ['portable'];
  return requested && supported.includes(requested) ? requested : supported[0] || 'portable';
}

function portable(value) {
  return `task: ${value.operation}\ninput: ${JSON.stringify(value.input)}\nconstraints: ${JSON.stringify(value.constraints || {})}`;
}

function render(value, profile, requested) {
  const representation = chooseRepresentation(profile, requested);
  if (representation === 'json') return JSON.stringify(value);
  if (representation === 'sexpr') return `(task ${value.operation} (input ${JSON.stringify(value.input)}))`;
  if (representation === 'table') return `operation\tinput\n${value.operation}\t${JSON.stringify(value.input)}`;
  if (representation === 'code') return `CALL ${value.operation} ${JSON.stringify(value.input)}`;
  return portable(value);
}

function compile(input = {}) {
  if (!input.value || typeof input.value.operation !== 'string') {
    return { status: 'blocked', reason: 'projection_input_invalid' };
  }
  const profile = input.profile || { representations: ['portable'] };
  const representation = chooseRepresentation(profile, input.representation);
  const prompt = render(input.value, profile, input.representation);
  return { status: 'ready', representation, prompt, bytes: Buffer.byteLength(prompt, 'utf8'),
    model: profile.model || 'unknown-model' };
}

module.exports = { compile };
