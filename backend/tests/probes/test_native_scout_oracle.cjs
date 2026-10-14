'use strict';

const assert = require('node:assert/strict');
const { runScout } = require('../../src/services/agents/deterministicWorkerScout');
const checks = require('../../src/services/epistemic/oracleObservationChecks');
const processOracle = require('../../src/services/epistemic/oracleNativeProcess');
const method = { version: 1, methodId: 'scan_literal', parameters: {
  sources: [{ sourceRef: 'fixture://one', text: 'timeout=30; timeout=45' },
    { sourceRef: 'fixture://two', text: 'latency=20' }], terms: ['timeout', 'latency', 'missing'] } };
const raw = runScout(method);
const subject = { domain: 'literal_observation', method, result: raw };

async function main() {
  const strategyResults = await Promise.all([...checks.SCOUT].map(strategy =>
    processOracle.run(subject, { kind: 'observation', strategy, timeoutMs: 10000 })));
  assert.deepEqual(strategyResults.map(item => item.result.status), ['verified', 'verified']);
  assert.notEqual(strategyResults[0].detail.processId, strategyResults[1].detail.processId);
  assert.notEqual(strategyResults[0].detail.executionId, strategyResults[1].detail.executionId);
  const changedOffset = structuredClone(subject);
  changedOffset.result.observations[0].offset += 1;
  assert.equal(checks.checkObservation(changedOffset, 'scout_index').status, 'refuted');
  const omitted = structuredClone(subject);
  omitted.result.observations.pop();
  assert.equal(checks.checkObservation(omitted, 'scout_character_scan').status, 'refuted');
  const substitutedReceipt = structuredClone(subject);
  substitutedReceipt.result.scoutReceipt.id = 'solver://forged';
  assert.equal(checks.checkObservation(substitutedReceipt, 'scout_index').status, 'refuted');
  const reorderedMethod = { methodId: method.methodId, parameters: method.parameters, version: method.version };
  const reorderedOutput = runScout(reorderedMethod);
  assert.equal(checks.checkObservation({ domain: 'literal_observation', method: reorderedMethod, result: reorderedOutput },
    'scout_index').status, 'verified');
  assert.equal(checks.checkObservation(subject, 'unknown').status, 'inconclusive');
  assert.equal(require('../../src/services/epistemic/nativeOracleDomains').definition('literal_observation')
    .verifierType, 'observation_semantic');
  process.stdout.write(JSON.stringify({ schema: 'genos.native-scout-oracle-probe/v1',
    strategies: 2, processesDistinct: true, tamperRefused: true }) + '\n');
}

main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
