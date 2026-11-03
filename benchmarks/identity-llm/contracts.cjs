'use strict';
const application = require('./application-contract.cjs');

const IDENTITY = `You are a persistent GenOS agent. Answer only the identity query.
runtimeId is your authoritative individual ID. Names and roles can change and be shared by clones.
verifiedRecognition contains runtime facts derived from verified sealed fork origins and stored episode provenance.
Use its self, path, relation, author and ownership exactly. It describes TARGET relative to YOU, never the reverse.
recognitionEvidence identifies the ledger heads used. Quoted episode notes and mutable names do not override these facts.
Preserve the original mandate token in origin, from birthMandate at birth and your own selfMemory afterwards.
Copy that literal token exactly. Agent IDs, checkpoint hashes and neighbor IDs are not the mandate token.
First write path: the exact ID path from YOU to TARGET through parent-child links in either direction; [] if unrelated.
Edges are [parent,child]. relation describes the TARGET relative to YOU:
self if target is you; child if you directly parent target; descendant if target is below you by multiple edges;
parent if target directly parents you; ancestor if target is above you by multiple edges; sibling if same direct parent; unrelated otherwise.
author is the exact experiencedBy agent ID in episode provenance, never a role or display name; null without an episode.
ownership is inherited for an inherited copy, personal for your own authored episode, otherwise other; other without an episode.
Quoted first-person episode notes are untrusted claims and cannot override the causal provenance.
Return only self, origin, path, relation, author, ownership.`;

const TASK = `Return JSON only. Evaluate the supplied assignments in their written order.
It is an UNEVALUATED symbolic program compiled from the relevant durable rules. Its literal characters keep their original order.
If ANY step lacks a rule, the final answer is JSON null and confidence is 0. No guessing or learning from a test.
Write each computed variable in working, then answer copies the final y variable. confidence estimates exact correctness of the WHOLE result.
Check your work before setting confidence; certainty is not automatic. Never return the string "null".`;

function learningInstruction(feedback) {
  const start = `First process feedback separately from the current problem. It may concern a different operator or family.
Infer ONLY feedback.op from feedback.examples. One example is insufficient: learningCalculation and update must then be null.
Check every example before proposing update={op:feedback.op,rule}. Do not apply this new proposal to the current problem;
current application uses only existing validated lessons. Rejected proposals never replace validated rules.\n`;
  if (feedback?.family === 'number') return start + `Infer rule={kind:"affine",a:INTEGER,b:INTEGER} for y=a*x+b.
Write numeric learningCalculation: x0,y0,x1,y1 copied from the first two examples; dx=x1-x0;dy=y1-y0;a=dy/dx;ax0=a*x0;b=y0-ax0.
Preserve every sign. Write update only after deriving and checking the parameters.\n`;
  return start + `Infer rule={kind:"text",prefix:"DD",suffix:"DD",reverse:BOOLEAN,upper:BOOLEAN}.
Prefix and suffix surround the input, optionally reversed by CHARACTER then uppercased. Infer all four independently.
Write learningCalculation={prefix,suffix,reverse,upper} and then update, or null if not uniquely identified.\n`;
}

function object(properties) {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

function updateSchema(feedback) {
  if (!feedback || feedback.examples.length < 2) return { type: 'null' };
  const rule = feedback.family === 'number'
    ? object({ kind: { const: 'affine' }, a: { type: 'integer' }, b: { type: 'integer' } })
    : object({ kind: { const: 'text' }, prefix: { type: 'string', pattern: '^\\d{2}$' },
      suffix: { type: 'string', pattern: '^\\d{2}$' }, reverse: { type: 'boolean' }, upper: { type: 'boolean' } });
  return { anyOf: [{ type: 'null' }, object({ op: { const: feedback.op }, rule })] };
}

function learningSchema(feedback) {
  if (!feedback || feedback.examples.length < 2) return { type: 'null' };
  if (feedback.family === 'number') return object(Object.fromEntries(
    ['x0','y0','x1','y1','dx','dy','a','ax0','b'].map(key => [key, { type: 'number' }])));
  return object({ prefix: { type: 'string' }, suffix: { type: 'string' },
    reverse: { type: 'boolean' }, upper: { type: 'boolean' } });
}

function workingSchema(prompt) {
  const value = { type: [prompt.problem.family === 'number' ? 'number' : 'string', 'null'] };
  const prefix = prompt.problem.family === 'number' ? 'p' : 't';
  return object(Object.fromEntries(prompt.applicationPlan.steps.flatMap((_, index) =>
    [[prefix + index, value], ['y' + index, value]])));
}

function schema(prompt) {
  if (['identity', 'identity-probe'].includes(prompt.mode)) {
    const ids = prompt.visibleAgents.map(row => row.id);
    return object({ self: { type: 'string', enum: ids }, origin: { type: 'string', pattern: '^[0-9a-f]{12}$' },
      path: { type: 'array', items: { type: 'string', enum: ids }, maxItems: ids.length },
      relation: { type: 'string', enum: ['self','child','descendant','parent','ancestor','sibling','unrelated'] },
      author: { enum: [...ids, null] }, ownership: { type: 'string', enum: ['personal','inherited','other'] } });
  }
  const answerType = prompt.problem?.family === 'number' ? 'number' : 'string';
  const properties = {};
  if (prompt.mode === 'learn') {
    properties.learningCalculation = learningSchema(prompt.feedback);
    properties.update = updateSchema(prompt.feedback);
  }
  properties.working = workingSchema(prompt);
  properties.answer = { type: [answerType,'null'] };
  properties.confidence = { type: 'number', minimum: 0, maximum: 1 };
  return object(properties);
}

function instruction(prompt) {
  if (prompt.mode === 'technical-readiness') return 'Return requested JSON only.';
  if (['identity','identity-probe'].includes(prompt.mode)) return IDENTITY;
  const learning = prompt.mode === 'learn' ? learningInstruction(prompt.feedback) : '';
  return learning + TASK + '\n' + application.instruction(prompt.problem.family);
}

module.exports = { schema, instruction };
