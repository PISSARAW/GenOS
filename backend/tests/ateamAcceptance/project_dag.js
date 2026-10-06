'use strict';
const assert = require('node:assert/strict');
const helpers = require('../fixtures/ateamVariantTestHelpers');
const { createMockMembers, relayDigest } = helpers;
function runVariantTest(...args) { return helpers.runVariantTest(args[0], args[1], { members: args[2], boundaries: args[3] }); }

async function case1(context) {
  const { members, boundaries } = context;
  try {
    const dagMembers = createMockMembers([
      { memberId: 'a', domain: 'a', capabilities: ['a'], inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, run: async () => ({ a: 1 }) },
      { memberId: 'b', domain: 'b', capabilities: ['b'], inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, run: async () => ({ b: 2 }) },
      { memberId: 'c', domain: 'c', capabilities: ['c'], dependsOn: ['a', 'b'], inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, run: async (input) => ({ ...input, c: 3 }) }
    ]);
    const mission = {
      variant: 'project_dag',
      dagNodes: [
        { nodeId: 'a', memberId: 'a', dependencies: [], duration: 1, resources: {}, inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, run: dagMembers[0].run },
        { nodeId: 'b', memberId: 'b', dependencies: [], duration: 1, resources: {}, inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, run: dagMembers[1].run },
        { nodeId: 'c', memberId: 'c', dependencies: ['a', 'b'], duration: 1, resources: {}, inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, run: dagMembers[2].run }
      ],
      joinConditions: { c: { type: 'ANY' } },
      resourceLimits: {}
    };
    const result = await runVariantTest('project_dag', mission, dagMembers, boundaries);
    assert.equal(result.status, 'SUCCEEDED');
    assert.ok(result.evidence.some(e => e.type === 'dag_node_completed'));
    console.log('✓ Project DAG: Executes with ANY join');
    context.passed++;
  } catch (e) { console.log('✗ Project DAG: ANY join', e.message); context.failed++; }

}

async function case2(context) {
  const { members, boundaries } = context;
  try {
    const dagMembers = createMockMembers([
      { memberId: 'a', domain: 'a', capabilities: ['a'], inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, run: async () => ({ a: 1 }) },
      { memberId: 'b', domain: 'b', capabilities: ['b'], inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, run: async () => ({ b: 2 }) },
      { memberId: 'c', domain: 'c', capabilities: ['c'], inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, run: async () => ({ c: 3 }) },
      { memberId: 'd', domain: 'd', capabilities: ['d'], dependsOn: ['a', 'b', 'c'], inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, run: async (input) => ({ ...input, d: 4 }) }
    ]);
    const mission = {
      variant: 'project_dag',
      dagNodes: [
        { nodeId: 'a', memberId: 'a', dependencies: [], duration: 1, resources: { cpu: 1 }, inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, run: dagMembers[0].run },
        { nodeId: 'b', memberId: 'b', dependencies: [], duration: 1, resources: { cpu: 1 }, inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, run: dagMembers[1].run },
        { nodeId: 'c', memberId: 'c', dependencies: [], duration: 1, resources: { cpu: 1 }, inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, run: dagMembers[2].run },
        { nodeId: 'd', memberId: 'd', dependencies: ['a', 'b', 'c'], duration: 1, resources: { cpu: 1 }, inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, run: dagMembers[3].run }
      ],
      joinConditions: { d: { type: 'N_OF', count: 2 } },
      resourceLimits: { cpu: 2 }
    };
    const result = await runVariantTest('project_dag', mission, dagMembers, boundaries);
    assert.equal(result.status, 'SUCCEEDED');
    console.log('✓ Project DAG: Executes with N_OF join and resource limits');
    context.passed++;
  } catch (e) { console.log('✗ Project DAG: N_OF join', e.message); context.failed++; }

}

async function case3(context) {
  const { members, boundaries } = context;
  try {
    const mission = {
      variant: 'project_dag',
      dagNodes: [
        { nodeId: 'a', memberId: 'a', dependencies: ['b'], duration: 1, resources: {}, inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, run: async () => ({}) },
        { nodeId: 'b', memberId: 'b', dependencies: ['a'], duration: 1, resources: {}, inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, run: async () => ({}) }
      ],
      resourceLimits: {}
    };
    await runVariantTest('project_dag', mission, members.slice(0, 2), boundaries);
    console.log('✗ Project DAG: Should detect cycle');
    context.failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_DAG_CYCLE');
    console.log('✓ Project DAG: Rejects cyclic graph');
    context.passed++;
  }

}

async function case4(context) {
  const { members, boundaries } = context;
  try {
    const dagMembers = createMockMembers([
      { memberId: 'a', domain: 'a', capabilities: ['a'], inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, run: async () => ({}) },
      { memberId: 'b', domain: 'b', capabilities: ['b'], inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, run: async () => ({}) }
    ]);
    const mission = {
      variant: 'project_dag',
      dagNodes: [
        { nodeId: 'a', memberId: 'a', dependencies: [], duration: 1, resources: { cpu: 2 }, inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, run: dagMembers[0].run },
        { nodeId: 'b', memberId: 'b', dependencies: [], duration: 1, resources: { cpu: 2 }, inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, run: dagMembers[1].run }
      ],
      resourceLimits: { cpu: 1 }
    };
    await runVariantTest('project_dag', mission, dagMembers, boundaries);
    console.log('✗ Project DAG: Should reject resource overallocation');
    context.failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_DAG_RESOURCE_DEMAND_INVALID');
    console.log('✓ Project DAG: Enforces resource limits');
    context.passed++;
  }

}

module.exports = async function run(context) {
  await case1(context);
  await case2(context);
  await case3(context);
  await case4(context);
};
