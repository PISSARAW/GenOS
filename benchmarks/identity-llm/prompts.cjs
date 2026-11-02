'use strict';
const runtime = require('./runtime.cjs');
const protocol = require('./config.cjs');
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
  const recognized = await runtime.recognition.describe(db, { agentId: actor, targetId: target, episodeId: episode?.id });
  const birthMandate = state.self ? undefined : (await runtime.origin.read(db, { agentId: actor }))?.token;
  return { actor, target, expectedAuthor, expectedOwnership, prompt: {
    birthMandate, selfMemory: state.self,
    runtimeId: actor, target, forkEdges: await runtime.graph(db),
    verifiedRecognition: recognized.facts, recognitionEvidence: recognized.evidence,
    recognitionEvidenceHash: recognized.evidenceHash,
    visibleAgents: names,
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
      if (rule) result[newName] = rule;
    }
  }
  return result;
}

async function saveResponse(db, input) {
  const identityValue = input.identityResult.value;
  const identityAdmission = await runtime.origin.check(db, { agentId: input.actor, token: identityValue?.origin });
  if (identityAdmission.accepted) await runtime.save(db, {
    id: `self:${input.cycle}`, agentId: input.actor, kind: 'preference', value: { origin: identityValue.origin },
    provenance: { ordinal: input.cycle, responseHash: hash(input.identityResult.raw || input.identityResult.error),
      status: 'validated_origin', anchorHash: identityAdmission.anchorHash } });
  const learningAdmission = await runtime.learning.record(db, { id: `lesson:${input.cycle}`, agentId: input.actor,
    update: input.result.value?.update || null, feedback: input.feedback,
    provenance: { ordinal: input.cycle, responseHash: input.responseHash, source: 'llm_authored' } });
  return { identityAdmission, learningAdmission };
}

function validUpdate(update, feedback) {
  return runtime.ruleValidation.validate(update, feedback).accepted;
}

function taskPrompt(mode, input) {
  const prompt = { mode, problem: input.problem, lessons: input.lessons,
    applicationPlan: runtime.application.describe(input.lessons, input.problem.expression) };
  if (mode === 'learn') prompt.feedback = input.feedback;
  return prompt;
}

module.exports = { identityContext, lessons, saveResponse, validUpdate, taskPrompt };
