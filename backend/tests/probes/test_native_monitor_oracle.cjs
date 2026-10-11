'use strict';

const assert = require('node:assert/strict');
const { runMonitor } = require('../../src/services/agents/deterministicWorkerMonitor');
const checks = require('../../src/services/epistemic/oracleMonitorChecks');
const processOracle = require('../../src/services/epistemic/oracleNativeProcess');
const method = { version: 1, methodId: 'monitor_samples', parameters: {
  territoryId: 'territory-a', threshold: 10, samples: [
    { value: 12, sourceRef: 'sample://1', observedAt: '2026-10-10T10:00:00Z' },
    { value: 4, sourceRef: 'sample://2', observedAt: '2026-10-10T10:01:00Z' } ] } };
function subjectFor(contract) {
  const output = runMonitor(contract);
  return { method: contract, output: { ...output } };
}
async function main() {
  const subject = subjectFor(method);
  const results = await Promise.all([...checks.STRATEGIES].map(strategy => processOracle.run(subject,
    { kind: 'monitor', strategy, timeoutMs: 10000 })));
  assert.deepEqual(results.map(item => item.result.status), ['verified', 'verified']);
  assert.notEqual(results[0].detail.processId, results[1].detail.processId);
  assert.notEqual(results[0].detail.executionId, results[1].detail.executionId);
  const omitted = structuredClone(subject);
  omitted.output.anomalies = [];
  assert.equal(checks.checkMonitor(omitted, 'monitor_filter_samples').status, 'refuted');
  const forged = structuredClone(subject);
  forged.output.monitorReceipt.id = 'solver://forged';
  assert.equal(checks.checkMonitor(forged, 'monitor_scan_samples').status, 'refuted');
  const reordered = { methodId: method.methodId, parameters: method.parameters, version: method.version };
  assert.equal(checks.checkMonitor(subjectFor(reordered), 'monitor_filter_samples').status, 'verified');
  assert.equal(checks.checkMonitor(subject, 'unknown').status, 'inconclusive');
  process.stdout.write(JSON.stringify({ schema: 'genos.native-monitor-oracle-probe/v1',
    strategies: results.length, processesDistinct: true, tamperRefused: true }) + '\n');
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
