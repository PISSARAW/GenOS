'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCHEMA = 'genos.qualification-evidence-bundle/v1';
const TERMINAL_VERDICTS = new Set([
  'qualified', 'failed', 'inconclusive', 'environment_blocked'
]);
const ENVIRONMENT_CODES = new Set(['EACCES', 'ENOENT', 'ENOTCONN', 'EPERM']);

function gitOutput(root, args, exec = execFileSync) {
  return exec('git', ['-C', root, ...args], {
    encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']
  }).trim();
}

function revision(root, dependencies = {}) {
  if (typeof dependencies.gitMetadata === 'function') return dependencies.gitMetadata(root);
  try {
    const status = gitOutput(root, ['status', '--porcelain'], dependencies.execFileSync);
    return { sha: gitOutput(root, ['rev-parse', 'HEAD'], dependencies.execFileSync),
      dirty: Boolean(status), status: status ? status.split(/\r?\n/) : [], observed: true };
  } catch (error) {
    return { sha: null, dirty: null, status: [], observed: false,
      error: error.code || error.message };
  }
}

function optionalJson(value) {
  if (!value) return null;
  try { return JSON.parse(value); }
  catch (_) { return { invalid: true, raw: String(value) }; }
}

function optionalList(value) {
  const parsed = optionalJson(value);
  return Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
}

function experiment(env) {
  return {
    seed: env.GENOS_QUALIFICATION_SEED || null,
    provider: env.GENOS_QUALIFICATION_PROVIDER || env.GENOS_MCP_PROVIDER || null,
    budgets: optionalJson(env.GENOS_QUALIFICATION_BUDGETS_JSON)
  };
}

function actors(env) {
  const producerId = env.GENOS_QUALIFICATION_PRODUCER_ID || null;
  const verifierId = env.GENOS_QUALIFICATION_VERIFIER_ID || null;
  return { producer: { id: producerId }, verifier: { id: verifierId },
    independent: Boolean(producerId && verifierId && producerId !== verifierId) };
}

function outputPath(root, env, timestamp) {
  if (env.GENOS_QUALIFICATION_EVIDENCE_FILE) {
    return path.resolve(env.GENOS_QUALIFICATION_EVIDENCE_FILE);
  }
  const name = `topology-contracts-${timestamp.replace(/[:.]/g, '-')}-${process.pid}.json`;
  return path.join(root, 'artifacts', 'qualification', 'topology-contracts', name);
}

function createBundle(input = {}) {
  const now = input.now || Date.now;
  const timestamp = new Date(now()).toISOString();
  const env = input.env || process.env;
  const root = input.repositoryRoot;
  return {
    schema: SCHEMA, runId: `topology-contracts-${timestamp}-${process.pid}`,
    createdAt: timestamp, completedAt: null,
    revision: revision(root, input.dependencies),
    environment: { platform: process.platform, arch: process.arch,
      nodeVersion: process.version, hostname: os.hostname(), ci: env.CI || null },
    experiment: experiment(env), actors: actors(env),
    selection: input.selection || {}, plannedTests: input.plannedTests || [],
    commands: [], artifacts: optionalList(env.GENOS_QUALIFICATION_ARTIFACTS_JSON),
    failures: [], testsNotRun: [], terminal: false, verdict: null,
    outputFile: input.outputFile || outputPath(root, env, timestamp)
  };
}

function capturedOutput(value) {
  const text = String(value || '');
  const limit = 4096;
  return { bytes: Buffer.byteLength(text),
    sha256: crypto.createHash('sha256').update(text).digest('hex'),
    excerpt: text.length <= limit ? text : `${text.slice(0, limit / 2)}\n...\n${text.slice(-limit / 2)}` };
}

function recordCommand(bundle, record) {
  bundle.commands.push({ testId: record.testId, command: record.command,
    status: record.outcome.status, exitCode: record.outcome.exitCode,
    signal: record.outcome.signal, errorCode: record.outcome.errorCode,
    errorMessage: record.outcome.errorMessage, startedAt: record.outcome.startedAt,
    durationMs: record.outcome.durationMs,
    output: { stdout: capturedOutput(record.outcome.stdout),
      stderr: capturedOutput(record.outcome.stderr) } });
}

function unexecutedTests(bundle) {
  const executed = new Set(bundle.commands.map((item) => item.testId));
  return bundle.plannedTests.filter((item) => !executed.has(item.id))
    .map((item) => ({ ...item, reason: 'not_executed' }));
}

function commandFailure(command) {
  return { testId: command.testId, status: command.status, exitCode: command.exitCode,
    signal: command.signal, errorCode: command.errorCode, errorMessage: command.errorMessage };
}

function environmentBlocked(bundle) {
  return bundle.failures.some((failure) => ENVIRONMENT_CODES.has(failure.errorCode));
}

function terminalVerdict(bundle) {
  if (environmentBlocked(bundle)) return 'environment_blocked';
  if (bundle.commands.some((item) => item.status === 'TIMEOUT')) return 'inconclusive';
  if (bundle.failures.length) return 'failed';
  if (bundle.testsNotRun.length || !bundle.commands.length) return 'inconclusive';
  return 'qualified';
}

function finalizeBundle(bundle, input = {}) {
  bundle.testsNotRun = unexecutedTests(bundle);
  bundle.failures = bundle.commands.filter((item) => item.status !== 'PASS').map(commandFailure);
  if (input.runnerError) bundle.failures.push({ testId: 'runner', status: 'FAIL',
    exitCode: null, signal: null, errorCode: input.runnerError.code || null,
    errorMessage: input.runnerError.message });
  bundle.verdict = terminalVerdict(bundle);
  bundle.terminal = TERMINAL_VERDICTS.has(bundle.verdict);
  bundle.completedAt = new Date((input.now || Date.now)()).toISOString();
  return bundle;
}

function writeBundle(bundle, dependencies = {}) {
  if (!bundle.terminal) throw new Error('Evidence bundle must have a terminal verdict before persistence.');
  const file = bundle.outputFile;
  const directory = path.dirname(file);
  const temporary = `${file}.${process.pid}.tmp`;
  const io = dependencies.fs || fs;
  io.mkdirSync(directory, { recursive: true });
  io.writeFileSync(temporary, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
  io.renameSync(temporary, file);
  return file;
}

module.exports = {
  SCHEMA, TERMINAL_VERDICTS, createBundle, finalizeBundle, recordCommand, writeBundle
};
