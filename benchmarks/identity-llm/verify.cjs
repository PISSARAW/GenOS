'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const protocol = require('./config.cjs');
const corpus = require('./corpus.cjs');
const evidence = require('./evidence.cjs');
const oracle = require('./oracle.cjs');
const scoring = require('./scoring.cjs');
const runtime = require('./runtime.cjs');
const prompts = require('./prompts.cjs');
const inference = require('./inference.cjs');
const { summary } = require('./run.cjs');

function parsedResponse(response) {
  if (response.error) return;
  let value = null;
  try { value = JSON.parse(JSON.stringify(JSON.parse(response.raw))); } catch (_) { /* Malformed output is not repaired. */ }
  assert.deepEqual(response.value, value);
  assert.equal(response.model, protocol.modelAlias);
  assert(response.usage.prompt_tokens > 0 && response.usage.prompt_tokens <= protocol.maximumInputTokens);
  assert(response.usage.completion_tokens > 0 && response.usage.completion_tokens <= protocol.maximumOutputTokens);
}

function checkedOracle(w, task) {
  const solvable = oracle.known(task.expression, w.operations);
  return { taskId: task.id, solvable, expected: solvable ? oracle.evaluate(task.expression, w.operations) : null };
}

function feedback(state) {
  if (!state.previous) return null;
  const examples = state.examples[state.previous];
  return { phase: 'train', op: state.previous, examples: examples.map(row => ({ input: row.input, output: row.output })),
    family: state.previousFamily, taskIds: examples.map(row => row.taskId) };
}

async function checkIdentity(db, input) {
  const { event, prompt, w, response } = input;
  const actor = event.actor;
  let expectedAuthor = null;
  let expectedOwnership = 'other';
  if (prompt.episode) {
    const episode = await runtime.service('autobiographicalMemory/episodeStore').getEpisodeById(prompt.episode.id, db);
    assert(episode, 'Episode missing in durable production store');
    assert.deepEqual(prompt.episode.provenance, episode.provenance);
    expectedAuthor = episode.provenance.experiencedBy;
    expectedOwnership = episode.provenance.kind === 'inherited' ? 'inherited' : 'personal';
  }
  assert.deepEqual(prompt.forkEdges, Object.entries(w.parents).map(([child, parent]) => [parent, child]));
  const expected = scoring.identity(w, { actor, target: prompt.target, expectedAuthor, expectedOwnership }, response);
  assert.deepEqual(event.identity, expected);
  assert.deepEqual(prompt.verifiedRecognition, { self: actor, target: prompt.target,
    path: corpus.causalPath(w, actor, prompt.target), relation: corpus.relation(w, actor, prompt.target),
    author: expectedAuthor, ownership: expectedOwnership });
  await verifyRecognitionEvidence(db, { prompt, w });
}

function ancestorIds(w, actor) {
  const result = [actor];
  while (w.parents[result.at(-1)]) result.push(w.parents[result.at(-1)]);
  return result;
}

async function verifyRecognitionEvidence(db, input) {
  const { prompt, w } = input;
  const evidence = prompt.recognitionEvidence;
  assert.equal(evidence.version, 'causal-recognition-v1');
  assert.equal(evidence.episodeId, prompt.episode?.id || null);
  const registration = await runtime.store.registration(db, { agentId: prompt.runtimeId });
  assert.deepEqual(evidence.scope, registration.scope);
  assert.equal(prompt.recognitionEvidenceHash, runtime.store.hash({ facts: prompt.verifiedRecognition, evidence }));
  const ids = [...new Set([...ancestorIds(w, prompt.runtimeId), ...ancestorIds(w, prompt.target)])];
  assert.deepEqual(evidence.anchors.map(anchor => anchor.agentId).sort(), ids.sort());
  for (const anchor of evidence.anchors) {
    const row = await db.get('SELECT event_hash FROM agent_identity_events WHERE agent_id=? AND revision=?', anchor.agentId, anchor.revision);
    assert.equal(row?.event_hash, anchor.headHash);
  }
}

function learnReplay(state, input) {
  const { prompt, response, task, checked, identityPrompt, identityResponse } = input;
  const value = response.value;
  assert.deepEqual(prompt.feedback, feedback(state));
  assert.deepEqual(prompt.lessons, prompts.selectedLessons(runtime.application.describe(state.lessons, task.expression)));
  assert.deepEqual(prompt.applicationPlan, runtime.application.describe(state.lessons, task.expression));
  assert.deepEqual(identityPrompt.selfMemory, state.self);
  if (identityResponse.value?.origin === input.w.origin) state.self = { origin: identityResponse.value.origin };
  const prior = state.lessons[prompt.feedback?.op];
  if (prior && runtime.ruleValidation.validFeedback(prompt.feedback)
    && !runtime.ruleValidation.matches(prior, prompt.feedback.examples)) delete state.lessons[prompt.feedback.op];
  if (prompts.validUpdate(value?.update, prompt.feedback)) state.lessons[value.update.op] = value.update.rule;
  const op = task.expression.op;
  const examples = state.examples[op] || [];
  state.examples[op] = [...examples, { input: task.expression.input, output: checked.expected, taskId: task.id }].slice(-3);
  state.previous = op;
  state.previousFamily = task.family;
}

async function verifyTraining(db, input, state) {
  const { event, committed, identityCommitted, w } = input;
  assert.equal(event.cycle, state.cycle++);
  const task = corpus.training(w, event.cycle);
  assert.deepEqual(committed.prompt.problem, task);
  assert.equal(event.actor, w.actors[0]);
  assert.equal(identityCommitted.prompt.runtimeId, event.actor);
  assert.equal(identityCommitted.prompt.target, w.actors[event.cycle % w.actors.length]);
  const checked = checkedOracle(w, task);
  assert.deepEqual(event.oracle, checked);
  assert.deepEqual(event.score, scoring.answer(committed.response, checked));
  assert.equal(identityCommitted.prompt.birthMandate, state.self ? undefined : w.origin);
  await checkIdentity(db, { ...input, prompt: identityCommitted.prompt, response: identityCommitted.response });
  learnReplay(state, { prompt: committed.prompt, response: committed.response, task, checked,
    identityPrompt: identityCommitted.prompt, identityResponse: identityCommitted.response, w });
  await verifyOriginAdmission(db, { event, response: identityCommitted.response, w });
  await verifyLearning(db, { event, committed, w });
}

async function verifyOriginAdmission(db, input) {
  const anchor = await db.get('SELECT * FROM agent_identity_events WHERE agent_id=? AND idempotency_key=?',
    input.event.actor, 'identity:origin-token');
  assert.equal(JSON.parse(anchor.body_json).payload.token, input.w.origin);
  const accepted = input.response.value?.origin === input.w.origin;
  assert.deepEqual(input.event.identityAdmission, { accepted, reason: accepted ? 'ORIGIN_MATCHED' : 'ORIGIN_MISMATCH', anchorHash: anchor.event_hash });
  const row = await db.get('SELECT * FROM ontogenesis_memory WHERE id=?', `self:${input.event.cycle}`);
  if (!accepted) { assert.equal(row, undefined); return; }
  assert.deepEqual(JSON.parse(row.content), { origin: input.response.value.origin });
  const provenance = JSON.parse(row.provenance_json);
  assert.equal(provenance.anchorHash, anchor.event_hash);
  assert.equal(provenance.responseHash, corpus.hash(input.response.raw));
}

async function verifyLearning(db, input) {
  const { event, committed, w } = input;
  const update = committed.response.value?.update || null;
  const feedback = committed.prompt.feedback;
  const receipt = runtime.ruleValidation.validate(update, feedback);
  const expected = receipt.accepted ? { ...receipt, memoryId: `lesson:${event.cycle}` } : receipt;
  assert.deepEqual(event.learningAdmission, expected);
  const row = await db.get('SELECT * FROM ontogenesis_memory WHERE id=?', `lesson:${event.cycle}:check`);
  assert.equal(row.project_id, event.actor);
  assert.deepEqual(JSON.parse(row.content), { update, feedback, receipt });
  if (!receipt.accepted) return;
  const operation = w.operations.find(op => op.name === update.op);
  const actualRule = operation.family === 'number' ? { kind: 'affine', a: operation.a, b: operation.b }
    : { kind: 'text', prefix: operation.prefix, suffix: operation.suffix, reverse: operation.reverse, upper: operation.upper };
  assert.deepEqual(update.rule, actualRule, 'Admitted rule disagrees with independent hidden world');
  const lesson = await db.get('SELECT * FROM ontogenesis_memory WHERE id=?', expected.memoryId);
  assert.equal(lesson.project_id, event.actor);
  assert.deepEqual(runtime.learning.admitted(lesson), update);
  assert.equal(JSON.parse(lesson.provenance_json).responseHash, corpus.hash(committed.response.raw));
}

function verifyEvaluation(input, state) {
  const { event, committed, w } = input;
  const tasks = corpus.tasks(w, { window: event.window, counts: protocol.tasksPerWindow });
  const task = tasks.find(row => row.id === event.task.id);
  assert.deepEqual(event.task, task);
  assert.deepEqual(committed.prompt, prompts.taskPrompt('evaluate', { problem: task, lessons: prompts.lessons(state, event.arm, w) }));
  const checked = checkedOracle(w, task);
  assert.deepEqual(event.oracle, checked);
  assert.deepEqual(event.score, scoring.answer(committed.response, checked));
  const key = `${event.window}:${event.arm}:${event.task.id}`;
  assert(!state.assignments.has(key), 'Duplicate held-out assignment');
  state.assignments.add(key);
}

async function replayEvents(db, input) {
  const { events, w } = input;
  const state = { self: null, lessons: {}, examples: {}, previous: null, cycle: 0, assignments: new Set() };
  let committed = [];
  for (const event of events) {
      if (event.type === 'response-committed') {
        assert(committed.length < 2, 'Response without outcome');
        assert.deepEqual(event.response.requestMessages, inference.messages(event.prompt), 'Exact wire messages disagree with reconstructed context');
        parsedResponse(event.response);
        committed.push(event);
      } else if (['train-result', 'clone-result', 'eval-result'].includes(event.type)) {
        assert.equal(committed.length, event.type === 'train-result' ? 2 : 1, 'Outcome without expected committed responses');
        await verifyOutcome(db, { event, committed: committed.at(-1), identityCommitted: committed[0], w }, state);
        committed = [];
      }
  }
  assert.equal(committed.length, 0);
  return state;
}

async function verifyLineage(directory, w) {
  const events = evidence.journal(directory);
  const db = await runtime.open(path.join(directory, 'runtime.sqlite'));
  try {
    const state = await replayEvents(db, { events, w });
    assert.equal(state.cycle, protocol.cyclesPerLineage);
    const durable = await runtime.state(db, w.actors[0]);
    assert.deepEqual(durable.lessons, state.lessons);
    assert.deepEqual(durable.self, state.self);
    for (const actor of w.actors) assert.equal((await runtime.ledger.verify(db, actor)).valid, true);
    const report = summary(directory);
    assert.deepEqual(report, JSON.parse(fs.readFileSync(path.join(directory, 'summary.json'), 'utf8')));
    return report;
  } finally { await db.close(); }
}

async function verifyOutcome(db, input, state) {
  if (input.event.type === 'train-result') return verifyTraining(db, input, state);
  if (input.event.type === 'eval-result') return verifyEvaluation(input, state);
  assert.deepEqual(input.committed.prompt.selfMemory, state.self);
  assert.equal(input.committed.prompt.birthMandate, state.self ? undefined : input.w.origin);
  assert.equal(input.committed.prompt.runtimeId, input.event.actor);
  assert.equal(input.committed.prompt.target, input.w.actors[0]);
  return checkIdentity(db, { ...input, prompt: input.committed.prompt, response: input.committed.response });
}

async function main(directory, manifestHash) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  assert.equal(corpus.hash(manifest), manifestHash, 'Externally retained manifest hash mismatch');
  assert.deepEqual(manifest.protocol, protocol);
  assert.equal(manifest.protocolHash, corpus.hash(fs.readFileSync(path.join(__dirname, 'protocol.json'), 'utf8')));
  assert.deepEqual(evidence.sourceHashes(), manifest.provenance.sources);
  assert.equal(await evidence.fileHash(protocol.modelBlob), protocol.modelSha256);
  const results = [];
  for (let lineage = 0; lineage < manifest.seeds.length; lineage++) {
    const w = corpus.world(manifest.seeds[lineage]);
    const place = path.join(directory, `lineage-${lineage}`);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(place, 'private-world.json'), 'utf8')), w);
    results.push(await verifyLineage(place, w));
  }
  const report = JSON.parse(fs.readFileSync(path.join(directory, 'summary.json'), 'utf8'));
  assert.deepEqual(report.results, results);
  assert.equal(report.actualCalls, results.reduce((sum, row) => sum + row.calls, 0));
  assert.equal(report.status, results.every(row => row.passed) ? 'bounded_support' : 'hypotheses_not_supported');
  console.log(`VERIFIED ${report.status}: journal, raw LLM outputs, authored lessons, independent oracle, provenance, corpus, budgets and metrics`);
}

if (require.main === module) main(process.argv[2], process.argv[3]).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main, replayEvents };
