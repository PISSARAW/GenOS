'use strict';
const fs = require('node:fs');
const path = require('node:path');
const io = require('./io.cjs');
const worlds = require('./worlds.cjs');
const actions = require('./actions.cjs');
const { gate } = require('./gate.cjs');
const evaluate = require('./evaluate.cjs');
const provider = require('./provider.cjs');
const protocol = require('./protocol.json');
async function step(context, state) {
  const seed = context.run.seed + context.calls * 104729;
  context.calls++;
  const response = await context.call(context.config, state.messages, seed);
  context.usage += response.usage.total;
  io.event(context.directory, { type: 'model', candidate: state.index, ...response });
  state.messages.push({ role: 'assistant', content: JSON.stringify(response.action) });
  let result;
  try { result = await act(context, state, response.action); }
  catch (error) { result = { error: error.message }; }
  state.messages.push({ role: 'user', content: JSON.stringify(result) });
  io.event(context.directory, { type: 'action', candidate: state.index, result });
}
async function act(context, state, action) {
  if (action?.tool !== 'finish') return actions.apply(state.workspace, action, state);
  if (typeof action.success !== 'boolean') throw Error('FINISH_SUCCESS_BOOLEAN_REQUIRED');
  if (!action.success) { state.stopped = true; return { accepted: false, abstained: true }; }
  const submission = path.join(context.directory, `submission-${context.submissions.length}`);
  await worlds.promote(state.workspace, submission);
  const proof = context.run.arm === 'A' ? { passed: true, reason: 'free finish' } : gate(state.workspace, state);
  context.submissions.push({ candidate: state.index, workspace: path.basename(submission), accepted: proof.passed });
  io.event(context.directory, { type: 'submission', candidate: state.index, artifact: io.tree(submission), proof });
  if (proof.passed) { state.accepted = true; state.stopped = true; }
  return proof;
}
async function candidate(context, index) {
  const workspace = path.join(context.directory, `candidate-${index}`);
  const materialization = await worlds.fork(context.base, workspace);
  io.event(context.directory, { type: 'fork', candidate: index, materialization });
  const production = Object.keys(io.tree(workspace)).filter(name => name.endsWith('.cjs') && !name.endsWith('.test.cjs'));
  const state = { workspace, index, production, messages: actions.initial(workspace), tests: [], accepted: false, stopped: false };
  const limit = context.run.arm === 'C' ? protocol.maxCalls / protocol.candidates : protocol.maxCalls;
  for (let call = 0; call < limit && !state.stopped; call++) await step(context, state);
  io.write(path.join(context.directory, `candidate-${index}.json`), { index, accepted: state.accepted, stopped: state.stopped,
    artifact: io.tree(workspace), tests: state.tests });
  return state;
}
async function runOne(directory, run, options) {
  fs.mkdirSync(directory, { recursive: false });
  const fixture = path.join(__dirname, 'fixtures', run.task);
  const baseline = evaluate.hidden(fixture, run);
  const context = { directory, run, config: options.config, call: options.call || provider.call,
    base: await worlds.snapshot(fixture, directory), calls: 0, usage: 0, submissions: [] };
  io.event(directory, { type: 'start', run, baseline, baseRoot: context.base.manifest.hash });
  const states = [];
  const count = run.arm === 'C' ? protocol.candidates : 1;
  try {
    for (let index = 0; index < count; index++) states.push(await candidate(context, index));
  } catch (error) {
    io.event(directory, { type: 'infrastructure-error', error: error.message, calls: context.calls });
    io.write(path.join(directory, 'failure.json'), { run, error: error.message, calls: context.calls, usage: null });
    throw error;
  }
  const selected = states.find(state => state.accepted);
  const final = path.join(directory, 'final');
  if (run.arm === 'C') {
    if (selected) await worlds.promote(selected.workspace, final);
    else await worlds.fork(context.base, final);
  } else await worlds.promote(states[0].workspace, final);
  const result = { run, calls: context.calls, tokens: context.usage, accepted: Boolean(selected),
    selectedCandidate: selected?.index ?? null, baseline, final: evaluate.hidden(final, run),
    submissions: context.submissions.map(submission => ({ ...submission,
      oracle: evaluate.hidden(path.join(directory, submission.workspace), run) })) };
  io.event(directory, { type: 'complete', result });
  result.eventHead = io.verifyEvents(directory);
  io.write(path.join(directory, 'result.json'), result);
  fs.writeFileSync(path.join(directory, 'result.sha256'), io.hash(fs.readFileSync(path.join(directory, 'result.json'))) + '\n');
  return result;
}
module.exports = { runOne };
