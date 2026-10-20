#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA = 'genos.ci-command-diagnostic/v1';

function parseArguments(argv) {
  const separator = argv.indexOf('--');
  const outputIndex = argv.indexOf('--output');
  const nameIndex = argv.indexOf('--name');
  if (separator < 0 || outputIndex < 0 || nameIndex < 0) return null;
  const output = argv[outputIndex + 1];
  const name = argv[nameIndex + 1];
  const command = argv[separator + 1];
  if (!output || !name || !command) return null;
  return { output, name, command, commandArguments: argv.slice(separator + 2) };
}

function digest(file) {
  if (!fs.existsSync(file)) return null;
  const hash = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  return `sha256:${hash}`;
}

function lockfileDigests(root) {
  const lockfiles = ['package-lock.json', 'backend/package-lock.json', 'mcp/package-lock.json'];
  return Object.fromEntries(lockfiles.map((file) => [file, digest(path.join(root, file))]));
}

function environment(root) {
  return {
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.version,
    runnerOS: process.env.RUNNER_OS || null,
    runnerArchitecture: process.env.RUNNER_ARCH || null,
    requestedOS: process.env.GENOS_CI_OS || null,
    requestedNode: process.env.GENOS_CI_NODE || null,
    gitSha: process.env.GITHUB_SHA || null,
    gitRef: process.env.GITHUB_REF || null,
    workflow: process.env.GITHUB_WORKFLOW || null,
    runId: process.env.GITHUB_RUN_ID || null,
    lockfiles: lockfileDigests(root)
  };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function createReport(options) {
  const root = process.cwd();
  return {
    schema: SCHEMA,
    name: options.name,
    command: [options.command, ...options.commandArguments],
    workingDirectory: root,
    environment: environment(root),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    outcome: 'running',
    exitCode: null,
    signal: null,
    spawnError: null
  };
}

function executable(options) {
  if (process.platform !== 'win32' || options.command.toLowerCase() !== 'npm') return options;
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (!fs.existsSync(npmCli)) return options;
  return { ...options, command: process.execPath, commandArguments: [npmCli, ...options.commandArguments] };
}

function appendLog(file, chunk, stream) {
  fs.appendFileSync(file, chunk);
  stream.write(chunk);
}

function finishReport(report, result) {
  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.parse(report.finishedAt) - Date.parse(report.startedAt);
  report.exitCode = result.exitCode;
  report.signal = result.signal;
  report.spawnError = result.spawnError;
  report.outcome = result.spawnError ? 'spawn_error' : result.exitCode === 0 ? 'passed' : 'failed';
}

function run(options) {
  const report = createReport(options);
  const execution = executable(options);
  const output = path.resolve(options.output);
  const stdoutFile = output.replace(/\.json$/i, '.stdout.log');
  const stderrFile = output.replace(/\.json$/i, '.stderr.log');
  writeJson(output, report);
  fs.writeFileSync(stdoutFile, '');
  fs.writeFileSync(stderrFile, '');

  const child = spawn(execution.command, execution.commandArguments, {
    cwd: process.cwd(),
    env: process.env,
    windowsHide: true,
    shell: false
  });
  child.stdout.on('data', (chunk) => appendLog(stdoutFile, chunk, process.stdout));
  child.stderr.on('data', (chunk) => appendLog(stderrFile, chunk, process.stderr));
  child.on('error', (error) => {
    finishReport(report, { exitCode: null, signal: null, spawnError: error.message });
    writeJson(output, report);
    process.exitCode = 1;
  });
  child.on('close', (exitCode, signal) => {
    if (report.outcome !== 'running') return;
    finishReport(report, { exitCode, signal, spawnError: null });
    writeJson(output, report);
    process.exitCode = Number.isInteger(exitCode) ? exitCode : 1;
  });
}

const options = parseArguments(process.argv.slice(2));
if (!options) {
  process.stderr.write('Usage: run_with_diagnostics.cjs --output <report.json> --name <name> -- <command> [args...]\n');
  process.exitCode = 2;
} else {
  run(options);
}
