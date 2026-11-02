'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const plan = require('./cold-identity-plan.json');
const runtime = require('./runtime.cjs');
const prompts = require('./prompts.cjs');
const inference = require('./inference.cjs');
const scoring = require('./scoring.cjs');
const engine = require('./engine.cjs');
const evidence = require('./evidence.cjs');
const { hash } = require('./corpus.cjs');

async function probe(db, w, index) {
  const server = await engine.restart();
  const actor = w.actors[plan.actorIndex];
  const target = w.actors[plan.targetIndices[index]];
  const before = await runtime.state(db, actor);
  const session = await runtime.activate(db, actor);
  try {
    const context = await prompts.identityContext(db, { w, actor, target, cycle: plan.contextCounters[index] });
    const prompt = { mode: 'identity', ...context.prompt };
    const response = await runtime.execute(db, { session, domain: 'identity' }, () => inference.call(prompt));
    const score = scoring.identity(w, context, response);
    assert.deepEqual(await runtime.state(db, actor), before);
    return { index, actor, target, server, prompt, response, score,
      passed: Object.values(score).every(Boolean), memoryHash: before.hash };
  } finally { await runtime.incarnations.release(db, session); }
}

async function main(input) {
  const { campaign, output, manifestHash } = input;
  const manifest = JSON.parse(fs.readFileSync(path.join(campaign, 'manifest.json'), 'utf8'));
  const primary = JSON.parse(fs.readFileSync(path.join(campaign, 'summary.json'), 'utf8'));
  assert.equal(hash(manifest), manifestHash);
  assert(!fs.existsSync(output));
  fs.mkdirSync(output, { recursive: true });
  const original = path.join(campaign, 'lineage-0/runtime.sqlite');
  assert(!fs.existsSync(original + '-wal'), 'Primary database must be closed');
  const originalDatabaseHash = await evidence.fileHash(original);
  const copy = path.join(output, 'runtime.sqlite');
  fs.copyFileSync(original, copy);
  assert.equal(await evidence.fileHash(copy), originalDatabaseHash);
  const w = JSON.parse(fs.readFileSync(path.join(campaign, 'lineage-0/private-world.json'), 'utf8'));
  const db = await runtime.open(copy);
  const results = [];
  try {
    for (let index = 0; index < plan.targetIndices.length; index++) {
      results.push(await probe(db, w, index));
      evidence.write(output, `probe-${index}.json`, results.at(-1));
    }
  } finally { await db.close(); }
  assert.equal(await evidence.fileHash(original), originalDatabaseHash);
  const report = { plan, planHash: hash(plan), parentManifestHash: manifestHash, originalDatabaseHash,
    results, passed: results.every(row => row.passed), primaryVerdict: primary.status,
    combinedFunctionalCaseSupported: primary.status === 'bounded_support' && results.every(row => row.passed),
    promotionAuthorized: false };
  evidence.write(output, 'summary.json', report);
  await engine.stop();
  console.log(JSON.stringify({ supplementalPassed: report.passed, combinedFunctionalCaseSupported: report.combinedFunctionalCaseSupported }));
}

if (require.main === module) main({ campaign: path.resolve(process.argv[2]), output: path.resolve(process.argv[3]),
  manifestHash: process.argv[4] }).catch(error => { console.error(error); process.exitCode = 1; });

module.exports = { main };
