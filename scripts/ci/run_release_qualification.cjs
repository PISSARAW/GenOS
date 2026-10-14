'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { inventory } = require('../../backend/tests/workerQualificationInventory.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const GATES = Object.freeze([
  { id: 'code-quality', command: 'python', args: ['scripts/ci/check_code_quality.py'] },
  { id: 'node', command: 'npm', args: ['test'] },
  { id: 'mcp', command: 'npm', args: ['--prefix', 'mcp', 'test'] },
  { id: 'validation', command: 'npm', args: ['--prefix', 'backend', 'run', 'test:validation'] },
  { id: 'rust', command: 'cargo', args: ['test', '--workspace'] }
]);

function invocation(command, args) {
  if (process.platform !== 'win32') return { command, args };
  return { command: process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/s', '/c', [command, ...args].join(' ')] };
}

function probe(command, args) {
  const call = invocation(command, args);
  const result = spawnSync(call.command, call.args, { cwd: ROOT, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'Git probe failed.');
  return result.stdout.trim();
}

function insideRoot(location) {
  const relative = path.relative(ROOT, location);
  return !path.isAbsolute(relative) && relative !== '..'
    && !relative.startsWith('..' + path.sep);
}

function outputDirectory(input) {
  if (!input || !path.isAbsolute(input)) throw new Error('Provide an absolute output directory.');
  if (insideRoot(path.resolve(input))) {
    throw new Error('The report directory must be outside the repository.');
  }
  fs.mkdirSync(input, { recursive: true });
  const resolved = fs.realpathSync(input);
  if (insideRoot(resolved)) {
    throw new Error('The report directory must be outside the repository.');
  }
  return resolved;
}

function digest(file) {
  return 'sha256:' + createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function dependencies() {
  return ['node_modules', 'backend/node_modules', 'mcp/node_modules'].map((entry) => {
    const location = path.join(ROOT, entry);
    const resolved = fs.existsSync(location) ? fs.realpathSync(location) : null;
    return { path: entry, resolved, isolated: resolved !== null && insideRoot(resolved) };
  });
}

function runGate(gate, output) {
  return new Promise((resolve) => {
    const logPath = path.join(output, gate.id + '.log');
    const log = fs.createWriteStream(logPath, { flags: 'w' });
    const startedAt = new Date().toISOString();
    const call = invocation(gate.command, gate.args);
    const child = spawn(call.command, call.args, { cwd: ROOT, env: process.env });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    let spawnError = null;
    child.on('error', (error) => { spawnError = error.message; });
    child.on('close', (code, signal) => {
      log.end(() => resolve({ id: gate.id, command: [gate.command, ...gate.args],
        startedAt, finishedAt: new Date().toISOString(), exitCode: code,
        signal, spawnError, log: path.basename(logPath), logDigest: digest(logPath) }));
    });
  });
}

function initialReport() {
  const before = git(['status', '--porcelain', '--untracked-files=normal']);
  return {
    schema: 'genos.release-qualification/v1',
    scope: 'Automated gates and worker benchmark inventory; external deployment is not assessed.',
    commit: git(['rev-parse', 'HEAD']),
    cleanBefore: before === '',
    capturedAt: new Date().toISOString(),
    versions: { node: process.version, npm: probe('npm', ['--version']),
      python: probe('python', ['--version']), rust: probe('rustc', ['--version']),
      cargo: probe('cargo', ['--version']), lean: probe('lean', ['--version']) },
    dependencies: dependencies(),
    workerInventory: inventory(),
    gates: []
  };
}

async function executeGates(report, output) {
  if (report.cleanBefore) {
    for (const gate of GATES) {
      process.stdout.write('Running ' + gate.id + '\n');
      const result = await runGate(gate, output);
      report.gates.push(result);
      process.stdout.write(gate.id + ': exit ' + result.exitCode + '\n');
    }
  }
}

function finishReport(report, output) {
  report.cleanAfter = git(['status', '--porcelain', '--untracked-files=normal']) === '';
  report.gatesPassed = report.gates.length === GATES.length
    && report.gates.every((gate) => gate.exitCode === 0);
  report.workerOraclesComplete = report.workerInventory.unmeasuredCases.length === 0
    && report.workerInventory.workers.every((worker) => worker.methodsWithoutBenchmark.length === 0);
  report.status = report.cleanBefore && report.cleanAfter && report.gatesPassed
    && report.workerOraclesComplete && report.dependencies.every((entry) => entry.isolated)
    ? 'automated_scope_qualified' : 'not_qualified';
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write('Qualification: ' + report.status + '\n');
  if (report.status !== 'automated_scope_qualified') process.exitCode = 1;
}

async function main(outputInput) {
  const output = outputDirectory(outputInput);
  const report = initialReport();
  await executeGates(report, output);
  finishReport(report, output);
}

if (require.main === module) {
  main(process.argv[2]).catch((error) => { console.error(error); process.exitCode = 1; });
}

module.exports = { GATES, outputDirectory };
