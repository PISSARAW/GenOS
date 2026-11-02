'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync, execFileSync } = require('node:child_process');
const contract = require('./contract.cjs');
const sources = require('./sources.cjs');
const archive = require('./archive.cjs');

async function invoke(args, directory) {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'worker.cjs'), ...args], {
    cwd: sources.ROOT, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024,
    env: require('./environment.cjs').environment(directory) });
  await fs.writeFile(path.join(directory, 'process.log'), result.stdout + result.stderr);
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr.slice(-4000));
  return result.pid;
}

async function prepareCase(directory, item) {
  const base = path.join(directory, item.caseId, 'base');
  await fs.mkdir(base, { recursive: true });
  await invoke(['prepare', base], base);
  return { ...item, methodHash: contract.digest(contract.method(item)),
    initialDatabaseHash: contract.hash(await fs.readFile(path.join(base, 'mission.sqlite'))),
    inputFileHash: contract.hash(await fs.readFile(path.join(base, 'inputs/task.txt'))) };
}

async function runArm(directory, input) {
  const { manifest, slot } = input;
  const baseDirectory = path.join(directory, slot.caseId, 'base');
  const armDirectory = path.join(directory, slot.caseId, slot.condition);
  await fs.mkdir(armDirectory);
  await fs.copyFile(path.join(baseDirectory, 'mission.sqlite'), path.join(armDirectory, 'mission.sqlite'));
  const request = { ...slot, manifestPath: path.join(directory, 'manifest.json'),
    manifestHash: contract.digest(manifest), baseDirectory };
  const requestPath = path.join(armDirectory, 'request.json');
  await fs.writeFile(requestPath, JSON.stringify(request, null, 2), { flag: 'wx' });
  const processId = await invoke(['execute', requestPath], armDirectory);
  const result = JSON.parse(await fs.readFile(path.join(armDirectory, 'result.json'), 'utf8'));
  assert.equal(result.processId, processId);
  assert.notEqual(result.processId, process.pid);
  contract.validateArm(manifest, result);
  console.log(`Paired native arm: ${slot.caseId}/${slot.condition}, loss=${result.loss}, run=${result.runStatus}`);
  return result;
}

async function run() {
  const directory = path.join(archive.outputRoot(), randomUUID());
  await fs.mkdir(directory, { recursive: true });
  const items = [];
  for (const item of contract.cases()) items.push(await prepareCase(directory, item));
  const manifest = { schema: contract.SCHEMA, createdAt: Date.now(), cases: items,
    conditions: contract.CONDITIONS, limits: contract.LIMITS, schedule: contract.schedule(items),
    sources: await sources.capture(), sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: sources.ROOT, encoding: 'utf8' }).trim(), holdout: false, promotionAllowed: false,
    hypothesis: 'Qualify matched native mission evidence under shadow and bounded AGOW.',
    analysisPlan: 'Keep every slot; compare bounded-minus-shadow losses with unknown bounds; describe measured oracle costs.' };
  contract.validateManifest(manifest);
  await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
  const arms = [];
  for (const slot of manifest.schedule) arms.push(await runArm(directory, { manifest, slot }));
  await sources.check(manifest.sources);
  const summary = require('./analysis.cjs').summarize(manifest, arms);
  await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify({ manifestHash: contract.digest(manifest),
    summary, promotionAllowed: false }, null, 2), { flag: 'wx' });
  const verification = await archive.verify(directory);
  await fs.writeFile(path.join(directory, 'verification.json'), JSON.stringify(verification, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ directory, summary, verification }));
  return { directory, summary, verification };
}

if (require.main === module) run().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { run };
