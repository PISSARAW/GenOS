'use strict';

const assert = require('node:assert/strict');
const Ajv = require('ajv');
const prompt = require('../src/services/workerEvidenceIdentityPrompt');
const format = require('../src/services/agents/workerArtifactResponseSchema');

for (const kind of ['bounded_worker', 'specialist', 'adaptive_worker', 'verifier_worker']) {
  const method = {version: 1, methodId: 'prompt_defined', requiredEvidence: ['artifactText', 'scopeCompletion']};
  const schema = prompt.workerResponseFormat({workerKind: kind,
    workerContract: {mission: {methodContract: method}}}).schema;
  new Ajv({strict: false, validateFormats: false}).compile(schema);
  assert.ok(schema.allOf[0].then.required.includes('artifactText'));
  assert.equal(new Set(schema.allOf[0].then.required).size, schema.allOf[0].then.required.length);
  assert.ok(!format.workerArtifactResponseFormat(kind).schema.allOf[0].then.required.includes('artifactText'),
    'The generic schema is not strengthened without a sealed method requirement.');
}
const schema = prompt.workerResponseFormat({workerKind: 'bounded_worker',
  methodContract: {requiredEvidence: ['artifactText']}}).schema;
const validate = new Ajv({strict: false, validateFormats: false}).compile(schema);
const value = {outcome: 'success', claims: [{statement: 'Candidate proposed', evidence: ['mission']}],
  scopeCompletion: {scopeRef: 'mission', completedRefs: ['mission']}};
assert.equal(validate(value), false, 'A success claim without the requested candidate is rejected.');
value.artifactText = '<ARTIFACT: candidate>{"rules":[]}</ARTIFACT>';
assert.equal(validate(value), true);
const method = {version: 1, methodId: 'prompt_defined', requiredEvidence: ['functionPrograms'],
  evaluator: {domain: 'bounded_function_induction', version: 1}, parameters: {context: {
    observations: [], requested: [{op: 'op_11111111', epoch: 0}]}}};
const structured = prompt.workerResponseFormat({workerKind: 'bounded_worker', methodContract: method}).schema;
assert.ok(structured.required.includes('scopeCompletion'), 'The induction grammar does not rely on conditional role fields.');
assert.ok(require('../src/services/functionInduction/prompt').fromMission({methodContract: method})
  .includes('CURRENT SEALED MATHEMATICAL TASK'));
const generation = require('../src/services/qualityElevation/qualityNativeGeneration');
const compiled = generation.promptText({mission: {workerKind: 'bounded_worker', methodContract: method}},
  'Unrelated example: a=1 and b=2.');
assert.ok(!compiled.includes('Unrelated example'), 'The sealed numerical method defines its model input.');
assert.ok(compiled.includes('op_11111111') && compiled.includes('scopeCompletion'));
assert.equal(generation.promptText({mission: {}}, 'Ordinary mission'), 'Ordinary mission');
const validateStructured = new Ajv({strict: false, validateFormats: false}).compile(structured);
const candidate = {...value}; delete candidate.artifactText;
assert.equal(validateStructured(candidate), false, 'The typed payload is required at the schema root.');
candidate.functionPrograms = {rules: [{op: 'op_11111111', epoch: 0, kind: 'unknown',
  a: 0, b: 0, c: 0, confidence: 0, reason: 'missing'}]};
assert.equal(validateStructured(candidate), true);
delete candidate.functionPrograms.rules[0].reason;
assert.equal(validateStructured(candidate), false, 'Incomplete declarations cannot satisfy the guided schema.');
console.log('Sealed method evidence is required by the guided output schema without weakening kind contracts: PASS');
