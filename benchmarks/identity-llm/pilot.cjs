'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const protocol = require('./config.cjs');
const corpus = require('./corpus.cjs');
const evidence = require('./evidence.cjs');
const inference = require('./inference.cjs');
const engine = require('./engine.cjs');
const runtime = require('./runtime.cjs');

function invoke(directory, input) {
  const request = { ...input, directory, lineage: 0, worldPath: path.join(directory, 'private-world.json'),
    reportPath: path.join(directory, input.mode + '.report.json'), deadline: Date.now() + 3600000, callLimit: 250 };
  const file = path.join(directory, input.mode + '.request.json');
  evidence.write(directory, input.mode + '.request.json', request);
  const result = spawnSync(process.execPath, [path.join(__dirname, 'worker.cjs'), file], {
    cwd: __dirname, windowsHide: true, stdio: 'inherit', timeout: 3600000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0);
}

function counts(events) {
  const trained = events.filter(row => row.type === 'train-result');
  const identity = Object.fromEntries(['self','origin','path','relation','author','ownership']
    .map(key => [key, trained.filter(row => row.identity[key]).length + '/' + trained.length]));
  const arms = {};
  for (const arm of protocol.arms) {
    const rows = events.filter(row => row.type === 'eval-result' && row.arm === arm && row.score.solvable);
    arms[arm] = { successes: rows.filter(row => row.score.exact).length, total: rows.length };
  }
  return { identity, acceptedUpdates: trained.filter(row => row.learningAdmission.accepted).length, arms };
}

async function main(directory, developmentCycles) {
  assert(Number.isInteger(developmentCycles) && developmentCycles >= 1 && developmentCycles <= protocol.chunkSize);
  assert(!fs.existsSync(directory));
  fs.mkdirSync(directory, { recursive: true });
  const seed = crypto.randomBytes(16).toString('hex');
  const world = corpus.world(seed);
  await engine.restart();
  const ready = await inference.ready();
  evidence.write(directory, 'development-manifest.json', { developmentOnly: true, fullCampaignQualified: false,
    protocol, seed, developmentCycles, ready, provenance: evidence.provenance() });
  evidence.write(directory, 'private-world.json', world);
  invoke(directory, { mode: 'train', chunk: 0, initialize: true, experimentPhase: 'development', developmentCycles });
  await engine.restart();
  invoke(directory, { mode: 'eval', window: 0 });
  const events = evidence.journal(directory);
  const db = await runtime.open(path.join(directory, 'runtime.sqlite'));
  let lessons;
  try { lessons = (await runtime.state(db, world.actors[0])).lessons; }
  finally { await db.close(); }
  const result = { developmentOnly: true, fullCampaignQualified: false, ...counts(events), lessons,
    calls: events.filter(row => row.type === 'response-committed').length };
  evidence.write(directory, 'pilot-summary.json', result);
  await engine.stop();
  console.log(JSON.stringify(result));
}

if (require.main === module) main(path.resolve(process.argv[2]), Number(process.argv[3] || 24)).catch(error => { console.error(error); process.exitCode = 1; });
