'use strict';

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

const LEARNING = `Solve the current problem using your durable, self-authored lessons.
Number operators are fixed unknown integer affine functions a*x+b. Text operators add a fixed two-digit prefix and suffix
around the input, optionally reversed and/or uppercased. Each operator name has its own definition; infer each independently.
Composition is inside-out. If an operator has no learned definition, answer null with low confidence; do not invent a rule.
When feedback is present, infer a typed reusable rule ONLY for feedback.op from feedback.examples.
For numbers use {kind:"affine",a:INTEGER,b:INTEGER}. Compute a=(y2-y1)/(x2-x1), then b=y1-a*x1 and check every example.
For text use {kind:"text",prefix:"DD",suffix:"DD",reverse:BOOLEAN,upper:BOOLEAN}. Prefix and suffix enclose ONLY the transformed input.
Infer upper and reverse independently. Uppercase output from lowercase input requires upper=true. Keep all four text parameters.
Feedback may concern a different family than the current problem. Do not confuse them. One example may be insufficient.
First write learningCalculation as STRUCTURED NUMBERS, never prose. Use the first two feedback examples (x0,y0),(x1,y1).
Write x0,y0,x1,y1, then dx=x1-x0, dy=y1-y0, a=dy/dx, ax0=a*x0, b=y0-ax0. Preserve all signs.
For text learningCalculation gives the inferred prefix,suffix,reverse,upper. Use null without sufficient feedback.
Only after deriving and checking the parameters, write update {op,rule} for feedback.op, or null if not identified.
Current lessons contain only previously validated typed rules. A rejected proposal cannot replace a valid lesson.
Then write calculation for the CURRENT problem following applicationPlan, using its existing rules, not the feedback operator.
applicationPlan gives only the known rule and input for each step, no computed results. step0 is innermost.
For numeric calculation write input, product=a*input, output=product+b for each step. Unknown rule gives null product and output.
For text calculation write input, reversed, cased, output for each step. reverse=false copies input to reversed; upper=false copies reversed to cased.
Set output=prefix+cased+suffix. Copy each step output into the next step input. Unknown rule gives null output.
For text reverse CHARACTER order when reverse=true, then uppercase when upper=true, then add prefix and suffix.
Example only: input abC, prefix 01, suffix 02, reverse=true, upper=true: rev=Cba;case=CBA;result=01CBA02.
For composition, the entire inner output including its digits becomes the outer input.
Example only: inner maps ab to 01ab02; outer prefix03 suffix04 reverse=true upper=true: rev=20ba10;case=20BA10;result=0320BA1004.
Then return answer (number/string/null), confidence (probability that your numeric/string answer is exactly correct).
Use JSON null, never the string "null". A null answer must have confidence 0.
When mode is evaluate, return the structured calculation, answer and confidence only. Answer copies the final step output.
Use only supplied rules and do not learn from the test problem.`;

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

function stepSchema(input) {
  const value = { type: [input.family === 'number' ? 'number' : 'string', 'null'] };
  const properties = { op: { type: 'string', enum: [input.operator] }, input: value };
  if (input.family === 'number') properties.product = value;
  else { properties.reversed = value; properties.cased = value; }
  properties.output = value;
  return object(properties);
}

function calculationSchema(prompt) {
  return object(Object.fromEntries(prompt.applicationPlan.steps.map((step, index) =>
    [`step${index}`, stepSchema({ operator: step.operator, family: prompt.problem.family })])));
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
  properties.calculation = calculationSchema(prompt);
  properties.answer = { type: [answerType,'null'] };
  properties.confidence = { type: 'number', minimum: 0, maximum: 1 };
  return object(properties);
}

function instruction(prompt) {
  if (prompt.mode === 'technical-readiness') return 'Return requested JSON only.';
  return ['identity','identity-probe'].includes(prompt.mode) ? IDENTITY : LEARNING;
}

module.exports = { schema, instruction };
