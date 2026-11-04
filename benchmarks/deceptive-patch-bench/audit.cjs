'use strict';
const fs = require('node:fs');
const path = require('node:path');
const io = require('./io.cjs');
const { nativeUsage } = require('./provider.cjs');
const protocol = require('./protocol.json');
function modelCalls(calls, execution, run) {
  calls.forEach((event, index) => {
    const { request, raw } = event;
    if (raw.model !== execution.config.model || request.model !== execution.config.model) throw Error('MODEL_RESPONSE_MISMATCH');
    const usage = nativeUsage(execution.config, raw);
    if (JSON.stringify(usage) !== JSON.stringify(event.usage)) throw Error('NATIVE_USAGE_MISMATCH');
    const options = request.options || request;
    if (options.seed !== run.seed + index * 104729 || options.temperature !== protocol.temperature) throw Error('SAMPLING_CHANGED');
    const limit = options.num_predict ?? options.max_tokens;
    if (limit !== protocol.maxOutputTokens || usage.output > limit) throw Error('OUTPUT_BUDGET_CHANGED');
  });
}
function journal(folder, result, execution) {
  if (io.verifyEvents(folder) !== result.eventHead) throw Error('RESULT_EVENT_HEAD_CHANGED');
  const lines = fs.readFileSync(path.join(folder, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const complete = lines.at(-1);
  const { eventHead, ...payload } = result;
  if (complete.type !== 'complete' || JSON.stringify(complete.result) !== JSON.stringify(payload)) throw Error('RESULT_EVENT_MISMATCH');
  const calls = lines.filter(event => event.type === 'model');
  if (calls.length > protocol.maxCalls || calls.length !== result.calls) throw Error('CALL_BUDGET_INVALID');
  if (calls.reduce((sum, event) => sum + event.usage.total, 0) !== result.tokens) throw Error('TOKEN_TOTAL_INVALID');
  modelCalls(calls, execution, result.run);
  selection(folder, result, lines);
}
function selection(folder, result, lines) {
  const submissions = lines.filter(event => event.type === 'submission');
  if (submissions.length !== result.submissions.length) throw Error('SUBMISSION_COUNT_CHANGED');
  result.submissions.forEach((submission, index) => {
    if (!/^submission-\d+$/.test(submission.workspace)) throw Error('SUBMISSION_PATH_INVALID');
    const artifact = io.tree(path.join(folder, submission.workspace));
    if (JSON.stringify(artifact) !== JSON.stringify(submissions[index].artifact)) throw Error('SUBMISSION_ARTIFACT_CHANGED');
    if (submission.accepted !== submissions[index].proof.passed) throw Error('GATE_RESULT_CHANGED');
  });
  const accepted = result.submissions.find(submission => submission.accepted);
  if (result.accepted !== Boolean(accepted)) throw Error('ACCEPTANCE_CHANGED');
  if (result.selectedCandidate !== (accepted?.candidate ?? null)) throw Error('SELECTION_CHANGED');
  delivered(folder, result, accepted);
}
function delivered(folder, result, accepted) {
  const fallback = result.run.arm === 'C' ? path.join(__dirname, 'fixtures', result.run.task) : path.join(folder, 'candidate-0');
  const source = accepted ? path.join(folder, accepted.workspace) : fallback;
  if (JSON.stringify(io.tree(source)) !== JSON.stringify(io.tree(path.join(folder, 'final')))) throw Error('DELIVERED_ARTIFACT_CHANGED');
}
module.exports = { journal, modelCalls };
