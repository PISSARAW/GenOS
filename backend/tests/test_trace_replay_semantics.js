const assert = require('node:assert/strict');
const { buildTraceReplay } = require('../src/controllers/traceController');

const replay = buildTraceReplay('trace-test', [{
  id: 'span-1', trace_id: 'trace-test', name: 'step', start_time: 1, end_time: 2,
  inputs_json: '{}', outputs_json: '{}', error: null
}]);

assert.equal(replay.replayStatus, 'RECONSTRUCTED');
assert.equal(replay.replayMode, 'trace-reconstruction');
assert.equal(replay.replayVerified, false);
assert.equal(replay.qualityGuarantee, false);
assert.equal(replay.requiresReexecution, true);

console.log('Trace replay semantics: PASS');