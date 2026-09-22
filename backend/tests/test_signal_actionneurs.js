/**
 * Signal Plane actionneur test — verifies production action context is wired.
 */

const assert = require('assert');
const receptor = require('../src/services/signalReceptorService');
const plasticity = require('../src/services/synapticPlasticityService');
const { routeCollectiveSignal } = require('../src/services/collectiveSignalOrganizationRouter');

function resetAll() {
  receptor.listReceptors().forEach((r) => receptor.unregisterReceptor(r.id));
  plasticity.resetWeights();
}

async function testStartMissionActionWired() {
  resetAll();

  const missionStarted = [];
  const ctx = {
    publishSignal: async () => ({ signalId: 'test' }),
    startMission: async (mission) => {
      missionStarted.push(mission);
      return { started: true, agentId: mission.agentId };
    },
    updateAgent: async () => ({ updated: true }),
    changeOrganization: async () => ({ changed: true }),
  };

  receptor.registerReceptor({
    id: 'mission-receptor',
    targetLigand: 'DEPLOY_READY',
    threshold: 0.5,
    action: 'wake_worker',
    actionData: {
      workerId: 'worker-1',
      role: 'implementation',
    },
  });

  const signal = {
    signalId: 'sig-deploy',
    signalType: 'ligand',
    semanticType: 'DEPLOY_READY',
    concentration: 0.9,
    topic: 'deploy',
    senderAgentId: 'orchestrator-1',
  };

  const result = await receptor.matchAndDispatch(signal, ctx);
  assert.strictEqual(result.dispatched.length, 1);
  assert.strictEqual(missionStarted.length, 1);
  assert.strictEqual(missionStarted[0].agentId, 'worker-1');
  console.log('[PASS] wake_worker action calls startMission from ctx');
}

async function testUpdateAgentActionWired() {
  resetAll();

  const updates = [];
  const ctx = {
    publishSignal: async () => ({ signalId: 'test' }),
    startMission: async () => ({}),
    updateAgent: async (agentId, status, currentTask) => {
      updates.push({ agentId, status, currentTask });
      return { updated: true };
    },
    changeOrganization: async () => ({ changed: true }),
  };

  receptor.registerReceptor({
    id: 'status-receptor',
    targetLigand: 'STATUS_CHANGE',
    threshold: 0.1,
    action: 'update_agent',
    actionData: {
      agentId: 'worker-2',
      status: 'idle',
      currentTask: 'completed',
    },
  });

  const signal = {
    signalId: 'sig-status',
    signalType: 'ligand',
    semanticType: 'STATUS_CHANGE',
    concentration: 0.5,
    topic: 'status',
    senderAgentId: 'orchestrator-1',
  };

  const result = await receptor.matchAndDispatch(signal, ctx);
  assert.strictEqual(result.dispatched.length, 1);
  assert.strictEqual(updates.length, 1);
  assert.strictEqual(updates[0].status, 'idle');
  console.log('[PASS] update_agent action calls updateAgent from ctx');
}

async function testChangeOrganizationActionWired() {
  resetAll();

  const orgChanges = [];
  const ctx = {
    publishSignal: async () => ({ signalId: 'test' }),
    startMission: async () => ({}),
    updateAgent: async () => ({}),
    changeOrganization: async (options) => {
      orgChanges.push(options);
      return { changed: true, organization: options.organization };
    },
  };

  receptor.registerReceptor({
    id: 'org-receptor',
    targetLigand: 'REORG_TRIGGER',
    threshold: 0.5,
    action: 'change_organization',
    actionData: {
      organization: 'slime_mould_network',
    },
  });

  const signal = {
    signalId: 'sig-reorg',
    signalType: 'ligand',
    semanticType: 'REORG_TRIGGER',
    concentration: 0.8,
    topic: 'topology',
    senderAgentId: 'orchestrator-1',
  };

  const result = await receptor.matchAndDispatch(signal, ctx);
  assert.strictEqual(result.dispatched.length, 1);
  assert.strictEqual(orgChanges.length, 1);
  assert.strictEqual(orgChanges[0].organization, 'slime_mould_network');
  console.log('[PASS] change_organization action calls changeOrganization from ctx');
}

function testPlasticityWeightedRouting() {
  resetAll();

  // Simulate plasticity weights
  plasticity.reinforce('orch-1', 'worker-a', 'ligand'); // weight > default
  plasticity.reinforce('orch-1', 'worker-a', 'ligand'); // reinforce again
  plasticity.depress('orch-1', 'worker-b', 'ligand'); // weight < default

  const weightsA = plasticity.getChannelWeight('orch-1', 'worker-a');
  const weightsB = plasticity.getChannelWeight('orch-1', 'worker-b');

  assert.ok(weightsA.weight > weightsB.weight, 'worker-a should have higher weight than worker-b');
  console.log('[PASS] Plasticity weights differentiate routes (A=' + weightsA.weight.toFixed(2) + ' > B=' + weightsB.weight.toFixed(2) + ')');
}

async function run() {
  testPlasticityWeightedRouting();
  await testStartMissionActionWired();
  await testUpdateAgentActionWired();
  await testChangeOrganizationActionWired();
  console.log('\nAll Signal Plane actionneur tests passed.');
}

run().catch((err) => {
  console.error('[FAIL]', err.message);
  process.exit(1);
});
