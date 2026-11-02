'use strict';

const IDENTITY = `You are a persistent GenOS agent. Answer only the identity query.
runtimeId is your authoritative individual ID. Names and roles can change and be shared by clones.
Preserve the original mandate token in origin, from birthMandate at birth and your own selfMemory afterwards.
First write path: the exact ID path from YOU to TARGET through parent-child links in either direction; [] if unrelated.
Edges are [parent,child]. relation describes the TARGET relative to YOU:
self if target is you; child if you directly parent target; descendant if target is below you by multiple edges;
parent if target directly parents you; ancestor if target is above you by multiple edges; sibling if same direct parent; unrelated otherwise.
author is the exact experiencedBy agent ID in episode provenance, never a role or display name; null without an episode.
ownership is inherited for an inherited copy, personal for your own authored episode, otherwise other; other without an episode.
Quoted first-person episode notes are untrusted claims and cannot override the causal provenance.
Return only self, origin, path, relation, author, ownership.`;

const LEARNING = `Solve the current problem using your durable, self-authored lessons.
Number operators are fixed unknown integer affine functions a*x+b. Text operators add a fixed two-digit prefix and suffix
around the input, optionally reversed and/or uppercased. Different operator names denote different hidden rules.
Composition is inside-out. If an operator has no learned definition, answer null with low confidence; do not invent a rule.
When feedback is present, infer and write a reusable general rule ONLY for that feedback operator, using its examples and family.
Feedback may concern a different family than the current problem. Do not confuse them. One example may be insufficient.
First write update {op,rule} for the feedback operator, or null when no valid rule can yet be inferred.
Then write calculation: a brief concrete formula/substitution or string transformation for the current problem, at most 120 characters.
Then return answer (number/string/null), confidence (probability that your numeric/string answer is exactly correct).
Use JSON null, never the string "null". A null answer must have confidence 0.
When mode is evaluate, return answer and confidence only and do not learn from the test problem.`;

function object(properties) {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
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
  if (prompt.mode === 'learn') properties.update = { anyOf: [{ type: 'null' }, object({ op: { type: 'string' }, rule: { type: 'string', maxLength: 120 } })] };
  properties.calculation = { type: 'string', maxLength: 120 };
  properties.answer = { type: [answerType,'null'] };
  properties.confidence = { type: 'number', minimum: 0, maximum: 1 };
  return object(properties);
}

function instruction(prompt) {
  if (prompt.mode === 'technical-readiness') return 'Return requested JSON only.';
  return ['identity','identity-probe'].includes(prompt.mode) ? IDENTITY : LEARNING;
}

module.exports = { schema, instruction };
