'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const protocol = require('./protocol.json');
const corpus = require('./corpus.cjs');
const evidence = require('./evidence.cjs');
const oracle = require('./oracle.cjs');
const scoring = require('./scoring.cjs');
const runtime = require('./runtime.cjs');
const prompts = require('./prompts.cjs');
const { summary } = require('./run.cjs');

function parsedResponse(response) {
  if (response.error) return;
  let value = null;
  try { value = JSON.parse(response.raw); } catch (_) { /* Malformed output is not repaired. */ }
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
  return { op: state.previous, examples: examples.map(row => ({ input: row.input, output: row.output })),
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
}

function learnReplay(state, input) {
  const { prompt, response, task, checked, identityPrompt, identityResponse } = input;
  const value = response.value;
  assert.deepEqual(prompt.feedback, feedback(state));
  assert.deepEqual(prompt.lessons, state.lessons);
  assert.deepEqual(identityPrompt.selfMemory, state.self);
  if (typeof identityResponse.value?.origin === 'string') state.self = { origin: identityResponse.value.origin };
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
  assert.equal(identityCommitted.prompt.birthMandate, event.cycle === 0 ? w.origin : undefined);
  await checkIdentity(db, { ...input, prompt: identityCommitted.prompt, response: identityCommitted.response });
  learnReplay(state, { prompt: committed.prompt, response: committed.response, task, checked,
    identityPrompt: identityCommitted.prompt, identityResponse: identityCommitted.response });
}

function verifyEvaluation(input, state) {
  const { event, committed, w } = input;
  const tasks = corpus.tasks(w, { window: event.window, counts: protocol.tasksPerWindow });
  const task = tasks.find(row => row.id === event.task.id);
  assert.deepEqual(event.task, task);
  assert.deepEqual(committed.prompt, { mode: 'evaluate', problem: task, lessons: prompts.lessons(state, event.arm, w) });
  const checked = checkedOracle(w, task);
  assert.deepEqual(event.oracle, checked);
  assert.deepEqual(event.score, scoring.answer(committed.response, checked));
  const key = `${event.window}:${event.arm}:${event.task.id}`;
  assert(!state.assignments.has(key), 'Duplicate held-out assignment');
  state.assignments.add(key);
}

async function verifyLineage(directory, w) {
  const events = evidence.journal(directory);
  const state = { self: null, lessons: {}, examples: {}, previous: null, cycle: 0, assignments: new Set() };
  const db = await runtime.open(path.join(directory, 'runtime.sqlite'));
  let committed = [];
  try {
    for (const event of events) {
      if (event.type === 'response-committed') {
        assert(committed.length < 2, 'Response without outcome');
        parsedResponse(event.response);
        committed.push(event);
      } else if (['train-result', 'clone-result', 'eval-result'].includes(event.type)) {
        assert.equal(committed.length, event.type === 'train-result' ? 2 : 1, 'Outcome without expected committed responses');
        await verifyOutcome(db, { event, committed: committed.at(-1), identityCommitted: committed[0], w }, state);
        committed = [];
      }
    }
    assert.equal(committed.length, 0);
    assert.equal(state.cycle, protocol.cyclesPerLineage);
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
  assert.equal(input.committed.prompt.runtimeId, input.event.actor);
  assert.equal(input.committed.prompt.target, input.w.actors[0]);
  return checkIdentity(db, { ...input, prompt: input.committed.prompt, response: input.committed.response });
}

async function main(directory, manifestHash) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  assert.equal(corpus.hash(manifest), manifestHash, 'Externally retained manifest hash mismatch');
  assert.deepEqual(manifest.protocol, protocol);
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
module.exports = { main };
