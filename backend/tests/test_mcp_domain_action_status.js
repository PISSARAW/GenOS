'use strict';

const assert = require('node:assert/strict');
process.env.GENOS_CONCEPT_ACTION_OBSERVATION = '0';

async function testEfferenceOutcome() {
  const events = [];
  let transportSuccesses = 0;
  const { runToolExecution } = require('../src/services/mcpExecutor/efferenceBridge');
  const output = await runToolExecution({
    context: { db: {}, agentId: null, toolName: 'genos_guardrails_verify', args: {}, circuitScope: {} },
    executeConfiguredTransport: async () => ({ success: true, status: 'completed', output: 'guardrail verification failed' }),
    applyDomainVerdict: require('../src/services/mcpExecutor/domainVerdict').applyDomainVerdict,
    circuitBreaker: { recordSuccess() { transportSuccesses += 1; }, recordFailure() {} },
    telemetry: { emitEvent(event) { events.push(event); return event; } }
  });
  assert.equal(transportSuccesses, 1, 'A domain failure must not be treated as a transport failure.');
  assert.equal(output.domainVerdict, 'failure');
  assert.equal(events[0].eventType, 'WORKFLOW_MCP_TOOL_FAILED');
}

async function testBoundMotorReceipt() {
  const receipts = require('../src/services/bodyActionReceiptService');
  const motor = require('../src/services/perception/embodied/motorOutcomeAdapter');
  const dispatch = require('../src/services/mcpExecutor/dispatch');
  const breaker = require('../src/services/circuitBreaker');
  const telemetry = require('../src/services/telemetryObserver');
  const originals = {
    predict: receipts.predict, observe: receipts.observe, execute: motor.execute,
    transport: dispatch.executeConfiguredTransport, recordSuccess: breaker.recordSuccess,
    recordFailure: breaker.recordFailure, emitEvent: telemetry.emitEvent
  };
  const observed = [];
  try {
    receipts.predict = async () => {};
    receipts.observe = async (input) => { observed.push(input.outcome); };
    motor.execute = async ({ environment }) => {
      const outcome = await environment.execute();
      return { status: outcome.status, result: outcome.result };
    };
    dispatch.executeConfiguredTransport = async () => ({
      success: true, status: 'completed', output: 'guardrail verification failed'
    });
    breaker.recordSuccess = () => {};
    breaker.recordFailure = () => {};
    telemetry.emitEvent = () => ({ id: 'event' });
    delete require.cache[require.resolve('../src/services/mcpExecutor/bodyMotorBridge')];
    const bridge = require('../src/services/mcpExecutor/bodyMotorBridge');
    const output = await bridge.runBoundMotorTool({
      db: {}, agentId: 'agent-1', toolName: 'genos_guardrails_verify', args: {}, circuitScope: {},
      binding: { envelope: { runId: 'run-1', scope: { entityId: 'agent-1' } } }
    });
    assert.equal(output.success, false);
    assert.equal(output.transportSuccess, true);
    assert.equal(output.status, 'tool_error');
    assert.equal(observed[0].status, 'failed');
    assert.equal(observed[0].domainVerdict, 'failure');
  } finally {
    receipts.predict = originals.predict;
    receipts.observe = originals.observe;
    motor.execute = originals.execute;
    dispatch.executeConfiguredTransport = originals.transport;
    breaker.recordSuccess = originals.recordSuccess;
    breaker.recordFailure = originals.recordFailure;
    telemetry.emitEvent = originals.emitEvent;
    delete require.cache[require.resolve('../src/services/mcpExecutor/bodyMotorBridge')];
  }
}

async function main() {
  await testEfferenceOutcome();
  await testBoundMotorReceipt();
  console.log('MCP domain action status: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
