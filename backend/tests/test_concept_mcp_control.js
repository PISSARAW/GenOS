'use strict';

const assert = require('node:assert/strict');
const { createDb } = require('./conceptSqliteFixture');
const bridge = require('../src/services/mcpExecutor/efferenceBridge');
const lifecycle = require('../src/services/conceptActionLifecycleService');
const options = require('../src/services/hierarchicalOptionService');
const gateway = require('../src/services/mcpExecutor');
const observer = require('../src/services/conceptActionObserverService');
const memory = require('../src/services/perception/perceptionMemoryBridgeService');

function execution(db, counters) {
  return async (context) => bridge.runToolExecution({ context: { ...context, db },
    executeConfiguredTransport: async ({ agentId }) => {
      assert.equal(agentId, 'a', 'Fixed actor must reach transport');
      counters.calls += 1;
      await db.run('UPDATE episodic_memories SET is_consolidated = 1 WHERE rowid <= 25');
      return { success: true, configured: true, status: 'completed', domainVerdict: 'unverified' };
    },
    applyDomainVerdict: () => {},
    circuitBreaker: { recordSuccess: () => { counters.successes += 1; },
      recordFailure: () => { counters.failures += 1; } },
    telemetry: { emitEvent: (event) => ({ ...event, id: 'fixture-event' }) }
  });
}

function option() {
  return { id: 'bounded-maintenance', maxSteps: 2, initiation: () => true,
    termination: (state) => state.steps >= 1,
    policy: () => ({ toolName: 'genos_fossil_list', args: {} }) };
}

async function optionChecks(db, counters) {
  process.env.GENOS_MCP_LEASE = 'genos_fossil_list';
  const result = await options.runMcpOption(option(), { db, agentId: 'a', initialState: { goal: 'fixture' } });
  assert.equal(result.status, 'terminated');
  assert.equal(result.steps, 1);
  assert.equal(result.state.interoception.memoryPressure, 0.05);
  assert.equal(result.state.lastAction.domainVerdict, 'unverified');
  assert.equal(result.promotionAllowed, false);
  process.env.GENOS_MCP_LEASE = '';
  assert.equal((await options.runMcpOption(option(), { db, agentId: 'a' })).status, 'blocked');
  assert.equal(counters.calls, 1);
  process.env.GENOS_MCP_LEASE = 'genos_fossil_list';
  const original = gateway.execute;
  gateway.execute = async () => ({ success: false, status: 'denied', code: 'POLICY_DENIED' });
  try {
    const denied = await options.runMcpOption(option(), { db, agentId: 'a' });
    assert.equal(denied.status, 'blocked');
    assert.equal(denied.steps, 0);
  } finally { gateway.execute = original; }
}

async function interruptionCheck() {
  const controller = new AbortController();
  let calls = 0;
  const result = await options.runOption(option(), { steps: 0 }, { signal: controller.signal,
    authorize: async () => { controller.abort(); return true; },
    execute: async () => { calls += 1; return { state: { steps: 1 }, reward: 0 }; } });
  assert.equal(result.status, 'interrupted');
  assert.equal(calls, 0);
}

async function failureIsolation(execute, counters) {
  const original = lifecycle.begin;
  lifecycle.begin = async () => { throw Error('Observer offline'); };
  try {
    const result = await execute({ agentId: 'a', toolName: 'genos_fossil_list', args: {} });
    assert.equal(result.success, true);
    assert.equal(result.conceptObservation.status, 'not_run');
    assert.equal(counters.calls, 2);
    assert.equal(counters.failures, 0);
  } finally { lifecycle.begin = original; }
  process.env.GENOS_CONCEPT_ACTION_OBSERVATION = '0';
  assert.equal((await observer.begin({})).reason, 'disabled');
}

async function main() {
  const names = ['GENOS_CONCEPT_ACTION_OBSERVATION', 'GENOS_MCP_LEASE', 'GENOS_MCP_DISABLED_TOOLS',
    'GENOS_MCP_LEASE_EXPIRES_AT'];
  const saved = new Map(names.map((name) => [name, process.env[name]]));
  const originalExecute = gateway.execute;
  const originalMemory = memory.recordToolObservation;
  const db = await createDb();
  const counters = { calls: 0, successes: 0, failures: 0 };
  try {
    process.env.GENOS_CONCEPT_ACTION_OBSERVATION = '1';
    process.env.GENOS_MCP_DISABLED_TOOLS = '';
    delete process.env.GENOS_MCP_LEASE_EXPIRES_AT;
    memory.recordToolObservation = () => {};
    const execute = execution(db, counters);
    gateway.execute = execute;
    await optionChecks(db, counters);
    await interruptionCheck();
    await failureIsolation(execute, counters);
    assert.equal(counters.successes, 2);
    console.log('Actor propagation, opt-in observation, lease-aware HRL, policy refusal and no retry on observer failure passed.');
  } finally {
    gateway.execute = originalExecute;
    memory.recordToolObservation = originalMemory;
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
