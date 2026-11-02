'use strict';
process.env.NODE_ENV = 'test';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const protocol = require('./protocol.json');
const corpus = require('./corpus.cjs');
const runtime = require('./runtime.cjs');
const prompts = require('./prompts.cjs');
const inference = require('./inference.cjs');
const scoring = require('./scoring.cjs');

function oracle(input, task) {
  const child = spawnSync(process.execPath, [path.join(__dirname, 'oracle.cjs')], {
    input: JSON.stringify({ worldPath: input.worldPath, task }), encoding: 'utf8', timeout: 5000, windowsHide: true });
  if (child.error || child.status !== 0) throw Error('ORACLE_FAILED:' + child.stderr);
  return JSON.parse(child.stdout);
}

async function request(input, prompt) {
  if (Date.now() > input.deadline || input.calls >= input.callLimit) throw Error('CAMPAIGN_BUDGET_EXHAUSTED');
  input.calls++;
  const result = await inference.attempt(prompt);
  input.transportFailures = result.error ? input.transportFailures + 1 : 0;
  inference.log(input.directory, { type: 'response-committed', prompt, response: result });
  if (input.transportFailures >= 3) throw Error('THREE_CONSECUTIVE_TRANSPORT_FAILURES');
  return result;
}

function feedbackFor(continuation) {
  if (!continuation.previous) return null;
  const key = continuation.previous;
  const examples = continuation.examples[key];
  return { op: key, examples: examples.map(row => ({ input: row.input, output: row.output })),
    family: continuation.previousFamily, taskIds: examples.map(row => row.taskId) };
}

async function trainingTurn(db, input, context) {
  const cycle = context.cycle;
  const actor = input.w.actors[0];
  const transformation = await runtime.transform(db, { agentId: actor, cycle });
  const target = input.w.actors[cycle % input.w.actors.length];
  const identity = await prompts.identityContext(db, { w: input.w, actor, target, cycle });
  const state = await runtime.state(db, actor);
  const task = corpus.training(input.w, cycle);
  const feedback = feedbackFor(context.continuation);
  const operationId = `train:${cycle}`;
  await runtime.decisions.begin(db, { session: context.session, operationId: `worker:${operationId}`,
    domain: task.family, dimensions: ['continuity', 'origin', 'experience'] });
  const identityPrompt = { mode: 'identity', ...identity.prompt,
    posture: ['Check causal evidence.', 'Challenge unsupported claims.', 'Plan before answering.', 'Explain through reusable rules.'][cycle % 4] };
  const identityResult = await runtime.execute(db, { session: context.session, domain: 'identity' }, () => request(input, identityPrompt));
  const learningPrompt = { mode: 'learn', problem: task, feedback, lessons: state.lessons };
  const result = await runtime.execute(db, { session: context.session, domain: task.family }, () => request(input, learningPrompt));
  const checked = oracle(input, task);
  const score = scoring.answer(result, checked);
  await runtime.decisions.finish(db, { session: context.session, operationId: `worker:${operationId}`,
    success: score.exact, attribution: 'self', evidenceRef: { taskId: task.id, oracle: checked,
      identityResponseHash: corpus.hash(identityResult.raw || identityResult.error), responseHash: corpus.hash(result.raw || result.error) } });
  await runtime.ownEpisode(db, { id: `episode:${cycle}`, actor, operationId });
  await prompts.saveResponse(db, { actor, cycle, result, identityResult, feedback, responseHash: corpus.hash(result.raw || result.error) });
  inference.log(input.directory, { type: 'train-result', cycle, actor, task, oracle: checked,
    score, identity: scoring.identity(input.w, identity, identityResult), transformation });
  const op = task.expression.op;
  const examples = context.continuation.examples[op] || [];
  context.continuation.examples[op] = [...examples, { input: task.expression.input, output: checked.expected, taskId: task.id }].slice(-3);
  context.continuation.previous = op;
  context.continuation.previousFamily = task.family;
}

async function cloneTurn(db, input, context) {
  const actor = input.w.actors[1 + Math.floor(context.cycle / protocol.descendantProbeEvery) % 5];
  const root = input.w.actors[0];
  const rootState = await runtime.state(db, root);
  const original = await runtime.latestEpisode(db, { actor: root, inherited: false });
  const token = `clone:${context.cycle}`;
  await runtime.inherit(db, { id: `inherited:${token}`, actor, sourceId: original.id });
  await runtime.save(db, { id: `self:${token}`, agentId: actor, kind: 'preference', value: rootState.self,
    provenance: { ordinal: context.cycle, status: 'inherited_mandate', source: root } });
  const session = await runtime.activate(db, actor);
  try {
    const identity = await prompts.identityContext(db, { w: input.w, actor, target: root,
      cycle: context.cycle + 1, targetSession: context.session });
    await runtime.decisions.begin(db, { session, operationId: `worker:${token}`, domain: 'identity', dimensions: ['origin'] });
    const result = await runtime.execute(db, { session, domain: 'identity' }, () => request(input,
      { mode: 'identity-probe', ...identity.prompt, feedback: null, problem: null, lessons: {} }));
    const identityScore = scoring.identity(input.w, identity, result);
    await runtime.decisions.finish(db, { session, operationId: `worker:${token}`,
      success: Object.values(identityScore).every(Boolean), attribution: 'self', evidenceRef: { responseHash: corpus.hash(result.raw || result.error) } });
    const own = await runtime.ownEpisode(db, { id: `episode:${token}`, actor, operationId: token });
    await runtime.inherit(db, { id: `root-inherits:${token}`, actor: root, sourceId: own.id });
    inference.log(input.directory, { type: 'clone-result', cycle: context.cycle, actor, identity: identityScore });
  } finally { await runtime.incarnations.release(db, session); }
}

async function train(db, input, session) {
  const continuationPath = path.join(input.directory, 'continuation.json');
  const continuation = fs.existsSync(continuationPath) ? JSON.parse(fs.readFileSync(continuationPath, 'utf8')) : { previous: null, examples: {} };
  for (let offset = 0; offset < protocol.chunkSize; offset++) {
    const cycle = input.chunk * protocol.chunkSize + offset;
    await trainingTurn(db, input, { cycle, session, continuation });
    if ((cycle + 1) % protocol.descendantProbeEvery === 0) await cloneTurn(db, input, { cycle, session });
    if ((cycle + 1) % 5 === 0) console.log(`lineage=${input.lineage} cycle=${cycle + 1}/${protocol.cyclesPerLineage}`);
  }
  fs.writeFileSync(continuationPath, JSON.stringify(continuation));
}

async function evaluate(db, input, session) {
  const actor = input.w.actors[0];
  const before = await runtime.state(db, actor);
  const tasks = corpus.tasks(input.w, { window: input.window, counts: protocol.tasksPerWindow });
  for (const task of tasks) {
    const order = [...protocol.arms].sort((a, b) => corpus.hash(task.id + a).localeCompare(corpus.hash(task.id + b)));
    for (const arm of order) {
      const prompt = { mode: 'evaluate', problem: task, lessons: prompts.lessons(before, arm, input.w) };
      const result = await runtime.execute(db, { session, domain: task.family }, () => request(input, prompt));
      const checked = oracle(input, task);
      inference.log(input.directory, { type: 'eval-result', window: input.window, arm, task,
        oracle: checked, score: scoring.answer(result, checked) });
    }
    if (tasks.indexOf(task) % 5 === 0) console.log(`lineage=${input.lineage} evaluation=${input.window} tasks=${tasks.indexOf(task) + 1}/${tasks.length}`);
  }
  const after = await runtime.state(db, actor);
  if (before.hash !== after.hash) throw Error('HELDOUT_MEMORY_MUTATED');
  inference.log(input.directory, { type: 'retention-check', window: input.window, memoryHash: after.hash, feedbackWrites: 0 });
}

async function main(input) {
  input.calls = 0;
  input.transportFailures = 0;
  input.w = JSON.parse(fs.readFileSync(input.worldPath, 'utf8'));
  const db = await runtime.open(path.join(input.directory, 'runtime.sqlite'));
  let session;
  try {
    if (input.initialize) await runtime.initialize(db, input.w);
    session = await runtime.activate(db, input.w.actors[0]);
    if (input.mode === 'train') await train(db, input, session);
    else await evaluate(db, input, session);
    for (const actor of input.w.actors) {
      if (!(await runtime.ledger.verify(db, actor)).valid) throw Error('CAUSAL_IDENTITY_CHAIN_BROKEN');
    }
    inference.log(input.directory, { type: 'process-completed', pid: process.pid, mode: input.mode,
      chunk: input.chunk, window: input.window, calls: input.calls, incarnation: session.incarnationId });
    fs.writeFileSync(input.reportPath, JSON.stringify({ status: 'completed', calls: input.calls, pid: process.pid }));
  } finally {
    if (session) await runtime.incarnations.release(db, session);
    await db.close();
  }
}

if (require.main === module) main(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')))
  .catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main, feedbackFor };
