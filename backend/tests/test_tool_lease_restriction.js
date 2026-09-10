/**
 * Non-regression tests for bug #6 (tool leases, fail-closed).
 *
 * - workerToolLease matches roles EXACTLY (no substring spoofing).
 * - orchestratorToolLease strips every `genos_orchestrate` spelling and
 *   intersects plan.requiredTools with the known-tool allow-list.
 * - A caller-supplied lease can only restrict the policy lease, never widen.
 * - authorizeMission rejects a lease that is not a subset of the CURRENT
 *   role policy with AGENT_TOOL_LEASE_STALE (frozen lease after role change).
 * - `idle` / `blocked` are not terminal statuses anymore.
 */
const assert = require('assert');
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'test-only';
const fs = require('fs');
const path = require('path');
const leasePolicy = require('../src/services/toolLeasePolicy');
const orchestrationState = require('../src/services/agentOrchestrationState');
const authority = require('../src/services/agentAuthorityService');
const { getDatabase, closeDatabase } = require('../src/db');

function checkExactWorkerRoles() {
  const { workerToolLease } = orchestrationState;
  assert.ok(workerToolLease('independent_reviewer').includes('genos_adversarial_review'));
  assert.ok(workerToolLease('security_reviewer').includes('genos_adversarial_review'));
  assert.ok(workerToolLease('observer').includes('genos_adversarial_review'));
  assert.ok(workerToolLease('neutral_observer').includes('genos_adversarial_review'));
  assert.ok(workerToolLease('Red_Team').includes('genos_security_coevolution'));
  assert.ok(workerToolLease('blue_team').includes('genos_security_coevolution'));
  assert.ok(!workerToolLease('reviewer_spoof').includes('genos_adversarial_review'));
  assert.ok(!workerToolLease('my_reviewer_helper').includes('genos_adversarial_review'));
  assert.ok(!workerToolLease('observer2').includes('genos_adversarial_review'));
  assert.ok(!workerToolLease('red_teamer').includes('genos_security_coevolution'));
  assert.ok(!workerToolLease('thread_team_lead').includes('genos_security_coevolution'));
  assert.ok(!workerToolLease('blue_team_assistant').includes('genos_security_coevolution'));
  assert.ok(!workerToolLease('implementation').includes('genos_adversarial_review'));
  assert.ok(!workerToolLease('implementation').includes('genos_security_coevolution'));
  console.log('  worker exact-role matching: ok');
}

function checkOrchestratorLease() {
  const { orchestratorToolLease } = orchestrationState;
  const lease = orchestratorToolLease({
    requiredTools: ['genos_inspect', ' GENOS_ORCHESTRATE ', 'genos-orchestrate', 'Genos_Orchestrate', 'genos_evil_tool', 'genos_snapshot', 42, '', '  ']
  });
  assert.ok(!lease.some((tool) => leasePolicy.isOrchestrateVariant(tool)), 'no orchestrate variant may survive');
  assert.ok(lease.includes('genos_snapshot'), 'core tools are kept');
  assert.ok(lease.includes('genos_inspect'), 'known plan tools are kept');
  assert.ok(!lease.includes('genos_evil_tool'), 'unknown plan tools are refused');
  assert.ok(lease.every((tool) => typeof tool === 'string' && tool.trim() !== ''), 'no junk entries');
  const plain = orchestratorToolLease({});
  assert.ok(!plain.some((tool) => leasePolicy.isOrchestrateVariant(tool)));
  console.log('  orchestrator lease filtering: ok');
}

function checkRestrictionOnlyNarrows() {
  const policy = leasePolicy.derivePolicyLease('orchestrator', 'coordinator', {});
  const restricted = leasePolicy.restrictProvidedLease(
    ['genos_snapshot', 'genos_orchestrate', 'genos_unknown_tool', ' genos_run ', 'genos_snapshot'],
    policy
  );
  assert.deepEqual(restricted, ['genos_snapshot', 'genos_run']);
  assert.deepEqual(leasePolicy.restrictProvidedLease([], policy), [...policy]);
  assert.deepEqual(leasePolicy.restrictProvidedLease(undefined, policy), [...policy]);
  const workerPolicy = leasePolicy.derivePolicyLease('worker', 'implementation', {});
  const workerRestricted = leasePolicy.restrictProvidedLease(['genos_run', 'genos_adversarial_review'], workerPolicy);
  assert.deepEqual(workerRestricted, ['genos_run']);
  console.log('  supplied lease can only restrict: ok');
}

function checkTerminalSet() {
  const { TERMINAL_AGENT_STATUSES } = orchestrationState;
  assert.ok(!TERMINAL_AGENT_STATUSES.has('idle'), 'idle is the initial/re-arm state, not terminal');
  assert.ok(!TERMINAL_AGENT_STATUSES.has('blocked'), 'blocked is a budget/guard halt, not terminal');
  for (const status of ['completed', 'error', 'terminated', 'apoptosis', 'quarantined']) {
    assert.ok(TERMINAL_AGENT_STATUSES.has(status), `${status} stays terminal`);
  }
  console.log('  terminal statuses: ok');
}

function staleCode(error) {
  return error && error.code === 'AGENT_TOOL_LEASE_STALE';
}

async function checkStaleLeaseRejected(db) {
  await assert.rejects(
    () => authority.authorizeMission(db, {
      agentId: 'lease-worker', orchestratorAgentId: 'lease-orchestrator',
      toolLease: ['genos_search_failures', 'genos_adversarial_review']
    }),
    staleCode,
    'privileged tool outside the implementation role must be stale'
  );
  const agent = await authority.authorizeMission(db, {
    agentId: 'lease-worker', orchestratorAgentId: 'lease-orchestrator',
    toolLease: ['genos_search_failures']
  });
  assert.equal(agent.id, 'lease-worker');
  await assert.rejects(
    () => authority.authorizeMission(db, { agentId: 'lease-orchestrator', toolLease: ['genos_snapshot', 'Genos_Orchestrate'] }),
    staleCode,
    'orchestrate variant must be stale for orchestrators'
  );
  await db.run("UPDATE agents SET role = 'implementation' WHERE id = 'lease-red'");
  await assert.rejects(
    () => authority.authorizeMission(db, {
      agentId: 'lease-red', orchestratorAgentId: 'lease-orchestrator',
      toolLease: ['genos_search_failures', 'genos_security_coevolution']
    }),
    staleCode,
    'lease frozen before the role mutation must be stale'
  );
  console.log('  stale lease rejection: ok');
}

async function run() {
  checkExactWorkerRoles();
  checkOrchestratorLease();
  checkRestrictionOnlyNarrows();
  checkTerminalSet();

  const dbPath = path.resolve(__dirname, 'tool-lease-restriction-test.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);
  try {
    await db.run("INSERT INTO workspaces (id, name, path, description) VALUES ('lease-ws', 'Lease WS', ?, 'lease tests')", __dirname);
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES ('lease-orchestrator', 'Lease Orchestrator', 'coordinator', 'idle', 'orchestrator', 'lease-ws')");
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id, parent_agent_id) VALUES ('lease-worker', 'Lease Worker', 'implementation', 'idle', 'worker', 'lease-ws', 'lease-orchestrator')");
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id, parent_agent_id) VALUES ('lease-red', 'Lease Red', 'red_team', 'idle', 'worker', 'lease-ws', 'lease-orchestrator')");
    await checkStaleLeaseRejected(db);
  } finally {
    await closeDatabase();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  }
  console.log('Tool lease restriction: all assertions passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
