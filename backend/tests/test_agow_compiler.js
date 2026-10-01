'use strict';

const assert = require('node:assert/strict');
const compiler = require('../src/services/agow/proceduralization/consciousnessCompilerService');
const trajectories = require('../src/services/agow/proceduralization/cognitiveTrajectoryService');

function successfulTrajectory(id) {
  return { trajectoryId: id, stepRefs: ['candidate:1', 'frame:1', 'query:memory', 'action:deploy'],
    success: true, evidenceRefs: [`evidence:${id}`], outcomeRefs: [`outcome:${id}`], context: { signature: 'debug' } };
}

const result = compiler.compileTrajectories({ trajectories: [successfulTrajectory('a'), successfulTrajectory('b'), successfulTrajectory('c')], contextHash: 'debug' });
assert.equal(result.proposed, true);
assert.equal(result.status, 'proposal_only');
assert.equal(result.promotionRequested, false);
assert.deepEqual(result.pathway.path, ['candidate:1', 'frame:1', 'query:memory', 'action:deploy']);
assert.equal(trajectories.validTrajectory({ agentId: 'a', frame: { frameId: 'f', realityMode: 'real' },
  steps: ['candidate', 'frame'], success: true }), true);
assert.equal(trajectories.validTrajectory({ agentId: 'a', frame: { frameId: 'f', realityMode: 'counterfactual' },
  steps: ['candidate', 'frame'], success: true }), false);
const unsupported = compiler.compileTrajectories({ trajectories: [successfulTrajectory('a'), successfulTrajectory('b')], contextHash: 'debug' });
assert.equal(unsupported.proposed, false);
assert.equal(unsupported.reason, 'insufficient_episodes');
console.log('✅ AGOW trajectory compiler proposal and evidence gate passed');
