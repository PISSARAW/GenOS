'use strict';

const { spawnSync } = require('node:child_process');

function positiveMilliseconds(value, fallback, label = 'timeout') {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new RangeError(`${label} must be a positive number of milliseconds`);
  }
  return Math.floor(parsed);
}

function deadlineOutcome(startedAt) {
  return {
    status: 'TIMEOUT', durationMs: 0, exitCode: null, signal: null,
    errorCode: 'SUITE_DEADLINE_EXCEEDED', errorMessage: 'suite deadline exceeded',
    stdout: '', stderr: '', startedAt
  };
}

function classify(result) {
  if (result.error?.code === 'ETIMEDOUT') return 'TIMEOUT';
  if (result.status === 0 && !result.error) return 'PASS';
  return 'FAIL';
}

function spawnResult(spec, spawn, timeout) {
  try {
    return spawn(spec.command, spec.args || [], {
      cwd: spec.cwd, env: spec.env, encoding: 'utf8', windowsHide: true,
      timeout, maxBuffer: spec.maxBuffer || 16 * 1024 * 1024
    });
  } catch (error) {
    return { status: null, signal: null, stdout: '', stderr: '', error };
  }
}

function outcomeFrom(result, timing) {
  const error = result.error || {};
  return {
    status: classify(result), durationMs: timing.durationMs,
    exitCode: result.status, signal: result.signal || null,
    errorCode: error.code || null, errorMessage: error.message || null,
    stdout: result.stdout || '', stderr: result.stderr || '',
    startedAt: timing.startedAt, timeoutMs: timing.timeoutMs
  };
}

function runProcess(spec, dependencies = {}) {
  const now = dependencies.now || Date.now;
  const spawn = dependencies.spawnSync || spawnSync;
  const startedAt = now();
  const remainingMs = Math.floor(spec.deadlineMs - startedAt);
  if (remainingMs <= 0) return deadlineOutcome(startedAt);
  const timeout = Math.max(1, Math.min(spec.timeoutMs, remainingMs));
  const result = spawnResult(spec, spawn, timeout);
  return outcomeFrom(result, {
    durationMs: Math.max(0, now() - startedAt), startedAt, timeoutMs: timeout
  });
}

function field(value) {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}

function formatOutcome(label, outcome) {
  const details = [
    `durationMs=${outcome.durationMs}`, `exit=${field(outcome.exitCode)}`,
    `signal=${field(outcome.signal)}`, `error=${field(outcome.errorCode)}`
  ];
  return `[${outcome.status}] ${label} ${details.join(' ')}`;
}

function writeCapturedOutput(outcome, streams) {
  if (outcome.stdout) streams.stdout.write(outcome.stdout);
  if (outcome.stderr) streams.stderr.write(outcome.stderr);
  if (outcome.errorMessage && outcome.errorCode !== 'ETIMEDOUT') {
    streams.stderr.write(`${outcome.errorMessage}\n`);
  }
}

module.exports = {
  formatOutcome, positiveMilliseconds, runProcess, writeCapturedOutput
};
