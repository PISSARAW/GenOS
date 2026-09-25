'use strict';

const assert = require('node:assert/strict');
const { runContinuousIntegration } = require('../src/services/aTeam/integration/continuousIntegrationService');

async function run() {
const ready = await runContinuousIntegration({
  aTeam: { members: [], runtimeHandoffs: [], workGraph: {
    workGraphId: 'graph-1', teamRunId: 'run-1', nodes: [{ nodeId: 'n1', responsibility: 'api', requiredCapabilities: ['backend'], inputs: [], outputs: [], preconditions: [], postconditions: [], risk: 'low', criticality: 'low', status: 'READY' }], edges: []
  } }
});
assert.equal(ready.readyToIntegrate, true);
assert.equal(ready.integrationGraphHealth.valid, true);

const blocked = await runContinuousIntegration({ aTeam: {
  members: [],
  runtimeHandoffs: [{ handoffId: 'h-1', blocking: true, status: 'REJECT', accepted: false }],
  workGraph: { workGraphId: 'graph-bad', nodes: [], edges: [] },
  capabilityCoverage: {
    missionCoverage: { ratio: 1 }, staffedCoverage: { ratio: 1 },
    runtimeToolCoverage: { ratio: 0 }, verifiedCoverage: { ratio: 0 }, uncovered: ['security']
  }
} });
assert.equal(blocked.readyToIntegrate, false);
assert.equal(blocked.integrationGraphHealth.valid, false);
assert.equal(blocked.unresolvedContracts.length, 1);
assert.deepEqual(blocked.uncoveredCapabilities, ['security']);
assert.equal(blocked.blockingFailures.length, 3);
const routed = await runContinuousIntegration({
  findExperts: async () => [{ agentId: 'fresh-security-expert', domain: 'security', score: 0.9, freshnessAssessment: { fresh: true } }],
  aTeam: { capabilityGaps: [{ capability: 'security' }], members: [], recruitmentCandidates: [{ agentId: 'candidate', capabilities: ['security'], verifiedCapabilities: { security: true }, estimatedCost: 1 }], repairBudget: 2, availableSlots: 1 }
});
assert.equal(routed.repairPlan.status, 'CONSULT');
assert.equal(routed.repairPlan.knowledgeRoute.expert.agentId, 'fresh-security-expert');
console.log('A-Team continuous integration gate and pre-recruitment memory routing: OK');
}

run().catch((error) => { console.error(error); process.exit(1); });
