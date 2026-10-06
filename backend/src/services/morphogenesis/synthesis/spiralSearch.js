'use strict';

const spiral = require('../capabilities/spiralRuntime');
const artifacts = require('../capabilities/runtimeArtifacts');

async function search(runtime, seed, context) {
  const config = context.spiral;
  const resolveArtifact = artifacts.resolver(context.db, config.scopeId);
  let bestExpression = seed;
  let bestScore = 0;
  const history = [];
  for (let index = 0; index < runtime.maxIterations; index++) {
    const candidates = await config.propose({ expression: bestExpression, index, context });
    const result = await spiral.runAttempt(context.db, { ...config, resolveArtifact, candidates,
      attemptId: `${config.runId}:${index}` }, config.adapters);
    history.push(result);
    if (!result.permitted) break;
    const proof = await resolveArtifact((await require('../capabilities/capabilityEvidenceStore').loadAttempts(context.db, config.scopeId)).at(-1).outcomeRef);
    if (result.outcomeStatus !== 'VERIFIED_SUCCESS') continue;
    bestExpression = proof.content.expression;
    bestScore = proof.content.score;
    break;
  }
  return { bestExpression, bestScore, iterations: history.length, history, morphogenHistory: [], mode: 'verified-spiral' };
}

module.exports = { search };
