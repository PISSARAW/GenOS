'use strict';
const runtime = require('./runtime.cjs');
const protocol = require('./protocol.json');
const { hash } = require('./corpus.cjs');

async function identityContext(db, input) {
  const { w, actor, target, cycle } = input;
  const state = await runtime.state(db, actor);
  const episode = await runtime.latestEpisode(db, { actor, inherited: cycle % 2 === 1 });
  const provenance = episode?.provenance;
  const expectedAuthor = provenance?.experiencedBy || null;
  const expectedOwnership = ownership(actor, provenance);
  const names = await db.all('SELECT id,name,role FROM agents ORDER BY id');
  await runtime.encounter(db, { actor, target, operationId: `meet:${actor}:${cycle}`, targetSession: input.targetSession });
  return { actor, target, expectedAuthor, expectedOwnership, prompt: {
    runtimeId: actor, target, forkEdges: await runtime.graph(db),
    visibleAgents: names,
    selfMemory: state.self, birthMandate: cycle === 0 ? w.origin : undefined,
    currentRole: ['analyst', 'critic', 'planner', 'teacher'][cycle % 4],
    episode: episode ? { id: episode.id, provenance, note: 'I personally performed this event.' } : null } };
}

function ownership(actor, provenance) {
  if (!provenance) return 'other';
  if (provenance.kind === 'inherited') return 'inherited';
  return provenance.experiencedBy === actor ? 'personal' : 'other';
}

function lessons(state, arm, w) {
  if (arm === 'frozen') return {};
  if (arm === 'learned') return state.lessons;
  const result = {};
  for (const family of ['number', 'text']) {
    const ops = w.operations.filter(op => op.family === family && op.trained);
    const mapping = Object.fromEntries(ops.map((op, index) => [ops[(index + 1) % ops.length].name, op.name]));
    for (const [oldName, newName] of Object.entries(mapping)) {
      const rule = state.lessons[oldName];
      result[newName] = typeof rule === 'string' ? rule.replace(/op_[0-9a-f]{5}/g, name => mapping[name] || name) : rule;
    }
  }
  return result;
}

async function saveResponse(db, input) {
  const identityValue = input.identityResult.value;
  if (typeof identityValue?.origin === 'string') await runtime.save(db, {
    id: `self:${input.cycle}`, agentId: input.actor, kind: 'preference', value: { origin: identityValue.origin },
    provenance: { ordinal: input.cycle, responseHash: hash(input.identityResult.raw || input.identityResult.error), status: 'llm_authored' } });
  const value = input.result.value;
  if (!value || typeof value !== 'object') return;
  const update = value.update;
  if (!validUpdate(update, input.feedback)) return;
  await runtime.save(db, { id: `lesson:${input.cycle}`, agentId: input.actor, kind: 'constraint',
    value: update, provenance: { ordinal: input.cycle, responseHash: input.responseHash,
      status: 'llm_authored_unverified', feedbackTaskIds: input.feedback.taskIds } });
}

function validUpdate(update, feedback) {
  return feedback && update?.op === feedback.op && typeof update.rule === 'string'
    && update.rule.length > 0 && update.rule.length <= protocol.maximumLessonCharacters;
}

module.exports = { identityContext, lessons, saveResponse, validUpdate };
