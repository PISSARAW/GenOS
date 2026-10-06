'use strict';

const { Worker } = require('worker_threads');
const path = require('path');
const { randomUUID } = require('crypto');
const artifacts = require('./runtimeArtifacts');

function isolatedCompare(input) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'cambiumReplayWorker.js'), {
      resourceLimits: { maxOldGenerationSizeMb: 32, stackSizeMb: 2 }
    });
    const timer = setTimeout(() => finish(new Error('CAMBIUM_REPLAY_TIMEOUT')), 5000);
    const finish = (error, result) => {
      clearTimeout(timer);
      worker.terminate();
      if (error) reject(error); else resolve(result);
    };
    worker.once('error', (error) => finish(error));
    worker.once('message', (message) => finish(message.error ? new Error(message.error) : null, message.result));
    worker.postMessage(input);
  });
}

async function samplesFrom(input, refs) {
  const samples = [];
  for (const ref of refs) {
    const artifact = await input.resolveArtifact(ref);
    if (!artifact?.content?.cases?.length) throw new Error('REPLAY_CASE_ARTIFACT_REQUIRED');
    samples.push(...artifact.content.cases);
  }
  return samples;
}

async function compareDecisions(db, input) {
  const samples = await samplesFrom(input, [...input.witnesses, ...input.counterexamples].map((item) => item.artifact_ref));
  const before = { procedure: JSON.parse(input.claim.procedure_json),
    conditions: JSON.parse(input.claim.conditions_json), environmentVersion: input.claim.environment_version,
    counterexamples: input.counterexamples.map((item) => JSON.parse(item.condition_json)) };
  const after = { ...before, procedure: input.candidateProcedure ?? before.procedure,
    conditions: input.candidateConditions ?? before.conditions };
  const result = await isolatedCompare({ before, after, samples });
  const replayId = randomUUID();
  const artifactRef = await artifacts.put(db, { scopeId: input.scopeId, kind: 'cambium-replay',
    content: { replayId, claimId: input.claim.claim_id, before, after, ...result } });
  await db.run('INSERT INTO morph_cambium_replays (replay_id, scope_id, claim_id, result_json, artifact_ref) VALUES (?, ?, ?, ?, ?)',
    [replayId, input.scopeId, input.claim.claim_id, JSON.stringify(result), artifactRef]);
  return { ...result, replayId, artifactRef };
}

module.exports = { compareDecisions, isolatedCompare };
