'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');
const { normalizeSandboxCommand } = require('./sandboxCommandPolicy');
const { terminateChild } = require('./processTermination');

const COMMAND = 'node .genos/boundary-check.cjs';
const MEMORY_MB = 64;
const STACK_KB = 512;
const TIMEOUT_MS = 30000;

function timeoutMs(environment = process.env) {
  if (environment.GENOS_TEST_MODE !== '1') return TIMEOUT_MS;
  const requested = Number(environment.GENOS_BOUNDARY_TEST_TIMEOUT_MS);
  return Number.isSafeInteger(requested) && requested >= 50
    ? Math.min(requested, TIMEOUT_MS) : TIMEOUT_MS;
}

function permissionFlag() {
  if (process.allowedNodeEnvironmentFlags.has('--permission')) return '--permission';
  if (process.allowedNodeEnvironmentFlags.has('--experimental-permission')) return '--experimental-permission';
  throw Object.assign(new Error('This Node.js runtime cannot enforce boundary runner permissions.'), {
    code: 'Q7_BOUNDARY_ISOLATION_UNAVAILABLE'
  });
}

function applies(command) {
  return normalizeSandboxCommand(command) === COMMAND;
}

function plan(command, root) {
  if (!applies(command)) return null;
  const workspace = path.resolve(root);
  const entry = path.join(workspace, '.genos', 'boundary-check.cjs');
  const permission = permissionFlag();
  const timeout = timeoutMs();
  return {
    program: process.execPath,
    args: [permission, `--allow-fs-read=${workspace}`, '--disable-proto=throw',
      `--max-old-space-size=${MEMORY_MB}`, `--stack-size=${STACK_KB}`, entry],
    shell: false,
    timeoutMs: timeout,
    environment: { GENOS_BOUNDARY_ISOLATED: '1', GENOS_BOUNDARY_HOST_PID: String(process.pid),
      GENOS_BOUNDARY_MEMORY_MB: String(MEMORY_MB), GENOS_BOUNDARY_STACK_KB: String(STACK_KB) },
    isolation: { kind: 'node-process-permission-boundary', filesystem: 'workspace-read-only',
      childProcesses: 'denied', workerThreads: 'denied', memoryMb: MEMORY_MB,
      stackKb: STACK_KB, timeoutMs: timeout }
  };
}

function run(command, root, tempRoot) {
  const launch = plan(command, root);
  if (!launch) return null;
  const environment = { ...require('./localCodeTestEnvironment').build(tempRoot), ...launch.environment };
  return new Promise(resolve => {
    const child = spawn(launch.program, launch.args, { cwd: root, shell: false,
      detached: process.platform !== 'win32', env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = ''; let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; terminateChild(child); }, launch.timeoutMs);
    child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(0, 20000); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(0, 20000); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ command, exitCode: timedOut || code === null ? -1 : code, signal,
        stdout, stderr, timedOut, isolation: launch.isolation });
    });
    child.on('error', error => {
      clearTimeout(timer);
      resolve({ command, exitCode: -1, stderr: error.message, timedOut: false,
        isolation: launch.isolation });
    });
  });
}

module.exports = { COMMAND, MEMORY_MB, STACK_KB, TIMEOUT_MS, applies, plan, run, timeoutMs };
