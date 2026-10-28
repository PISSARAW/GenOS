'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const traces = require('../src/run-trace.cjs');

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function testPublicRunTrace() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-trace-'));
  try {
    const output = path.join(directory, 'A.jsonl');
    const input = { action: 'public-fixture', value: 7 };
    const answer = { accepted: true };
    const context = traces.start({ scenario_id: 'E01-001', experiment_id: 'E01',
      condition_id: 'TRACE_TEST', repetition: 1 }, input);
    traces.phase(context, 'reference_execution_completed');
    traces.finish(context, answer);
    const manifest = traces.writeSidecar(output, 'TRACE_TEST');
    const tracePath = path.join(directory, manifest.trace_file);
    const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
    assert.equal(manifest.trace_records, 1);
    assert.equal(manifest.trace_sha256, digest(fs.readFileSync(tracePath)));
    assert.equal(trace.input_sha256, digest(JSON.stringify(input)));
    assert.equal(trace.result_sha256, digest(JSON.stringify({ status: 'completed', answer })));
    assert.deepEqual(trace.events.map((event) => event.name), [
      'run_started', 'reference_execution_completed', 'run_completed']);
    assert.ok(Date.parse(trace.started_at) > 0);
    assert.ok(Date.parse(trace.ended_at) >= Date.parse(trace.started_at));
    assert.ok(trace.duration_ms >= 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function testJsonManifestKeepsDistinctTracePath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-json-trace-'));
  try {
    const output = path.join(directory, 'E09-load.json');
    fs.writeFileSync(output, '{"manifest":true}\n');
    const context = traces.start({ run_id: 'E09-scale-10-r1', scenario_id: 'E09-scale-10',
      experiment_id: 'E09', condition_id: 'E09', repetition: 1,
      workload_sha256: digest('workload') }, { scale: 10 });
    traces.phase(context, 'async_runtime_invocations_completed');
    traces.finish(context, { processed_rate: 1 });
    const manifest = traces.writeSidecar(output, 'E09');
    assert.equal(manifest.trace_file, 'E09-load.traces.jsonl');
    assert.equal(fs.readFileSync(output, 'utf8'), '{"manifest":true}\n');
    const trace = JSON.parse(fs.readFileSync(path.join(directory, manifest.trace_file), 'utf8'));
    assert.equal(trace.workload_sha256, digest('workload'));
    assert.equal(trace.run_id, 'E09-scale-10-r1');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

testPublicRunTrace();
testJsonManifestKeepsDistinctTracePath();
process.stdout.write('OMEGA per-run trace binding and event timing passed.\n');
