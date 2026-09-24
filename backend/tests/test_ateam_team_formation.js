'use strict';

const assert = require('node:assert/strict');
const { optimizeFormation } = require('../src/services/aTeamService');

const result = optimizeFormation({
  capacity: 2,
  requirements: [
    { capability: 'api', weight: 1, requiredTools: ['api:write'] },
    { capability: 'security', weight: 0.9 }
  ],
  candidates: [
    { agentId: 'api-no-lease', role: 'backend_engineer', capabilities: ['api'], reliability: 1 },
    { agentId: 'api-proven', role: 'backend_engineer', capabilities: ['api'], availableTools: ['api:write'], reliability: 0.95, historicalFitness: 0.9 },
    { agentId: 'security-proven', role: 'security_reviewer', capabilities: ['security'], verifiedCapabilities: { security: true }, reliability: 0.9 }
  ]
});

assert.deepEqual(result.selected.map((item) => item.candidate.agentId), ['api-proven', 'security-proven']);
assert.equal(result.coverage, 1);
assert.equal(result.gaps.length, 0);
assert.equal(result.decision.status, 'COVERED');

const constrained = optimizeFormation({
  capacity: 1,
  requirements: [{ capability: 'api' }, { capability: 'security' }],
  candidates: [{ id: 'one', capabilities: ['api'] }]
});
assert.equal(constrained.coverage, 0.5);
assert.deepEqual(constrained.gaps.map((gap) => gap.capability), ['security']);
console.log('A-Team team formation optimizer: OK');
