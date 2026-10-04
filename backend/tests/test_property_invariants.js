'use strict';

const assert = require('node:assert/strict');
const fc = require('fast-check');
const { authorizeLocalMorphogenesis, createMorphogenesisLease } = require('../src/services/morphogenesis/transitions/morphogenesisLease');
const { transitionMorphology } = require('../src/services/morphogenesis/transitions/morphologyTransitionService');

const RUN_OPTIONS = { numRuns: 150, seed: 20261004 };
const TOOL_NAMES = ['genos_snapshot', 'genos_orchestrate', 'genos_restore', 'genos_merge', 'genos_run'];
const TOOL_CATALOG = TOOL_NAMES.map((name) => ({ name }));

async function checkMcpLeaseProperties() {
  const { filterLeasedTools } = await import('../../mcp/lease.js');
  const subset = fc.subarray(TOOL_NAMES);
  fc.assert(fc.property(subset, subset, (leased, disabled) => {
    const environment = {
      GENOS_MCP_LEASE: leased.map((name) => name.slice(6)).join(', '),
      GENOS_MCP_DISABLED_TOOLS: disabled.join(','),
      GENOS_MCP_EXPOSE_ALL: 'true'
    };
    const visible = filterLeasedTools(TOOL_CATALOG, environment).map((tool) => tool.name);
    assert.ok(visible.every((name) => leased.includes(name)));
    assert.ok(visible.every((name) => !disabled.includes(name)));
    assert.deepEqual(filterLeasedTools(TOOL_CATALOG, { ...environment, GENOS_MCP_LEASE_EXPIRES_AT: '0' }), []);
  }), RUN_OPTIONS);
  assert.deepEqual(filterLeasedTools(TOOL_CATALOG, {}), []);
}

function localLease(input) {
  return createMorphogenesisLease({
    nodeId: 'branch', allowedOperators: ['CHANGE_BUDGET'], allowedTopologies: ['a_team'],
    stateBoundaries: ['local'], authorityCeiling: ['read'], expiresAt: input.now + 1,
    maxWorkers: input.workers, maxDepth: input.depth,
    tokenBudget: input.tokens, transitionBudget: input.transitions
  });
}

function localRequest(input) {
  return {
    nodeId: 'branch', affectedNodeIds: ['branch', 'worker'],
    operations: [{ type: 'CHANGE_BUDGET' }], topologies: ['a_team'],
    requiredStateBoundaries: ['local'], requiredAuthority: ['read'],
    workerCount: input.workers, depth: input.depth,
    tokenCost: input.tokens, transitionCost: input.transitions, now: input.now,
    graphContext: { nodes: [
      { nodeId: 'branch' }, { nodeId: 'worker', parentNodeId: 'branch' }, { nodeId: 'outsider' }
    ] }
  };
}

function checkMorphogenesisLeaseProperties() {
  const bounded = fc.record({
    workers: fc.integer({ min: 0, max: 20 }), depth: fc.integer({ min: 0, max: 8 }),
    tokens: fc.integer({ min: 0, max: 10000 }), transitions: fc.integer({ min: 0, max: 20 }),
    now: fc.integer({ min: 1, max: 100000 })
  });
  fc.assert(fc.property(bounded, (input) => {
    const lease = localLease(input);
    const request = localRequest(input);
    assert.equal(authorizeLocalMorphogenesis(lease, request).allowed, true);
    const forbidden = [
      { ...request, now: lease.expiresAt },
      { ...request, affectedNodeIds: ['outsider'] },
      { ...request, requiredAuthority: ['write'] },
      { ...request, tokenCost: lease.tokenBudget + 1 },
      { ...request, workerCount: lease.maxWorkers + 1 },
      { ...request, globalMutation: true }
    ];
    for (const attempt of forbidden) assert.equal(authorizeLocalMorphogenesis(lease, attempt).allowed, false);
  }), RUN_OPTIONS);
}

function transitionContext(version) {
  return {
    graph: { version, topology: 'a_team' },
    patch: {
      baseGraphVersion: version, operations: [{ type: 'CHANGE_VARIANT' }],
      reason: 'property probe', evidence: ['independent:probe'],
      rollbackPlan: { restoreDomains: ['graph', 'workers', 'leases', 'state', 'budgets'] }
    }
  };
}

function transitionAdapters(outcome, events) {
  return {
    snapshot: async () => { events.push('snapshot'); return {}; },
    branch: async () => { events.push('branch'); return {}; },
    experiment: async () => { events.push('experiment'); return {}; },
    compare: async () => { events.push('compare'); return {}; },
    promotionGate: async () => { events.push('gate'); return { passed: outcome.gate }; },
    applyPatch: async () => { events.push('apply'); return {}; },
    verify: async () => { events.push('verify'); return { valid: outcome.verified }; },
    commit: async () => { events.push('commit'); return {}; },
    restore: async () => { events.push('restore'); return { restored: true }; }
  };
}

async function checkTransitionProperties() {
  const outcome = fc.record({ gate: fc.boolean(), verified: fc.boolean(), version: fc.integer({ min: 1, max: 1000 }) });
  await fc.assert(fc.asyncProperty(outcome, async (sample) => {
    const events = [];
    const result = await transitionMorphology(transitionContext(sample.version), transitionAdapters(sample, events));
    const committed = sample.gate && sample.verified;
    assert.equal(result.committed, committed);
    assert.equal(events.includes('apply'), sample.gate);
    assert.equal(events.includes('commit'), committed);
    assert.equal(events.includes('restore'), !committed);
    if (!sample.gate) assert.equal(events.includes('verify'), false);
  }), RUN_OPTIONS);
}

async function run() {
  await checkMcpLeaseProperties();
  checkMorphogenesisLeaseProperties();
  await checkTransitionProperties();
  console.log('Property invariants: MCP leases, local morphogenesis, and promotion gate passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
