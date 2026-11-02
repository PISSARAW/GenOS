'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const contract = require('./contract.cjs');
const sources = require('./sources.cjs');

function outputRoot() {
  return process.env.GENOS_AGOW_PAIRED_ROOT || path.join(sources.ROOT, '.genos-agent-worlds/agow-paired-native');
}

async function inside(root, file) {
  const resolved = await fs.realpath(file);
  const relative = path.relative(await fs.realpath(root), resolved);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Archive path escapes its root');
  return resolved;
}

async function recheck(directory, slot) {
  const armDirectory = path.join(directory, slot.caseId, slot.condition);
  const resultPath = await inside(directory, path.join(armDirectory, 'result.json'));
  const database = await checkpointed(directory, path.join(armDirectory, 'mission.sqlite'));
  const result = JSON.parse(await fs.readFile(resultPath, 'utf8'));
  assert.equal(result.caseId, slot.caseId);
  assert.equal(result.condition, slot.condition);
  const copy = await fs.mkdtemp(path.join(directory, '.recheck-'));
  await fs.copyFile(database, path.join(copy, 'mission.sqlite'));
  const lifecycle = require('./environment.cjs');
  Object.assign(process.env, lifecycle.environment(copy));
  const db = await require('../../backend/src/db').getDatabase(process.env.GENOS_DB_PATH);
  try {
    const actual = await require('./evidence.cjs').read(db, result);
    const recorded = Object.fromEntries(Object.keys(actual).map((key) => [key, result[key]]));
    assert.equal(contract.digest(recorded), contract.digest(actual), 'Archived outcome differs from native proof recheck');
    return result;
  } finally { await lifecycle.close(db); }
}

async function verify(directory) {
  const archive = await inside(outputRoot(), directory);
  const manifestPath = await inside(archive, path.join(archive, 'manifest.json'));
  const manifest = contract.validateManifest(JSON.parse(await fs.readFile(manifestPath, 'utf8')));
  await sources.check(manifest.sources);
  const reportPath = await inside(archive, path.join(archive, 'report.json'));
  const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  assert.equal(report.manifestHash, contract.digest(manifest));
  for (const item of manifest.cases) await checkBase(archive, item);
  const arms = [];
  for (const slot of manifest.schedule) arms.push(await recheck(archive, slot));
  assert.deepEqual(require('./analysis.cjs').summarize(manifest, arms), report.summary);
  await sources.check(manifest.sources);
  return { verified: true, manifestHash: contract.digest(manifest),
    reportHash: contract.hash(await fs.readFile(reportPath)), nativeRechecks: arms.length,
    scope: 'local_engineering_pairing_with_current_native_proof_checks', promotionAllowed: false };
}

async function checkBase(directory, item) {
  const database = await checkpointed(directory, path.join(directory, item.caseId, 'base/mission.sqlite'));
  const input = await inside(directory, path.join(directory, item.caseId, 'base/inputs/task.txt'));
  assert.equal(contract.hash(await fs.readFile(database)), item.initialDatabaseHash);
  assert.equal(contract.hash(await fs.readFile(input)), item.inputFileHash);
}

async function checkpointed(directory, filename) {
  const database = await inside(directory, filename);
  assert.equal((await fs.lstat(filename)).isSymbolicLink(), false, 'Database symlinks are refused');
  for (const suffix of ['-wal', '-journal']) {
    try {
      const sidecar = await inside(directory, filename + suffix);
      assert.equal((await fs.stat(sidecar)).size, 0, 'Database must be checkpointed and closed');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return database;
}

module.exports = { outputRoot, inside, verify, checkpointed };
