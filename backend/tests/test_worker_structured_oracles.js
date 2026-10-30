'use strict';

const assert = require('node:assert/strict');
const checks = require('../src/services/epistemic/oracleObservationChecks');
const fixtures = require('./workerComplianceStructured.cjs');
const scoped = require('../src/services/agents/workerScopedProcedures');
const candidates = require('../src/services/agents/workerCandidateExecutor');

process.env.GENOS_COMPLIANCE_DETERMINISTIC_ADAPTIVE = '1';
process.env.GENOS_COMPLIANCE_DETERMINISTIC_SPECIALIST = '1';
process.env.GENOS_COMPLIANCE_DETERMINISTIC_SYMBIOTIC = '1';
process.env.GENOS_COMPLIANCE_DETERMINISTIC_CREATIVE = '1';
process.env.GENOS_COMPLIANCE_DETERMINISTIC_MEDICAL = '1';

function subject(input) {
  const { kind, domain, workerContract, report, method } = input;
  return { method: method || fixtures.method(kind), domain, workerContract,
    result: report.evidenceReport.workerArtifact.content,
    artifactRefs: report.evidenceReport.workerArtifact.provenance.sourceRefs };
}

function checkEveryStrategy(input, strategies) {
  for (const strategy of strategies) assert.equal(checks.checkObservation(input, strategy).status, 'verified');
}

function assertRefuted(input, strategy, mutate) {
  const altered = structuredClone(input);
  mutate(altered);
  assert.equal(checks.checkObservation(altered, strategy).status, 'refuted');
}

const scope = { mission: { scope: 'fixture://scope', limits: { maxIterations: 3, maxStrategyChanges: 2 },
  specialtyNiche: 'scheduling', hostContractId: 'host-fixture', hostCapabilities: ['deterministic_procedure'] } };
const adaptiveMethod = fixtures.method('adaptive_worker');
const adaptiveReport = scoped.runAdaptive(adaptiveMethod, { mission: { workerContract: { mission: scope.mission,
  limits: scope.mission.limits } }, deadline: Date.now() + 10000 });
const adaptive = subject({ kind: 'adaptive_worker', domain: 'adaptive_strategy', workerContract: {},
  report: adaptiveReport });
const adaptiveContent = adaptiveReport.evidenceReport.workerArtifact.content;
assert.equal(new Set(adaptiveContent.strategyTrace.map((item) => item.strategy)).size, 1);
assert.ok(adaptiveContent.strategyTrace.every((item) => item.decision === 'retained'));
assert.equal(new Set(adaptiveContent.trialReceipts.map((item) => item.id)).size, 1,
  'repeated controlled probes must not claim different strategies produced different results');
assert.throws(() => scoped.runAdaptive({ ...adaptiveMethod, parameters: { trials: [
  ...adaptiveMethod.parameters.trials.slice(0, 1),
  { ...adaptiveMethod.parameters.trials[0], strategy: 'causal_bisection' }
] } }, { mission: { workerContract: { mission: scope.mission, limits: scope.mission.limits } } }),
{ code: 'WORKER_ADAPTATION_INVALID' }, 'unimplemented causal bisection must be rejected');
checkEveryStrategy(adaptive, ['adaptive_trial_map', 'adaptive_trial_replay']);
assertRefuted(adaptive, 'adaptive_trial_map', (input) => { input.result.result.makespan += 1; });

const nicheMethod = fixtures.method('specialist');
const niche = subject({ kind: 'specialist', domain: 'niche_procedure', workerContract: { specialtyNiche: 'scheduling' },
  report: scoped.runNiche(nicheMethod, { mission: { workerContract: { mission: scope.mission } } }) });
checkEveryStrategy(niche, ['niche_receipt_recompute', 'niche_contract_scan']);
assertRefuted(niche, 'niche_contract_scan', (input) => { input.result.specialtyAssessment.inScope = false; });
const nicheLptMethod = { version: 1, methodId: 'niche_procedure', parameters: { niche: 'scheduling',
  procedure: { version: 1, methodId: 'lpt', parameters: { jobs: [{ id: 'A', duration: 5 },
    { id: 'B', duration: 4 }, { id: 'C', duration: 3 }], machines: 2 } } } };
const nicheLpt = subject({ kind: 'specialist', domain: 'niche_procedure', method: nicheLptMethod,
  workerContract: { specialtyNiche: 'scheduling' },
  report: scoped.runNiche(nicheLptMethod, { mission: { workerContract: { mission: scope.mission } } }) });
checkEveryStrategy(nicheLpt, ['niche_receipt_recompute', 'niche_contract_scan']);
assertRefuted(nicheLpt, 'niche_receipt_recompute', (input) => { input.result.procedureReceipt.inputDigest = `sha256:${'0'.repeat(64)}`; });
assertRefuted(nicheLpt, 'niche_contract_scan', (input) => { input.result.result.makespan += 1; });

const hostMethod = fixtures.method('symbiotic_worker');
const host = subject({ kind: 'symbiotic_worker', domain: 'host_procedure', workerContract: {
  hostContractId: 'host-fixture', hostCapabilities: ['deterministic_procedure'] },
report: scoped.runHost(hostMethod, { mission: { workerContract: { mission: scope.mission } } }) });
checkEveryStrategy(host, ['host_receipt_recompute', 'host_contract_scan']);
assertRefuted(host, 'host_contract_scan', (input) => { input.result.hostContribution.contractCompliant = false; });

const creativeMethod = fixtures.method('creative_worker');
const creative = subject({ kind: 'creative_worker', domain: 'creative_combination', workerContract: {},
  report: candidates.runCandidates(creativeMethod) });
checkEveryStrategy(creative, ['creative_cartesian_map', 'creative_nested_scan']);
assertRefuted(creative, 'creative_nested_scan', (input) => { input.result.candidate = 'forged'; });

const medicalMethod = fixtures.method('medical_worker');
const medical = subject({ kind: 'medical_worker', domain: 'synthetic_case_review', workerContract: {},
  report: candidates.runClinical(medicalMethod) });
checkEveryStrategy(medical, ['medical_consideration_map', 'medical_index_scan']);
assertRefuted(medical, 'medical_index_scan', (input) => { input.result.caseScope = 'clinical'; });

console.log('Five structured worker oracles: independent recomputation and tamper refusal PASS');
