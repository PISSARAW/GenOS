'use strict';

const corpus = require('../competence-five-arms/corpus.cjs');
const memory = require('../competence-five-arms/memory.cjs');
const episodic = require('../../backend/src/services/ontogenesis/memoryService');
const programs = require('./programs.cjs');

async function advance(session, input) {
  const observations = corpus.observations(input.world);
  while (session.history.length < input.checkpoint) {
    const observation = observations[session.history.length];
    const eventHash = session.append({type: 'training_observation', world: input.index, arm: input.arm, observation});
    await memory.ingest(session.db, {worldId: session.worldId, observation, eventHash});
    session.history.push(observation);
  }
  const state = await memory.checkpoint(session.db, session.worldId);
  const restored = await memory.restore(session.db, session.worldId);
  if (corpus.hash(state) !== corpus.hash(restored)) throw Error('TRAINING_RESTORE_FAILED');
  return restored;
}

async function context(session, input) {
  let observations = input.arm === 'no_memory' ? [] : session.history;
  if (['genos_memory', 'hybrid'].includes(input.arm)) {
    observations = await memory.history(session.db, session.worldId);
    const seen = new Set();
    observations = observations.filter(row => {
      const key = corpus.hash([row.op, row.epoch, row.x, row.y]);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
  const requested = session.operators.map(op => ({op, epoch: op === session.operators[3] && input.checkpoint >= 61 ? 1 : 0}));
  const records = await episodic.listMemories(session.db, session.worldId, 'decision');
  const learnedRules = records.map(row => JSON.parse(row.content))
    .filter(row => row.schema === 'genos.learned-function-program/v1' && row.arm === input.arm)
    .map(row => row.rule).filter(rule => programs.consistency(rule, observations));
  return {observations: observations.map(({op, epoch, x, y}) => ({op, epoch, x, y})), requested,
    learnedRules: ['genos_memory', 'hybrid'].includes(input.arm) ? learnedRules : []};
}

async function retain(session, input) {
  if (!['genos_memory', 'hybrid'].includes(input.arm)) return [];
  const ids = [];
  for (const rule of input.rules) {
    const content = {schema: 'genos.learned-function-program/v1', arm: input.arm, rule,
      sourceMissionId: input.missionId, receiptHash: input.receiptHash, publicHistoryHash: corpus.hash(session.history)};
    ids.push(await episodic.recordMemory(session.db, {projectId: session.worldId, kind: 'decision',
      content: JSON.stringify(content), provenance: {phase: 'public_training_only', source: input.receiptHash}}));
  }
  return ids;
}

module.exports = {connect: memory.connect, advance, context, retain};
