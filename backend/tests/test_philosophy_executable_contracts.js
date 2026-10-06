'use strict';

const assert = require('node:assert/strict');
const { validateRegistry } = require('../src/philosophy/conceptRegistry');
const { compileConcept, compileRegistry, assessPromotion, validateContract } = require('../src/philosophy/implementationContracts');
const { PROFILES } = require('../src/philosophy/operationalProfiles');
const { DISTINCTIONS, TENSIONS } = require('../src/philosophy/operationalRelations');
const { execute, executeSelection } = require('../src/philosophy/contractRuntime');
const experiments = require('../src/philosophy/contractExperiments');
const { digest } = require('../src/philosophy/contractFingerprint');
const { CONCEPT_DEFINITIONS } = require('../src/philosophy/conceptDefinitions');

const concepts = validateRegistry().concepts;
const compiled = compileRegistry(concepts);
assert.equal(compiled.valid, true, compiled.errors.join('; '));
assert.equal(compiled.pendingCount, 0);
assert.deepEqual(Object.keys(PROFILES).sort(), concepts.map((concept) => concept.id).sort());
const ids = new Set(concepts.map((concept) => concept.id));
for (const pair of [...DISTINCTIONS, ...TENSIONS]) assert.ok(pair.every((id) => ids.has(id)));
assert.deepEqual(compileRegistry(CONCEPT_DEFINITIONS).contracts, compiled.contracts);
assert.ok(compiled.contracts.every((contract) => contract.maturity === 'mechanism-linked'));
assert.ok(compiled.contracts.every((contract) => contract.runtimeAuthority === false));

const report = experiments.runRegistryExperiments(compiled.contracts);
assert.equal(report.total, 375);
assert.equal(report.tested, 375);
assert.equal(report.caseCount, 13500);
assert.deepEqual(report.failed, []);
assert.equal(report.validatedOnRealMissions, 0);
assert.equal(report.actualTopologyExecution, false);
for (const receipt of report.receipts) {
  assert.ok(receipt.observations.every((sample) => sample.passed));
  assert.ok(receipt.observations.every((sample) => sample.distribution.agents.every((agent) => agent.received)));
}

const contract = compiled.contracts.find((item) => item.id === 'epistemology.certainty-doubt');
const receipt = report.receipts.find((item) => item.contractId === contract.id);
assert.equal(experiments.verifyScenarioReceipt(receipt, contract), true);
assert.equal(assessPromotion(contract, 'tested', [receipt]).eligible, true);
assert.equal(assessPromotion(contract, 'validated', [receipt]).eligible, false);
assert.equal(assessPromotion(contract, 'validated', ['scenario-receipt', 'runtime-receipt', 'independent-receipt']).eligible, false);
assert.equal(assessPromotion(contract, 'tested', [report.receipts[0]]).eligible, false);
const changed = { ...contract, limits: [...contract.limits, 'nouvelle limite'] };
assert.equal(experiments.verifyScenarioReceipt(receipt, changed), false);
const forged = structuredClone(receipt);
forged.observations[0].active.after.verificationTasks.push({ contractId: 'fake' });
const { receiptHash, promotionEligible, ...payload } = forged;
forged.receiptHash = digest(payload);
assert.equal(experiments.verifyScenarioReceipt(forged, contract), false);

function silentExecutor(value, input) {
  const result = execute(value, input);
  result.after = result.before;
  return result;
}
assert.equal(experiments.runContractExperiment(contract, { executor: silentExecutor }).passed, false);
const invalid = { ...contract, execution: { ...contract.execution, predicate: 'present' } };
assert.ok(validateContract(invalid).length > 0);
assert.throws(() => execute(invalid), /differs from registry/);
assert.throws(() => execute(contract, { observations: [] }), /object required/);
assert.throws(() => execute(contract, { observations: { huge: 'a'.repeat(132000) } }), /budget exceeded/);

const before = { goals: ['verify'], promotionHeld: true };
const missing = execute(contract, { state: before });
assert.deepEqual(before, { goals: ['verify'], promotionHeld: true });
assert.equal(missing.assessment.status, 'unobserved');
assert.equal(missing.after.verificationTasks.length, 1);
assert.equal(missing.after.responseCaveats.length, 1);
const observed = execute(contract, { state: missing.after, observations: experiments.fixture(contract, 'satisfying') });
assert.equal(observed.after.verificationTasks.length, 0);
assert.equal(observed.after.responseCaveats.length, 0);
assert.equal(observed.after.promotionHeld, true, 'an audit must never lift another authority barrier');
const composition = executeSelection(compiled.contracts.slice(0, 20), {});
assert.equal(composition.state.verificationTasks.length, 20);
assert.equal(composition.state.promotionHeld, true);
console.log(`Executable contract probes passed: ${report.tested}/375, ${report.caseCount} cases; real-mission validation remains 0.`);
