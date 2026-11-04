'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
const assert = require('node:assert/strict');
const kinds = require('../src/services/agents/workerKindService');
const artifacts = require('../src/services/agents/workerArtifactContract');
const math = require('../src/services/functionInduction/mathematics');
const checks = require('../src/services/epistemic/oracleFunctionInductionChecks');

function subject() {
  const rules = [
    {op: 'op_11111111', epoch: 0, kind: 'affine', a: 2, b: -3, c: 0},
    {op: 'op_22222222', epoch: 0, kind: 'quadratic', a: 1, b: -2, c: 3},
    {op: 'op_33333333', epoch: 0, kind: 'hinge', a: -1, b: 2, c: 2}
  ].map(rule => ({...rule, confidence: 0.9, reason: 'answerable'}));
  const observations = rules.flatMap(rule => [-2, -1, 0, 1, 2, 7].map(x =>
    ({op: rule.op, epoch: 0, x, y: math.value(rule, x)})));
  observations.push({op: 'op_44444444', epoch: 0, x: 0, y: 1});
  rules.push({op: 'op_44444444', epoch: 0, kind: 'unknown', a: 0, b: 0, c: 0, confidence: 0, reason: 'ambiguous'},
    {op: 'op_55555555', epoch: 0, kind: 'unknown', a: 0, b: 0, c: 0, confidence: 0, reason: 'missing'});
  const context = {observations, requested: rules.map(({op, epoch}) => ({op, epoch}))};
  const method = {version: 1, methodId: 'prompt_defined', requiredEvidence: ['functionPrograms'],
    evaluator: {domain: 'bounded_function_induction', version: 1}, parameters: {context}};
  const workerContract = kinds.buildWorkerContract('bounded_worker', {prompt: 'Infer public functions',
    scope: 'D:/gv3/oracle-fixture', orchestratorAgentId: 'parent', methodContract: method});
  const source = {workerId: 'worker', runId: 'run', workerKind: 'bounded_worker', workerContract,
    methodContract: method, report: {}};
  const result = {domain: 'bounded_function_induction', method, result: {rules, source}};
  rebind(result);
  return result;
}

function rebind(value) {
  const rules = value.method.parameters.outputEncoding === 'operator-keyed/v1'
    ? Object.fromEntries(value.result.rules.map(rule => [`${rule.op}:${rule.epoch}`, rule])) : value.result.rules;
  const raw = {outcome: 'success', claims: [{statement: 'Candidate programs proposed', evidence: ['mission']}],
    scopeCompletion: {scopeRef: 'mission', completedRefs: ['mission']}, uncertainties: [],
    functionPrograms: {rules}};
  value.result.source.report = {...raw, fullText: JSON.stringify(raw), fullTextTruncated: false,
    workerArtifact: artifacts.buildWorkerArtifact('bounded_worker', JSON.stringify(raw),
      {methodContract: value.method, allowedEvidenceRefs: ['mission'], source: 'unit-fixture'})};
}

async function main() {
  const good = subject();
  for (const strategy of checks.STRATEGIES) assert.equal(checks.check(good, strategy).status, 'verified');
  const wrong = structuredClone(good);
  wrong.result.rules[0].b++;
  rebind(wrong);
  assert.equal(checks.check(wrong, 'function_public_samples').status, 'refuted');
  const guessed = structuredClone(good);
  guessed.result.rules[3] = {op: 'op_44444444', epoch: 0, kind: 'affine', a: 1, b: 1, c: 0,
    confidence: 0.9, reason: 'answerable'};
  rebind(guessed);
  assert.equal(checks.check(guessed, 'function_public_samples').status, 'verified');
  assert.equal(checks.check(guessed, 'function_identifiability').status, 'refuted');
  const forged = structuredClone(good); forged.result.rules[0].a++;
  for (const strategy of checks.STRATEGIES) assert.equal(checks.check(forged, strategy).status, 'refuted');
  const processes = [];
  const keyed = structuredClone(good);
  keyed.method.parameters.outputEncoding = 'operator-keyed/v1';
  rebind(keyed);
  for (const strategy of checks.STRATEGIES) assert.equal(checks.check(keyed, strategy).status, 'verified');
  assert.throws(() => require('../src/services/functionInduction/contract')
    .ruleList({'op_11111111:1': good.result.rules[0]}), /OPERATOR_KEY_MISMATCH/);
  for (const strategy of checks.STRATEGIES) {
    const executed = await require('../src/services/epistemic/oracleNativeProcess').run(keyed,
      {kind: 'observation', strategy, timeoutMs: 10000});
    assert.equal(executed.result.status, 'verified');
    assert.notEqual(executed.detail.processId, process.pid);
    processes.push(executed.detail.processId);
  }
  assert.equal(new Set(processes).size, 2);
  console.log('Function oracle rejects wrong coefficients, false certainty and swapped outputs; two isolated processes verify the fixture: PASS');
}

main().catch(error => {console.error(error); process.exitCode = 1;});
