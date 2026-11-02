'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const archive = require('../../benchmarks/agow-paired-native/archive.cjs');

async function corruptJson(input, mutate) {
  const filename = await archive.inside(input.directory, path.join(input.directory, input.relative));
  const original = await fs.readFile(filename);
  const value = JSON.parse(original);
  mutate(value);
  try {
    await fs.writeFile(filename, JSON.stringify(value));
    await assert.rejects(archive.verify(input.directory), input.error);
  } finally { await fs.writeFile(filename, original); }
}

async function adversarial(directory) {
  const relative = 'witness/shadow/result.json';
  const input = { directory, relative, error: /differs from native proof recheck/ };
  await corruptJson(input, (value) => { value.loss = 1; });
  await corruptJson(input, (value) => { value.costs.runtimeMs += 1; });
  await corruptJson(input, (value) => { value.controlAuthority = 'agow'; });
  await corruptJson({ ...input, error: /AssertionError/ }, (value) => {
    value.initialDatabaseHash = '0'.repeat(64);
  });
  await corruptJson({ directory, relative: 'report.json', error: /AssertionError/ }, (value) => {
    value.summary.conditions.shadow.coverage = 1;
  });
  const database = await archive.inside(directory, path.join(directory, 'witness/shadow/mission.sqlite'));
  const wal = database + '-wal';
  await fs.writeFile(wal, 'controlled nonempty WAL probe', { flag: 'wx' });
  try { await assert.rejects(archive.verify(directory), /checkpointed and closed/); }
  finally { await fs.unlink(wal); }
  await tamperManifest(directory);
  await fs.writeFile(path.join(directory, 'adversarial-checks.json'), JSON.stringify({
    passed: 7, checks: ['loss substitution', 'cost substitution', 'authority substitution',
      'initial database substitution', 'coverage substitution', 'uncheckpointed WAL', 'posthoc manifest'],
    originalBytesRestored: true, promotionAllowed: false }, null, 2), { flag: 'wx' });
}

async function tamperManifest(directory) {
  const filename = path.join(directory, 'manifest.json');
  const original = await fs.readFile(filename);
  const manifest = JSON.parse(original);
  manifest.hypothesis += ' changed after observing outcomes';
  manifest.createdAt -= 1;
  const changedHash = require('../../benchmarks/agow-paired-native/contract.cjs').digest(manifest);
  const originals = new Map([[filename, original]]);
  try {
    await fs.writeFile(filename, JSON.stringify(manifest));
    const files = ['report.json', ...manifest.schedule.map((slot) => `${slot.caseId}/${slot.condition}/result.json`)];
    for (const relative of files) {
      const file = path.join(directory, relative);
      const bytes = await fs.readFile(file);
      originals.set(file, bytes);
      const value = JSON.parse(bytes);
      value.manifestHash = changedHash;
      await fs.writeFile(file, JSON.stringify(value));
    }
    await assert.rejects(archive.verify(directory), /native-campaign-binding/);
  } finally {
    for (const [file, bytes] of originals) await fs.writeFile(file, bytes);
  }
}

async function main() {
  const { directory, summary } = await require('../../benchmarks/agow-paired-native/run.cjs').run();
  assert.equal(summary.conditions.shadow.measured, 1);
  assert.equal(summary.conditions.bounded.measured, 1);
  assert.equal(summary.conditions.shadow.unknown, 1);
  assert.equal(summary.conditions.bounded.unknown, 1);
  assert.equal(summary.meanKnownPairedDelta, 0);
  assert.deepEqual(summary.allPairDeltaBounds, [-0.5, 0.5]);
  await adversarial(directory);
  console.log(`Paired native campaign: four real runtime arms, copied initial databases, current native proofs and seven archive refusals PASS. ${directory}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
