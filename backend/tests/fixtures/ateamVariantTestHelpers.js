'use strict';

const { VariantExecutionRuntime } = require('../../src/services/aTeam/variants/variantExecutionRuntime');
const { buildVariantPlan } = require('../../src/services/aTeam/variants/variantRegistry');
const { createRelayHandoff } = require('../../src/services/aTeam/variants/variantExecutionService');

const mockDb = {
  get: async () => null,
  all: async () => [],
  run: async () => ({ changes: 1, lastID: 1 })
};

function createMockMembers(base) {
  return base.map((m, i) => ({
    memberId: m.memberId || `m${i}`,
    agentId: m.agentId,
    workerId: m.workerId,
    domain: m.domain,
    subSystem: m.subSystem,
    label: m.label,
    role: m.role,
    capabilities: m.capabilities || [],
    expertise: m.expertise || [],
    inputSchema: m.inputSchema || { type: 'object' },
    outputSchema: m.outputSchema || { type: 'object' },
    ownedResponsibilities: m.ownedResponsibilities || [],
    dependsOn: m.dependsOn || [],
    externalDependencies: m.externalDependencies || [],
    criticality: m.criticality || 'medium',
    run: m.run
  }));
}

async function runVariantTest(variant, mission, context) {
  const { members, boundaries } = context;
  const plan = buildVariantPlan({ ...mission, variant });
  const runtime = new VariantExecutionRuntime({ db: mockDb, orchestratorId: 'test-orchestrator', plan, mission, members, boundaries });
  return runtime.execute();
}

function relayDigest(mission) {
  return createRelayHandoff({
    version: mission.handoffVersion,
    sequence: mission.handoffSequence,
    previousOwner: 'owner1',
    nextOwner: 'owner2',
    summary: mission.handoffSummary,
    context: mission.handoffState,
    artifactRefs: mission.artifactRefs,
    evidenceRefs: mission.evidenceRefs
  }).digest;
}


module.exports = { createMockMembers, runVariantTest, relayDigest };
