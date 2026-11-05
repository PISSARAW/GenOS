'use strict';
const fs = require('node:fs/promises');
const safety = require('./pathSafety');
const values = require('./trinityProvenanceValues');

async function capture(input) {
  if (!input.boundary) return;
  try { await persist(input, await payload(input)); }
  catch (cause) { throw Object.assign(values.failure('CODE_CANDIDATE_CAPTURE_FAILED'), { cause }); }
}
async function payload(input) {
  const contract = input.boundary.contract, files = [];
  for (const relative of [...contract.sourcePaths, contract.generatedTestPath]) {
    const filename = safety.resolveContainedPathNoSymlinkSync(input.workspaceRoot, relative, 'candidate observation');
    const content = await fs.readFile(filename);
    if (content.length > 200000) throw values.failure('CODE_CANDIDATE_CAPTURE_FAILED');
    files.push({ path: relative, hash: values.hashBytes(content), content: content.toString('utf8') });
  }
  const result = { schema: 'genos.code-candidate-observed/v1', promoted: false,
    scope: { missionId: input.mission.missionId, agentId: input.mission.agentId, executionRunId: input.executionRun.id },
    stage: 'post_apply_before_tests', files };
  return { ...result, candidateHash: hash(result) };
}
function hash(observation) {
  const { schema, promoted, scope, stage, files } = observation;
  return values.digest({ schema, promoted, scope, stage, files });
}
async function persist(input, observation) {
  const observer = require('./telemetryObserver');
  const contract = require('./telemetryEventContract');
  const trace = contract.readTraceContext(require('./asyncContext').asyncLocalStorage);
  const event = contract.buildEvent({ eventType: 'CODE_CANDIDATE_OBSERVED', agentId: input.mission.agentId,
    sessionId: input.executionRun.id, detail: 'Applied candidate observed; no admission or promotion.' }, observation, trace);
  await require('./telemetryPersist').persistOne(observer, input.db, event);
  const row = await input.db.get('SELECT payload_json FROM telemetry_events WHERE event_id=?', event.id);
  if (!row || hash(JSON.parse(row.payload_json)) !== observation.candidateHash) {
    throw values.failure('CODE_CANDIDATE_CAPTURE_FAILED');
  }
  observer.pushToBuffer(event);
  observer.appendProcessStream(event);
  observer.broadcastSSE(event);
  require('./telemetryFanout').fanout(observer, require('./webhookService'), event);
}
module.exports = { capture, hash };
