'use strict';

const assert = require('node:assert/strict');
const compiler = require('../src/services/agow/proceduralization/consciousnessCompilerService');
const trajectories = require('../src/services/agow/proceduralization/cognitiveTrajectoryService');
const autobiographical = require('../src/services/agow/proceduralization/autobiographicalEpisodeAdapter');
const runtimeIngress = require('../src/services/agow/agowRuntimeIngressService');

function successfulTrajectory(id) {
  return { trajectoryId: id, frameId: `frame:${id}`, queryRefs: ['query:memory'], candidateRefs: ['candidate:1'],
    stepRefs: ['candidate:1', 'frame:1', 'query:memory', 'action:deploy'],
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
const episode = autobiographical.episodeFromTrajectory({ agentId: 'a', trajectory: successfulTrajectory('causal'),
  winningCandidateRefs: ['winner-1'], losingCandidateRefs: ['loser-1'], counterfactualRefs: ['cf-1'],
  marketReceiptRefs: ['market-1'], selfWorldAttribution: { agency: 'self' } });
assert.deepEqual(episode.situation.frameIds, ['frame:causal']);
assert.deepEqual(episode.decision.winningCandidates, ['winner-1']);
assert.deepEqual(episode.lesson.counterfactualRefs, ['cf-1']);
const steps = runtimeIngress.trajectorySteps({ frameId: 'frame-1', primaryContent: 'candidate-1',
  causalContext: { triggeredBy: ['candidate-1', 'candidate-2'] } }, { eventId: 'outcome-1' }, 'query-1');
assert.deepEqual(steps, ['candidate-1', 'candidate-2', 'frame-1', 'query-1', 'outcome:outcome-1']);
console.log('✅ AGOW trajectory compiler proposal and evidence gate passed');
