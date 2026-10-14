'use strict';

const assert = require('node:assert/strict');

async function main() {
  const dbModule = require('../src/db');
  const dispatch = require('../src/services/mcpExecutor/dispatch');
  const config = require('../src/services/mcpExecutor/config');
  const receipts = require('../src/services/mcpExecutor/directBodyReceipt');
  const breaker = require('../src/services/circuitBreaker');
  const originals = {
    getDatabase: dbModule.getDatabase, transport: dispatch.executeConfiguredTransport,
    guard: config.directCallGuard, normalize: config.normalizeMcpTimeout,
    begin: receipts.begin, audit: receipts.audit, finish: receipts.finish,
    recordSuccess: breaker.recordSuccess, recordFailure: breaker.recordFailure
  };
  const outcomes = [];
  let transportSuccesses = 0;
  try {
    dbModule.getDatabase = async () => ({});
    dispatch.executeConfiguredTransport = async () => ({
      success: true, configured: true, status: 'completed', output: 'guardrail verification failed'
    });
    config.directCallGuard = async () => {};
    config.normalizeMcpTimeout = () => 100;
    receipts.begin = async () => ({ actionId: 'action', agentId: 'agent', runId: 'run' });
    receipts.audit = async () => {};
    receipts.finish = async (input) => { outcomes.push(input.outcome); };
    breaker.recordSuccess = () => { transportSuccesses += 1; };
    breaker.recordFailure = () => {};
    delete require.cache[require.resolve('../src/services/mcpExecutor/directCall')];
    const { callTool } = require('../src/services/mcpExecutor/directCall');
    await assert.rejects(() => callTool('genos_guardrails_verify', {}, { agentId: 'agent' }),
      (error) => error.code === 'MCP_DOMAIN_FAILURE');
    assert.equal(transportSuccesses, 1, 'A failed domain check must not count as transport failure.');
    assert.equal(outcomes[0].status, 'failed');
    assert.equal(outcomes[0].domainVerdict, 'failure');
  } finally {
    dbModule.getDatabase = originals.getDatabase;
    dispatch.executeConfiguredTransport = originals.transport;
    config.directCallGuard = originals.guard;
    config.normalizeMcpTimeout = originals.normalize;
    receipts.begin = originals.begin;
    receipts.audit = originals.audit;
    receipts.finish = originals.finish;
    breaker.recordSuccess = originals.recordSuccess;
    breaker.recordFailure = originals.recordFailure;
    delete require.cache[require.resolve('../src/services/mcpExecutor/directCall')];
  }
  console.log('MCP direct domain status: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
