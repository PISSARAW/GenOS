import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {openProxy} from './proxy.mjs';
import protocol from './protocol.json' with {type: 'json'};

const require = createRequire(import.meta.url);
const api = require('./react-api.cjs');
const actions = require('../deceptive-patch-bench/actions.cjs');
const {gate} = require('./component-gate.cjs');
const io = require('../deceptive-patch-bench/io.cjs');

function apply(context, action) {
  if (action?.tool === 'finish') return finish(context, action);
  if (action?.tool === 'write' && Object.keys(action.files || {}).some(name => !context.production.includes(name))) {
    throw Error('PROTECTED_FILE_WRITE_FORBIDDEN');
  }
  return actions.apply(context.workspace, action, context);
}
function finish(context, action) {
  if (typeof action.success !== 'boolean') throw Error('FINISH_BOOLEAN_REQUIRED');
  if (!action.success) {context.stopped = true; return {accepted: false, abstained: true};}
  const directory = context.directory + '/submission-' + context.submissions.length;
  fs.cpSync(context.workspace, directory, {recursive: true});
  const proof = context.arm === 'A' ? {passed: true, reason: 'free declaration'} : gate(context.workspace, context);
  context.submissions.push({directory: path.basename(directory), accepted: proof.passed});
  if (proof.passed) {context.accepted = true; context.stopped = true;}
  return proof;
}
async function step(context, proxy) {
  const response = await fetch(proxy.endpoint + '/api/chat', {method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({model: protocol.model, messages: context.messages, format: api.schema(context.workspace), stream: false,
      options: {temperature: protocol.temperature, num_predict: protocol.maxOutputTokens}})});
  if (!response.ok) {context.stopped = true; return;}
  const reply = await response.json(), text = reply.message?.content || '';
  if (reply.done !== true || reply.done_reason !== 'stop') {
    context.stopped = true;
    io.event(context.directory, {type: 'generation-incomplete', reason: reply.done_reason || null}); return;
  }
  context.messages.push({role: 'assistant', content: text});
  let feedback;
  try {feedback = apply(context, JSON.parse(text));} catch (error) {feedback = {error: String(error)};}
  context.messages.push({role: 'user', content: JSON.stringify(feedback)});
  io.event(context.directory, {type: 'action', text, feedback, artifact: io.tree(context.workspace)});
}
export async function react(input) {
  const directory = path.resolve(input.directory), workspace = directory + '/workspace';
  fs.mkdirSync(directory, {recursive: false}); fs.cpSync(input.fixture, workspace, {recursive: true});
  const context = {...input, directory, workspace, tests: [], submissions: [], accepted: false, stopped: false,
    production: Object.keys(io.tree(workspace)).filter(name => name.endsWith('.cjs') && !name.endsWith('.test.cjs'))};
  context.messages = api.initial(workspace, input.prompt);
  const proxy = await openProxy({...input, directory}), startedAt = new Date().toISOString();
  try {
    while (proxy.state.calls < protocol.maxCalls && !proxy.state.unknown && !context.stopped) await step(context, proxy);
    fs.cpSync(workspace, directory + '/final', {recursive: true});
    const result = {accepted: context.accepted, stopped: context.stopped, submissions: context.submissions,
      artifact: io.tree(workspace), eventHead: fs.existsSync(directory + '/events.jsonl') ? io.verifyEvents(directory) : null};
    fs.writeFileSync(directory + '/react-result.json', JSON.stringify(result, null, 2));
    return {directory, result};
  } finally {
    await proxy.close();
    fs.writeFileSync(directory + '/provider-summary.json', JSON.stringify({startedAt,
      finishedAt: new Date().toISOString(), ...proxy.state}, null, 2));
  }
}
