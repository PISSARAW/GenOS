'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const records = [];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function event(context, name) {
  context.events.push({ name, at: new Date().toISOString(),
    elapsed_ms: Number(process.hrtime.bigint() - context.started) / 1e6 });
}

function start(metadata, input) {
  const context = { ...metadata, started: process.hrtime.bigint(),
    started_at: new Date().toISOString(), input_sha256: sha256(JSON.stringify(input)),
    events: [] };
  event(context, 'run_started');
  return context;
}

function phase(context, name) {
  event(context, name);
}

function finish(context, answer, status = 'completed') {
  event(context, status === 'completed' ? 'run_completed' : 'run_failed');
  const { started, ...metadata } = context;
  records.push({ schema: 'omega-bench-run-trace/v1', ...metadata,
    ended_at: new Date().toISOString(), duration_ms: Number(process.hrtime.bigint() - started) / 1e6,
    status, result_sha256: sha256(JSON.stringify({ status, answer })) });
}

function writeSidecar(outputPath, condition) {
  const selected = records.filter((record) => record.condition_id === condition);
  if (!selected.length) throw new Error(`trace_records_missing:${condition}`);
  const filename = path.join(path.dirname(outputPath),
    `${path.basename(outputPath, path.extname(outputPath))}.traces.jsonl`);
  fs.writeFileSync(filename, `${selected.map((record) => JSON.stringify(record)).join('\n')}\n`);
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (records[index].condition_id === condition) records.splice(index, 1);
  }
  return { trace_file: filename.split(/[\\/]/).pop(), trace_records: selected.length,
    trace_sha256: sha256(fs.readFileSync(filename)) };
}

module.exports = { start, phase, finish, writeSidecar };
