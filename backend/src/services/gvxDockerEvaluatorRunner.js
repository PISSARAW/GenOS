'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const AGGREGATE_SCHEMA = 'genos.gvx.evaluator-aggregate/v1';
const RECEIPT_SCHEMA = 'genos.gvx.evaluator-receipt/v1';
const AGGREGATE_FILE = 'aggregate.json';
const MAX_AGGREGATE_BYTES = 4096;
const MAX_DOCKER_OUTPUT_BYTES = 1024 * 1024;

function failure(code) {
  return Object.assign(new Error(code), { code });
}

function validateRequest(request) {
  const image = request?.image;
  const command = request?.command;
  if (!validImage(image)) throw failure('GVX_EVALUATOR_IMAGE_DIGEST_REQUIRED');
  if (!validCommand(command)) throw failure('GVX_EVALUATOR_COMMAND_INVALID');
  if (!/^[a-f0-9]{64}$/.test(request?.suiteHash || '')) throw failure('GVX_EVALUATOR_SUITE_HASH_REQUIRED');
  const limits = request?.limits || {};
  if (!validLimits(limits)) throw failure('GVX_EVALUATOR_RESOURCE_LIMITS_INVALID');
  if (!hasPaths(request)) throw failure('GVX_EVALUATOR_PATH_REQUIRED');
  return { image, command, suiteHash: request.suiteHash, limits,
    candidateDirectory: path.resolve(request.candidateDirectory), outputDirectory: path.resolve(request.outputDirectory),
    dockerPath: request.dockerPath || 'docker' };
}

function validImage(image) {
  return typeof image === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/:+-]*@sha256:[a-f0-9]{64}$/.test(image);
}

function validCommand(command) {
  return Array.isArray(command) && command.length > 0 && command.length <= 32 && command.every(validCommandPart);
}

function validCommandPart(part) {
  return typeof part === 'string' && Boolean(part) && part.length <= 4096 && !part.includes('\0');
}

function validLimits(limits) {
  return integerBetween(limits.timeoutMs, 1000, 3600000) && integerBetween(limits.memoryBytes, 67108864, 17179869184)
    && integerBetween(limits.processCount, 1, 2048) && numberBetween(limits.cpuCount, 0.1, 32);
}

function hasPaths(request) {
  return Boolean(request?.candidateDirectory && request?.outputDirectory);
}

function integerBetween(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function numberBetween(value, minimum, maximum) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function resolveCandidate(candidateDirectory) {
  const candidateInput = await fs.lstat(candidateDirectory).catch(() => { throw failure('GVX_EVALUATOR_CANDIDATE_UNAVAILABLE'); });
  if (candidateInput.isSymbolicLink()) throw failure('GVX_EVALUATOR_CANDIDATE_INVALID');
  const candidate = await fs.realpath(candidateDirectory).catch(() => { throw failure('GVX_EVALUATOR_CANDIDATE_UNAVAILABLE'); });
  const candidateStat = await fs.lstat(candidate);
  if (!candidateStat.isDirectory() || candidateStat.isSymbolicLink()) throw failure('GVX_EVALUATOR_CANDIDATE_INVALID');
  return candidate;
}

async function resolveOutput(outputDirectory) {
  await fs.mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  const outputInput = await fs.lstat(outputDirectory);
  if (outputInput.isSymbolicLink()) throw failure('GVX_EVALUATOR_OUTPUT_DIRECTORY_INVALID');
  const output = await fs.realpath(outputDirectory);
  const outputStat = await fs.lstat(output);
  if (!outputStat.isDirectory() || outputStat.isSymbolicLink()) throw failure('GVX_EVALUATOR_OUTPUT_DIRECTORY_INVALID');
  if ((await fs.readdir(output)).length) throw failure('GVX_EVALUATOR_OUTPUT_DIRECTORY_NOT_EMPTY');
  await fs.chmod(output, 0o700).catch(() => {});
  return output;
}

function assertSeparateDirectories(candidate, output) {
  if (isWithin(candidate, output) || isWithin(output, candidate)) throw failure('GVX_EVALUATOR_OUTPUT_DIRECTORY_INVALID');
}

function assertMountPathsSupported(candidate, output) {
  if ([candidate, output].some((value) => value.includes(',') || value.includes('\n'))) {
    throw failure('GVX_EVALUATOR_PATH_UNSUPPORTED');
  }
}

async function prepareDirectories(config) {
  const candidate = await resolveCandidate(config.candidateDirectory);
  const output = await resolveOutput(config.outputDirectory);
  assertSeparateDirectories(candidate, output);
  assertMountPathsSupported(candidate, output);
  return { candidate, output };
}

async function listFiles(directory, root = directory, entries = []) {
  const names = (await fs.readdir(directory)).sort();
  for (const name of names) {
    const fullPath = path.join(directory, name);
    const info = await fs.lstat(fullPath);
    if (info.isSymbolicLink()) throw failure('GVX_EVALUATOR_CANDIDATE_LINK_FORBIDDEN');
    if (info.isDirectory()) await listFiles(fullPath, root, entries);
    else if (info.isFile()) entries.push({ fullPath, relativePath: path.relative(root, fullPath).split(path.sep).join('/'), size: info.size });
    else throw failure('GVX_EVALUATOR_CANDIDATE_ENTRY_INVALID');
    if (entries.length > 10000) throw failure('GVX_EVALUATOR_CANDIDATE_TOO_LARGE');
  }
  return entries;
}

async function hashCandidate(directory) {
  const files = await listFiles(directory);
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > 1073741824) throw failure('GVX_EVALUATOR_CANDIDATE_TOO_LARGE');
  const digest = createHash('sha256');
  for (const file of files) {
    const content = await fs.readFile(file.fullPath);
    digest.update(file.relativePath).update('\0').update(content).update('\0');
  }
  return digest.digest('hex');
}

function dockerEnvironment(tempRoot) {
  const env = { PATH: process.env.PATH || '', DOCKER_CONFIG: path.join(tempRoot, 'docker-config') };
  if (process.platform === 'win32') {
    env.SystemRoot = process.env.SystemRoot || 'C:\\Windows';
    env.SystemDrive = process.env.SystemDrive || 'C:';
    env.PATHEXT = process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD';
    env.ComSpec = process.env.ComSpec || 'cmd.exe';
    env.USERPROFILE = tempRoot;
  } else {
    env.HOME = tempRoot;
  }
  return env;
}

async function prepareDockerConfig(tempRoot) {
  const configDirectory = path.join(tempRoot, 'docker-config');
  await fs.mkdir(configDirectory, { mode: 0o700 });
  await fs.mkdir(path.join(tempRoot, 'home'), { mode: 0o700 });
  await fs.writeFile(path.join(configDirectory, 'config.json'), '{}\n', { mode: 0o600 });
}

function mountSpec(source, target, readOnly) {
  return `type=bind,source=${source},target=${target}${readOnly ? ',readonly' : ''}`;
}

function dockerArguments(config, directories, name) {
  const { limits } = config;
  return ['run', '--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL',
    '--security-opt=no-new-privileges:true', '--pids-limit', String(limits.processCount),
    '--memory', `${limits.memoryBytes}b`, '--memory-swap', `${limits.memoryBytes}b`, '--cpus', String(limits.cpuCount),
    '--user', '65532:65532', '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=64m', '--workdir', '/candidate',
    '--name', name, '--mount', mountSpec(directories.candidate, '/candidate', true),
    '--mount', mountSpec(directories.output, '/out', false), config.image, ...config.command];
}

function runProcess(options, dependencies = {}) {
  return new Promise((resolve) => {
    let bytes = 0;
    let timedOut = false;
    let overflow = false;
    let finished = false;
    const spawnProcess = dependencies.spawn || spawn;
    const child = spawnProcess(options.program, options.args, { env: options.env, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, options.timeoutMs);
    const countOutput = (chunk) => {
      bytes += chunk.length;
      if (bytes > options.maxOutputBytes && !overflow) { overflow = true; child.kill('SIGKILL'); }
    };
    child.stdout?.on('data', countOutput);
    child.stderr?.on('data', countOutput);
    child.once('error', () => finish(null, true));
    child.once('close', (code) => finish(code, false));
    function finish(code, spawnFailed) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ code, timedOut, overflow, spawnFailed });
    }
  });
}

async function stopContainer(options) {
  const { config, name, env, dependencies } = options;
  const processOptions = { program: config.dockerPath, args: ['kill', name], env, timeoutMs: 5000, maxOutputBytes: 4096 };
  const result = await runProcess(processOptions, dependencies);
  return !result.spawnFailed && !result.timedOut && !result.overflow && result.code === 0;
}

async function readAggregate(directory, expectedSuiteHash) {
  const entries = await fs.readdir(directory);
  if (entries.length !== 1 || entries[0] !== AGGREGATE_FILE) throw failure('GVX_EVALUATOR_OUTPUT_INVALID');
  const file = path.join(directory, AGGREGATE_FILE);
  const info = await fs.lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_AGGREGATE_BYTES) throw failure('GVX_EVALUATOR_OUTPUT_INVALID');
  const aggregate = JSON.parse(await fs.readFile(file, 'utf8'));
  const keys = ['schema', 'suiteHash', 'total', 'passed', 'failed', 'errors'];
  if (Object.keys(aggregate).sort().join('|') !== keys.sort().join('|') || aggregate.schema !== AGGREGATE_SCHEMA
      || aggregate.suiteHash !== expectedSuiteHash || !validCounts(aggregate)) throw failure('GVX_EVALUATOR_AGGREGATE_INVALID');
  return aggregate;
}

function validCounts(aggregate) {
  return integerBetween(aggregate.total, 1, 1000000) && integerBetween(aggregate.passed, 0, aggregate.total)
    && integerBetween(aggregate.failed, 0, aggregate.total) && integerBetween(aggregate.errors, 0, aggregate.total)
    && aggregate.passed + aggregate.failed + aggregate.errors === aggregate.total;
}

function createReceipt(config, candidateHash, aggregate) {
  const content = { schema: RECEIPT_SCHEMA, candidateHash, evaluatorImage: config.image, suiteHash: aggregate.suiteHash,
    total: aggregate.total, passed: aggregate.passed, failed: aggregate.failed, errors: aggregate.errors,
    passRatePercent: Number((aggregate.passed * 100 / aggregate.total).toFixed(4)), completedAt: new Date().toISOString() };
  return { ...content, receiptHash: createHash('sha256').update(JSON.stringify(content)).digest('hex') };
}

async function persistReceipt(outputDirectory, receipt) {
  await fs.writeFile(path.join(outputDirectory, AGGREGATE_FILE), `${JSON.stringify(receipt)}\n`, { encoding: 'utf8', mode: 0o600 });
}

async function clearOutput(directory) {
  const entries = await fs.readdir(directory).catch(() => []);
  await Promise.all(entries.map((name) => fs.rm(path.join(directory, name), { recursive: true, force: true })));
}

async function runAggregateEvaluator(request, dependencies = {}) {
  const config = validateRequest(request);
  const directories = await prepareDirectories(config);
  const initialCandidateHash = await hashCandidate(directories.candidate);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-gvx-docker-'));
  await prepareDockerConfig(tempRoot);
  const name = `genos-gvx-${randomUUID()}`;
  const env = dockerEnvironment(tempRoot);
  const processOptions = { program: config.dockerPath, args: dockerArguments(config, directories, name), env,
    timeoutMs: config.limits.timeoutMs, maxOutputBytes: MAX_DOCKER_OUTPUT_BYTES };
  try {
    const result = await runProcess(processOptions, dependencies);
    if (result.timedOut) {
      const stopped = await stopContainer({ config, name, env, dependencies });
      if (!stopped) throw failure('GVX_EVALUATOR_TIMEOUT_STOP_UNVERIFIED');
      throw failure('GVX_EVALUATOR_TIMEOUT');
    }
    if (result.spawnFailed) throw failure('GVX_DOCKER_UNAVAILABLE');
    if (result.overflow || result.code !== 0) throw failure('GVX_EVALUATOR_DOCKER_FAILED');
    if (await hashCandidate(directories.candidate) !== initialCandidateHash) throw failure('GVX_EVALUATOR_CANDIDATE_CHANGED');
    const aggregate = await readAggregate(directories.output, config.suiteHash);
    const receipt = createReceipt(config, initialCandidateHash, aggregate);
    await persistReceipt(directories.output, receipt);
    return receipt;
  } catch (error) {
    await clearOutput(directories.output);
    throw error?.code ? error : failure('GVX_EVALUATOR_RUN_FAILED');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

module.exports = { AGGREGATE_SCHEMA, RECEIPT_SCHEMA, validateRequest, dockerArguments, runAggregateEvaluator };
