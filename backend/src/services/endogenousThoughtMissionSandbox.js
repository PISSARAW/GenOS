'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { fail, digest, bytesDigest } = require('./endogenousThoughtMissionContract');

function timeoutFor(deadline) {
  const remaining = Math.min(5000, deadline - Date.now());
  if (!Number.isFinite(remaining) || remaining <= 0) throw fail('ETT_MISSION_TIME_EXCEEDED');
  return remaining;
}
function invoke(program, input, deadline = Date.now() + 5000) {
  const file = path.join(__dirname, program);
  const programDigest = bytesDigest(fs.readFileSync(file));
  const startedAt = Date.now();
  const child = spawnSync(process.execPath, ['--permission', `--allow-fs-read=${__dirname}`,
    '--disable-proto=throw', '--max-old-space-size=64', file], {
    input: JSON.stringify(input), encoding: 'utf8', timeout: timeoutFor(deadline), maxBuffer: 1024 * 1024,
    windowsHide: true, shell: false,
    env: { SystemRoot: process.env.SystemRoot || 'C:\\Windows', NODE_NO_WARNINGS: '1' }
  });
  if (child.status !== 0) throw fail('ETT_MISSION_PROCESS_FAILED', String(child.error?.message || child.stderr).slice(0, 500));
  const result = JSON.parse(child.stdout);
  if (!Number.isSafeInteger(result.processId) || result.processId === process.pid) throw fail('ETT_MISSION_PROCESS_NOT_ISOLATED');
  if (programDigest !== bytesDigest(fs.readFileSync(file))) throw fail('ETT_MISSION_IMPLEMENTATION_CHANGED');
  return { ...result, durationMs: Date.now() - startedAt, programDigest,
    startedAt: new Date(startedAt).toISOString(), completedAt: new Date().toISOString() };
}

function measure(snapshot, deadline) { return invoke('endogenousThoughtMissionWorker.cjs', snapshot, deadline); }
function verify(snapshot, measurement, deadline) {
  const result = invoke('endogenousThoughtMissionOracle.cjs', { ...snapshot, measurement }, deadline);
  if (result.processId === measurement.processId || result.artifactDigest !== snapshot.sha256) throw fail('ETT_MISSION_ORACLE_IDENTITY');
  return result;
}

function create(snapshot, deadline) {
  const completed = new Map();
  const worker = Object.freeze({ kind: 'genos-ett-fixed-artifact-inspection/v1' });
  const sandbox = { kind: 'isolated-read-only', readOnly: true, networkAllowed: false,
    mutationAllowed: false, externalActionAllowed: false,
    execute: async request => {
      if (request.worker !== worker) throw fail('ETT_MISSION_WORKER_INVALID');
      const measurement = measure(snapshot, deadline);
      if (measurement.artifactDigest !== snapshot.sha256) throw fail('ETT_MISSION_ARTIFACT_CHANGED');
      if (Object.values(measurement.capabilities).some(value => value !== 'undefined')) throw fail('ETT_MISSION_SANDBOX_CAPABILITY');
      const evidenceRef = `ett-inspection:${digest(measurement)}`;
      const result = { evidenceRefs: [evidenceRef] };
      completed.set(request.executionId, { result, measurement, evidenceRef });
      return result;
    },
    recover: async request => completed.has(request.executionId)
      ? { status: 'completed', result: completed.get(request.executionId).result } : { status: 'unknown' }
  };
  const usageMeter = { snapshot: async request => {
    const result = completed.get(request.executionId);
    if (!result) throw fail('ETT_MISSION_MEASUREMENT_REQUIRED');
    return { tokens: 0, usd: 0, seconds: Math.ceil(result.measurement.durationMs / 1000) };
  } };
  function recordFor(runReceipt) {
    return [...completed.values()].find(record => runReceipt.payload.evidenceRefs.includes(record.evidenceRef));
  }
  return { worker, sandbox, usageMeter, recordFor };
}

module.exports = { create, measure, verify };
