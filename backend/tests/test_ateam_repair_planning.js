'use strict';

const assert = require('node:assert/strict');
const { planRepair } = require('../src/services/aTeam/adaptation/teamRepairService');

const candidate = { agentId: 'security-new', capabilities: ['security'], verifiedCapabilities: { security: true }, estimatedCost: 3 };
const recruited = planRepair({ gaps: [{ capability: 'security', weight: 1 }], candidates: [candidate], budget: 5, availableSlots: 1 });
assert.equal(recruited.status, 'RECRUIT');
assert.equal(recruited.candidate.agentId, 'security-new');
assert.equal(recruited.workGraphNeedsRecompile, true);
assert.equal(recruited.morphogenesis.plan.morphologyPatch.graph.nodes.find((node) => node.nodeId === recruited.morphogenesis.plan.morphologyPatch.graph.rootNodeId).topology, 'a_team');

const blocked = planRepair({ gaps: [{ capability: 'security' }], candidates: [candidate], budget: 2, availableSlots: 1 });
assert.equal(blocked.status, 'BLOCKED');

const replaced = planRepair({
  members: [{ agentId: 'old-security', status: 'FAILED', ownedResponsibilities: ['security'] }],
  candidates: [candidate], budget: 5, availableSlots: 1
});
assert.equal(replaced.status, 'REPLACE');
assert.equal(replaced.failedMemberId, 'old-security');

const reassigned = planRepair({
  gaps: [{ capability: 'security' }],
  members: [{ agentId: 'available-security', capabilities: ['security'], status: 'ACTIVE' }]
});
assert.equal(reassigned.status, 'REASSIGN');
assert.equal(reassigned.toMemberId, 'available-security');
console.log('A-Team recruitment, replacement and reassignment planning: OK');
