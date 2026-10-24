'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { runCommand } = require('../agentWorkspaceLifecycle/git');

const IMAGE_DIGEST = /^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/;
const SAFE_CASE_ARGUMENT = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,95}$/;
const TIMEOUT_MS = 240000;

function resolveMountRoots(input) {
  const workspace = fs.realpathSync(input.cwd);
  const oracleRoot = fs.realpathSync(input.sandbox.oracleRoot);
  const workspaceToOracle = path.relative(workspace, oracleRoot);
  const oracleToWorkspace = path.relative(oracleRoot, workspace);
  if (!workspaceToOracle.startsWith('..') && !path.isAbsolute(workspaceToOracle)) {
    throw new Error('oracle-dans-workspace-interdit');
  }
  if (!oracleToWorkspace.startsWith('..') && !path.isAbsolute(oracleToWorkspace)) {
    throw new Error('workspace-dans-oracle-interdit');
  }
  if ([workspace, oracleRoot].some((root) => root.includes(','))) {
    throw new Error('virgule-interdite-dans-chemin-docker');
  }
  return { workspace, oracleRoot };
}

function containerProgram(program) {
  const name = path.win32.basename(String(program || '')).toLowerCase().replace(/\.exe$/, '');
  if (name === 'node') return '/usr/local/bin/node';
  if (name === 'python') return '/usr/local/bin/python3';
  throw new Error('interpreteur-verificateur-docker-non-autorise');
}

function containerArguments(args, oracleRoot) {
  if (!Array.isArray(args) || !args.length) throw new Error('arguments-verificateur-docker-requis');
  const script = path.resolve(args[0]);
  const relative = path.relative(oracleRoot, script);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('script-verificateur-hors-racine-oracle');
  }
  const mapped = `/oracle/${relative.split(path.sep).join('/')}`;
  const tail = args.slice(1);
  if (tail.some((value) => typeof value !== 'string' || !SAFE_CASE_ARGUMENT.test(value))) {
    throw new Error('argument-verificateur-docker-invalide');
  }
  return [mapped, ...tail];
}

function imageDigest(value) {
  if (typeof value !== 'string' || !IMAGE_DIGEST.test(value)) {
    throw new Error('image-verificateur-docker-doit-etre-epinglee-par-digest');
  }
  return value;
}

function dockerRunArgs(input, name, roots) {
  const image = imageDigest(input.sandbox.image);
  const program = containerProgram(input.program);
  const args = containerArguments(input.args, roots.oracleRoot);
  return ['run', '--rm', '--pull=never', '--name', name,
    '--label', 'genos.role=ontogenesis-verifier', '--network', 'none', '--read-only',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--user', '65532:65532',
    '--pids-limit', '64', '--cpus', '1', '--memory', '768m', '--memory-swap', '768m',
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=384m,uid=65532,gid=65532',
    '--env', 'CI=1', '--env', 'CARGO_NET_OFFLINE=true', '--env', 'CARGO_HOME=/tmp/cargo-home',
    '--env', 'CARGO_TARGET_DIR=/tmp/cargo-target', '--env', 'PYTHONDONTWRITEBYTECODE=1',
    '--mount', `type=bind,src=${roots.workspace},dst=/workspace,readonly`,
    '--mount', `type=bind,src=${roots.oracleRoot},dst=/oracle,readonly`,
    '--workdir', '/workspace', '--entrypoint', program, image, ...args];
}

function containerName() {
  return `genos-onto-verifier-${crypto.randomUUID()}`;
}

async function removeContainer(name, cwd, env) {
  try { await runCommand('docker', ['rm', '-f', name], { cwd, env, timeoutMs: 10000 }); } catch (_) {}
}

function dockerClientEnvironment() {
  const env = { PATH: process.env.PATH || '' };
  for (const key of ['SystemRoot', 'SystemDrive', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

async function assertLinuxDocker(cwd, env) {
  const info = await runCommand('docker', ['info', '--format', '{{.OSType}}'], { cwd, env, timeoutMs: 10000 });
  if (info.stdout.trim() !== 'linux') throw new Error('moteur-docker-linux-requis');
}

async function runDockerVerifier(input) {
  if (!input?.sandbox || input.sandbox.runtime !== 'docker') throw new Error('sandbox-docker-requis');
  imageDigest(input.sandbox.image);
  const roots = resolveMountRoots(input);
  const env = dockerClientEnvironment();
  await assertLinuxDocker(roots.workspace, env);
  const name = containerName();
  const timeoutMs = Number.isSafeInteger(input.timeoutMs) && input.timeoutMs > 0
    ? Math.min(input.timeoutMs, TIMEOUT_MS) : TIMEOUT_MS;
  const invocation = dockerRunArgs(input, name, roots);
  try {
    const result = await runCommand('docker', invocation, { cwd: roots.workspace, env, timeoutMs });
    return { ...result, sandboxEvidence: {
      runtime: 'docker-linux', imageDigest: input.sandbox.image, containerName: name,
      network: 'none', rootFilesystem: 'read-only', workspaceMount: 'read-only',
      oracleMount: 'read-only', capabilitySet: 'drop-all', memoryLimitMb: 768,
      cpuLimit: 1, pidLimit: 64
    } };
  } catch (error) {
    await removeContainer(name, roots.workspace, env);
    throw error;
  }
}

module.exports = { runDockerVerifier, dockerRunArgs, resolveMountRoots, containerProgram,
  containerArguments, imageDigest, TIMEOUT_MS };
