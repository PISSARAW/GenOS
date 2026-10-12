'use strict';

const assert = require('node:assert/strict');
const { runScout } = require('../../src/services/agents/deterministicWorkerScout');
const checks = require('../../src/services/epistemic/oracleScoutChecks');
const processOracle = require('../../src/services/epistemic/oracleNativeProcess');
const method = { version: 1, methodId: 'scan_literal', parameters: {
  sources: [{ sourceRef: 'fixture://one', text: 'timeout=30; timeout=45' },
    { sourceRef: 'fixture://two', text: 'latency=20' }], terms: ['timeout', 'latency', 'missing'] } };
const raw = runScout(method);
const subject = { method, output: { observations: raw.observations,
  scannedSources: raw.scannedSources, termCount: raw.termCount, scoutReceipt: raw.scoutReceipt } };

async function main() {
  const strategyResults = await Promise.all([...checks.STRATEGIES].map(strategy =>
    processOracle.run(subject, { kind: 'scout', strategy, timeoutMs: 10000 })));
  assert.deepEqual(strategyResults.map(item => item.result.status), ['verified', 'verified']);
  assert.notEqual(strategyResults[0].detail.processId, strategyResults[1].detail.processId);
  assert.notEqual(strategyResults[0].detail.executionId, strategyResults[1].detail.executionId);
  const changedOffset = structuredClone(subject);
  changedOffset.output.observations[0].offset += 1;
  assert.equal(checks.checkScout(changedOffset, 'scout_index_search').status, 'refuted');
  const omitted = structuredClone(subject);
  omitted.output.observations.pop();
  assert.equal(checks.checkScout(omitted, 'scout_character_scan').status, 'refuted');
  const substitutedReceipt = structuredClone(subject);
  substitutedReceipt.output.scoutReceipt.id = 'solver://forged';
  assert.equal(checks.checkScout(substitutedReceipt, 'scout_index_search').status, 'refuted');
  const reorderedMethod = { methodId: method.methodId, parameters: method.parameters, version: method.version };
  const reorderedOutput = runScout(reorderedMethod);
  assert.equal(checks.checkScout({ method: reorderedMethod, output: {
    observations: reorderedOutput.observations, scannedSources: reorderedOutput.scannedSources,
    termCount: reorderedOutput.termCount, scoutReceipt: reorderedOutput.scoutReceipt
  } }, 'scout_index_search').status, 'verified');
  assert.equal(checks.checkScout(subject, 'unknown').status, 'inconclusive');
  assert.equal(require('../../src/services/epistemic/nativeOracleDomains').definition('scan_literal')
    .verifierType, 'native_method_semantic');
  process.stdout.write(JSON.stringify({ schema: 'genos.native-scout-oracle-probe/v1',
    strategies: 2, processesDistinct: true, tamperRefused: true }) + '\n');
}

main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
