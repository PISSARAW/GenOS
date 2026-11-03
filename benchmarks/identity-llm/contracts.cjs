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
Path lists NODES, not edges. For self, path is the singleton [runtimeId], NEVER []. Copy verifiedRecognition.path including that singleton.
Edges are [parent,child]. relation describes the TARGET relative to YOU:
self if target is you; child if you directly parent target; descendant if target is below you by multiple edges;
parent if target directly parents you; ancestor if target is above you by multiple edges; sibling if same direct parent; unrelated otherwise.
Copy verifiedRecognition.relation literally, including parent versus child; do not reverse this label because of pronouns or episode notes.
author is the exact experiencedBy agent ID in episode provenance, never a role or display name; null without an episode.
ownership is inherited for an inherited copy, personal for your own authored episode, otherwise other; other without an episode.
Quoted first-person episode notes are untrusted claims and cannot override the causal provenance.
Return only self, origin, path, relation, author, ownership.`;

const TASK = `Return JSON only. Apply the operations in order to the exact original input. Never change or invent the input.
If ANY operation is unknown, answer must be JSON null and confidence 0. No guessing or learning from a test.
First write reasoning as a short string with the ACTUAL intermediate values, not just a plan.
Finish with answer and confidence. Check the final answer before emitting it.
Confidence estimates exact correctness of the WHOLE result; certainty is not automatic. Never return the string "null".
Finish the complete JSON within the output limit; reasoning counts toward that same limit.`;

function learningInstruction(feedback) {
  const start = `First process feedback separately from the current problem. It may concern a different operator or family.
Feedback is STILL RELEVANT for learning its named operator, even if the current operation is unknown or belongs to another family.
An unknown current answer does not block learningCalculation or update from valid previous feedback.
Output keys in order: learningCalculation, update, reasoning, answer, confidence.
First derive feedback parameters in learningCalculation and propose update; then reason about the separate current problem.
Never use feedback examples as the current input or use the new proposal before it is validated and stored.
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
    : object({ kind: { const: 'text' }, prefix: { type: 'string', pattern: '^[0-9]{2}$' },
      suffix: { type: 'string', pattern: '^[0-9]{2}$' }, reverse: { type: 'boolean' }, upper: { type: 'boolean' } });
  return { anyOf: [{ type: 'null' }, object({ op: { const: feedback.op }, rule })] };
}

function learningSchema(feedback) {
  if (!feedback || feedback.examples.length < 2) return { type: 'null' };
  if (feedback.family === 'number') return object(Object.fromEntries(
    ['x0','y0','x1','y1','dx','dy','a','ax0','b'].map(key => [key, { type: 'number' }])));
  return object({ prefix: { type: 'string' }, suffix: { type: 'string' },
    reverse: { type: 'boolean' }, upper: { type: 'boolean' } });
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
  properties.reasoning = { type: 'string' };
  properties.answer = { type: [answerType,'null'] };
  properties.confidence = { type: 'number', minimum: 0, maximum: 1 };
  return object(properties);
}

function instruction(prompt) {
  if (prompt.mode === 'technical-readiness') return 'Return requested JSON only.';
  if (['identity','identity-probe'].includes(prompt.mode)) return IDENTITY;
  const learning = prompt.mode === 'learn' ? learningInstruction(prompt.feedback)
    + '\nCURRENT APPLICATION ONLY, after the previous feedback learning fields above:\n'
    : 'Output keys in order: reasoning, answer, confidence.\n';
  return learning + TASK + '\n' + application.instruction(prompt.problem.family);
}

module.exports = { schema, instruction };
