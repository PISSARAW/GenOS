'use strict';

const corpus = require('../competence-five-arms/corpus.cjs');
const INSTRUCTION = [
  'You write small mathematical function programs. Return the rule coefficients, NOT a numeric answer or a copied observation.',
  'The interpreter will calculate the query using your programs. Each opaque operator has one of three types:',
  'affine: y=a*x+b (set c=0); quadratic: y=a*x*x+b*x+c; hinge: y=a*x+b+c*max(0,x-5).',
  'All coefficients are integers from -3 to 3. Programs are bound to an operator name AND its epoch.',
  'Use only current-epoch observations, or exact provided rules when supplied. Do not invent missing definitions.',
  'When exact provided rule objects are listed, copy ALL current queried rule objects into programs unchanged. No inference is needed for them.',
  'Infer coefficients and verify every relevant row. At x=0: affine/hinge b=y, quadratic c=y.',
  'For affine, two distinct points give a=(y2-y1)/(x2-x1). Quadratic second differences give2*a.',
  'A hinge agrees with a line below5; a point above5 is necessary to determine its c.',
  'If multiple possible functions still disagree on the query, abstain with reason ambiguous.',
  'If no current evidence or provided rule exists, abstain with reason missing and list the operator.',
  'Output JSON conforming to the supplied schema. Include every queried program exactly once when answering.',
  'Confidence is the probability the query is justified and exact. For abstention use confidence0 and programs[].'
].join(' ');

function expression(node) {
  return typeof node === 'number' ? String(node) : `${node.op}(${expression(node.value)})`;
}

function formula(program) {
  if (program.kind === 'quadratic') return `${program.a}*x*x+(${program.b})*x+(${program.c})`;
  if (program.kind === 'hinge') return `${program.a}*x+(${program.b})+(${program.c})*max(0,x-5)`;
  return `${program.a}*x+(${program.b})`;
}

function prompt(payload) {
  const ops = [...new Set(corpus.operators(payload.query.expression))];
  const target = ops.map(op => `${op}: current epoch ${payload.query.epochs[op] || 0}`).join('; ');
  const rows = payload.observations.map(row => `${row.step}. ${row.op}, epoch${row.epoch}: f(${row.x})=${row.y}`).join('\n');
  const current = payload.providedRules.filter(rule => ops.includes(rule.op) && rule.epoch === (payload.query.epochs[rule.op] || 0));
  const rules = current.map(rule => `${JSON.stringify(rule)} means f(x)=${formula(rule)}`).join('\n');
  const tool = payload.affineTool ? `Affine tool proposal (may be incomplete): ${JSON.stringify(payload.affineTool)}` : '';
  const feedback = payload.validationFeedback ? `YOUR PREVIOUS PROGRAM WAS REJECTED: ${JSON.stringify(payload.validationFeedback)}. Repair it and recheck every observation.` : '';
  return `TASK: compute ${expression(payload.query.expression)} using your proposed programs.\n`
    + `CURRENT CONTEXT: ${target}\nEXACT PROVIDED RULES:\n${rules || 'none'}\n`
    + `VERIFIED OBSERVATIONS (old epochs are labelled and must not be reused):\n${rows || 'none'}\n${tool}\n${feedback}\n`
    + 'Return coefficients for the current operators; the interpreter, not this JSON response, computes the final value.';
}

module.exports = { INSTRUCTION, expression, formula, prompt };
