'use strict';
const crypto = require('node:crypto');
const trace = require('./trinityTraceEvents');
const values = require('./trinityProvenanceValues');

function correlation(context) {
  return values.correlation(context.correlation || { missionId: context.missionId,
    experimentId: context.missionId, runId: 'journal:' + context.missionId });
}

async function execute(context, stage, run) {
  const metadata = { correlation: correlation(context), stage, stageId: stage + ':' + crypto.randomUUID() };
  const inputHash = digest(context.configuration);
  await trace.append(context.db, { ...metadata, status: 'started', details: { inputHash } });
  let result;
  try { result = await run(metadata); }
  catch (error) {
    await trace.append(context.db, { ...metadata, status: 'failed', details: { inputHash, errorCode: errorCode(error) } });
    throw error;
  }
  await trace.append(context.db, { ...metadata, status: 'completed', details: { inputHash, resultDigest: digest(result) } });
  return result;
}

async function replay(context, stage, record) {
  const expected = correlation(context);
  if (!record.trace) {
    return trace.observe(context.db, { correlation: expected, stage,
      details: { qualification: 'legacy-cache-observation', resultDigest: digest(record.value) } });
  }
  if (values.digest(record.trace) !== record.traceDigest || record.trace.stage !== stage
    || values.encode(record.trace.correlation) !== values.encode(expected)) throw failure('TRINITY_JOURNAL_CORRUPT');
  const events = await trace.read(context.db, { missionId: context.missionId });
  const completed = events.find(event => event.stageId === record.trace.stageId && event.status === 'completed');
  if (!completed) return observeInterruptedCommit(context.db, record);
  verifyCompleted(completed, { stage, expected, record, configuration: context.configuration });
  return trace.append(context.db, { ...record.trace, status: 'replayed', details: { replayedEventId: completed.eventId } });
}

function verifyCompleted(completed, input) {
  if (completed.stage !== input.stage || values.encode(completed.correlation) !== values.encode(input.expected)) throw failure('TRINITY_JOURNAL_CORRUPT');
  if (completed.details.resultDigest !== digest(input.record.value)
    || completed.details.inputHash !== digest(input.configuration)) throw failure('TRINITY_JOURNAL_CORRUPT');
}

function observeInterruptedCommit(db, record) {
  return trace.observe(db, { ...record.trace, details: {
    qualification: 'cache-present-terminal-trace-missing', resultDigest: digest(record.value) } });
}

function digest(value) { return values.digest(JSON.parse(JSON.stringify(value))); }

function errorCode(error) { return /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code) ? error.code : 'TRINITY_STAGE_EXECUTION_FAILED'; }
function failure(code) { return Object.assign(new Error(code), { code }); }
module.exports = { execute, replay };
