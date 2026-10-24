'use strict';

const assert = require('node:assert/strict');
const checkpoint = require('../src/services/communication/communicationCheckpointService');
const contextService = require('../src/services/communication/communicationDecisionContext');
const manifestService = require('../src/services/communication/communicationManifestService');
const relationshipRouting = require('../src/services/communication/relationshipCommunicationRoutingService');

const PROPOSAL = Object.freeze({ action: 'SIGNAL', scope: 'UNICAST', recipients: ['recipient'],
  reasonCodes: [], meta: { cost: 1 } });

function gateScenario(input) {
  const context = contextService.buildDecisionContext({ agentId: 'sender', intent: input.intent,
    topology: input.topology, topologyPolicy: input.topologyPolicy, manifest: input.manifest });
  const topology = contextService.applyTopologyConstraints(context, PROPOSAL, 'SIGNAL');
  return manifestService.enforceManifestChannel(input.manifest, topology.decision);
}

function verifyTopologyAndVariantEffects() {
  const manifest = { agentId: 'sender', phenotypeId: 'Specialist', allowedChannels: ['SIGNAL'] };
  const intent = { purpose: 'delegate', risk: 'high', requiresAction: true };
  const baseline = gateScenario({ manifest, intent, topology: { topologyId: 'peer_mesh', variantId: 'open' },
    topologyPolicy: { variantId: 'open', allowedScopes: ['UNICAST'] } });
  assert.equal(baseline.decision.action, 'SIGNAL');
  const topologyChanged = gateScenario({ manifest, intent, topology: { topologyId: 'peer_mesh', variantId: 'open' },
    topologyPolicy: { variantId: 'open', allowedScopes: ['MULTICAST'] } });
  assert.equal(topologyChanged.decision.action, 'SILENCE');
  const variantChanged = gateScenario({ manifest, intent, topology: { topologyId: 'peer_mesh', variantId: 'anonymous' },
    topologyPolicy: { variantId: 'open', allowedScopes: ['UNICAST'] } });
  assert.equal(variantChanged.decision.action, 'SILENCE');
  return { baseline: baseline.decision.action, topology: topologyChanged.decision.action,
    variant: variantChanged.decision.action };
}

function verifyAgentTypeAndCombinationEffects() {
  const intent = { purpose: 'delegate', risk: 'high', requiresAction: true };
  const topology = { topologyId: 'peer_mesh', variantId: 'open' };
  const topologyPolicy = { variantId: 'open', allowedScopes: ['UNICAST'] };
  const specialist = gateScenario({ manifest: { agentId: 'sender', allowedChannels: ['SIGNAL'] }, intent, topology, topologyPolicy });
  const reconciler = gateScenario({ manifest: { agentId: 'sender', allowedChannels: ['UNICAST'] }, intent, topology, topologyPolicy });
  const combined = gateScenario({ manifest: { agentId: 'sender', allowedChannels: ['UNICAST'] }, intent,
    topology: { topologyId: 'peer_mesh', variantId: 'anonymous' }, topologyPolicy });
  assert.equal(specialist.decision.action, 'SIGNAL');
  assert.equal(reconciler.decision.action, 'SILENCE');
  assert.ok(reconciler.decision.reasonCodes.includes('CHANNEL_NOT_ALLOWED'));
  assert.equal(combined.decision.action, 'SILENCE');
  assert.ok(combined.decision.reasonCodes.includes('TOPOLOGY_VARIANT_MISMATCH'));
  return { specialist: specialist.decision.action, reconciler: reconciler.decision.action,
    topologyAndType: combined.decision.action };
}

async function verifyRelationshipEffect() {
  const relations = [
    { source_agent_id: 'sender', target_agent_id: 'low', relation_type: 'colleague', relation_class: 'organizational',
      metadata_json: JSON.stringify({ trustByDomain: { navigation: 0.2 } }), organization_id: 'org', project_id: 'project' },
    { source_agent_id: 'sender', target_agent_id: 'high', relation_type: 'colleague', relation_class: 'organizational',
      metadata_json: JSON.stringify({ trustByDomain: { navigation: 0.9 } }), organization_id: 'org', project_id: 'project' }
  ];
  const db = { all: async (sql, args) => sql.includes('agent_relations') ? relations
    : [{ id: 'sender', role: 'worker' }, { id: args[1], role: 'worker' }] };
  const ranked = await relationshipRouting.profileAudience({ db,
    intent: { senderAgentId: 'sender', risk: 'low', domain: 'navigation' },
    candidates: [{ agentId: 'low' }, { agentId: 'high' }], organizationId: 'org', projectId: 'project' });
  assert.deepEqual(ranked.map((candidate) => candidate.agentId), ['high', 'low']);
  return ranked.map((candidate) => candidate.agentId);
}

function verifyObjectiveEffect() {
  const blocker = checkpoint.buildIntent({ agentId: 'sender', checkpoint: 'BLOCKER_DETECTED' });
  const completion = checkpoint.buildIntent({ agentId: 'sender', checkpoint: 'MISSION_COMPLETED' });
  assert.notEqual(blocker.purpose, completion.purpose);
  assert.equal(blocker.requiresAction, true);
  assert.equal(completion.requiresAction, false);
  assert.equal(blocker.risk, 'high');
  assert.equal(completion.risk, 'low');
  return { blocker: blocker.purpose, completion: completion.purpose,
    blockerRequiresAction: blocker.requiresAction, completionRequiresAction: completion.requiresAction };
}

async function runBenchmark() {
  const dimensions = ['topology', 'variant', 'agentType', 'relationship', 'objective'];
  const results = {
    topologyAndVariant: verifyTopologyAndVariantEffects(),
    agentTypeAndInteraction: verifyAgentTypeAndCombinationEffects(),
    relationRanking: await verifyRelationshipEffect(),
    objective: verifyObjectiveEffect()
  };
  assert.equal(dimensions.length, 5);
  console.log(JSON.stringify({ benchmark: 'Social Interaction Causal Composition', status: 'PASS', dimensions, results }, null, 2));
}

runBenchmark().catch((error) => { console.error(error); process.exitCode = 1; });
