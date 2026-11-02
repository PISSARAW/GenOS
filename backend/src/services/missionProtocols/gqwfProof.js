'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { digest } = require('../evidenceProtocol/canonical');
const store = require('./gqwfStore');

const raw = value => crypto.createHash('sha256').update(value).digest('hex');
const environment = () => ({ ...Object.fromEntries(['SystemRoot', 'WINDIR'].filter(name => process.env[name])
  .map(name => [name, process.env[name]])), NODE_OPTIONS: '' });

function executionClosure() {
  return { command: { executable: process.execPath, arguments: ['--check', '--input-type=commonjs'] },
    runtime: { name: 'node', version: process.version, digest: raw(fs.readFileSync(process.execPath)) },
    dependencies: [{ name: 'genos.mission.node-syntax', version: '1', digest: raw(fs.readFileSync(__filename)) }],
    environment: Object.entries(environment()).map(([name, value]) => ({ name, valueHash: raw(value) })) };
}

function current(world) {
  const expected = executionClosure();
  const actual = { command: world.closure.command, runtime: world.closure.runtime,
    dependencies: world.closure.dependencies, environment: world.closure.environment };
  const normalized = value => ({ ...value, dependencies: [...value.dependencies].sort((a, b) => a.name.localeCompare(b.name)),
    environment: [...value.environment].sort((a, b) => a.name.localeCompare(b.name)) });
  if (digest(normalized(expected)) !== digest(normalized(actual))) throw new Error('MISSION_GQWF_VERIFIER_ENVIRONMENT_CHANGED');
}

async function execute(session, request) {
  current(request.world);
  const files = await applicableFiles(session, request.world);
  if (!files.length || files.length > 128) throw new Error('MISSION_GQWF_APPLICABLE_SYNTAX_PROFILE_REQUIRED');
  const tested = [];
  for (const file of files) {
    const bytes = await session.exchange.cas.read(file);
    const result = spawnSync(process.execPath, ['--check', '--input-type=commonjs'], { input: bytes, env: environment(),
      encoding: 'utf8', timeout: 5000, windowsHide: true, maxBuffer: 1024 * 1024 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`MISSION_GQWF_SYNTAX_REFUTED:${file.path}`);
    tested.push({ path: file.path, hash: file.hash, exitCode: result.status });
  }
  current(request.world);
  return { predicate: 'native-node-commonjs-syntax-all-javascript', rootHash: request.world.rootHash,
    baseHash: request.candidate.baseHash, baseGeneration: request.candidate.baseGeneration, tested,
    environmentDigest: request.candidate.environmentDigest, externalEffectsAuthorized: false };
}

async function applicableFiles(session, world) {
  if (world.manifest.files.some(file => file.path.endsWith('.mjs'))) throw new Error('MISSION_GQWF_ESM_PROFILE_NOT_INSTALLED');
  const files = world.manifest.files.filter(file => /\.(?:js|cjs)$/.test(file.path));
  for (const file of files.filter(item => item.path.endsWith('.js'))) await commonJsPackage(session, { world, file });
  return files;
}

async function commonJsPackage(session, input) {
  let directory = path.posix.dirname(input.file.path);
  while (true) {
    const target = directory === '.' ? 'package.json' : `${directory}/package.json`;
    const entry = input.world.manifest.files.find(file => file.path === target);
    if (entry) {
      const value = JSON.parse((await session.exchange.cas.read(entry)).toString('utf8'));
      if (value.type === 'module') throw new Error('MISSION_GQWF_ESM_PROFILE_NOT_INSTALLED');
      if (value.type && value.type !== 'commonjs') throw new Error('MISSION_GQWF_PACKAGE_TYPE_UNSUPPORTED');
      return;
    }
    if (directory === '.') return;
    directory = path.posix.dirname(directory);
  }
}

async function verify(session, request) {
  const subject = digest([request.candidate, request.world, request.currentHead, request.policy]);
  current(request.world);
  let value = await store.proof(session.binding.db, subject);
  if (request.stage === 'REQUEST_EVIDENCE' && !value) value = await store.saveProof(session.binding.db,
    { subject, proof: await execute(session, request) });
  if (!value) throw new Error('MISSION_GQWF_EXACT_RECEIVER_EVIDENCE_REQUIRED');
  return { status: 'validated', requestDigest: digest(request), receiptDigest: digest(value),
    verifierRef: 'mission-native-node-syntax' };
}

module.exports = { raw, executionClosure, current, verify };
