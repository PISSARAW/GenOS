'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const f = require('./fixture.cjs');
const identity = require('./identity-probe.cjs');
const learning = require('./learning-probe.cjs');
const { checkWindow } = require('./run.cjs');
const protocol = require('./protocol.json');

async function exercise(db) {
  for (let index = 0; index < 200; index++) {
    const task = learning.task({ seed: 17, phase: 'arithmetic-check', index });
    assert.equal(learning.precise(task), learning.exact(task));
  }
  await f.initialize(db, protocol);
  const session = await f.activate(db, f.ROOT);
  try {
    for (let cycle = 0; cycle < 16; cycle++) {
      await identity.transform(db, cycle);
      await learning.train(db, { cycle, seed: 17, session });
    }
    for (let index = 0; index < 25; index++) await identity.recognize(db, { index, protocol });
    assert.equal(await identity.adversarial(db, { session, chunk: 0 }), 7);
    assert.deepEqual(await identity.inherit(db, 0), { inherited: 3, crossScopeRejected: 1 });
    assert.equal((await identity.verifyAll(db, protocol)).descendants, 24);
    const input = { seed: 17, session, window: 0, protocol: { ...protocol, maximumBrier: 0.1 } };
    const evaluation = await learning.evaluate(db, input);
    checkWindow({ evaluation }, input.protocol);
    const corrupted = structuredClone(evaluation);
    corrupted.arms.learned.successRate = 0.5;
    assert.throws(() => checkWindow({ evaluation: corrupted }, input.protocol));
    const falseCalibration = structuredClone(evaluation);
    falseCalibration.arms.learned.brier = 0.9;
    assert.throws(() => checkWindow({ evaluation: falseCalibration }, input.protocol));
  } finally { await f.incarnations.release(db, session); }
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-identity-test-'));
  const filename = path.join(directory, 'runtime.sqlite');
  let db = await f.open(filename);
  try {
    await exercise(db);
    const before = await f.ledger.verify(db, f.ROOT);
    await db.close();
    db = await f.open(filename);
    assert.deepEqual(await f.ledger.verify(db, f.ROOT), before);
    const session = await f.activate(db, f.ROOT);
    await learning.evaluate(db, { seed: 17, session, window: 1, protocol });
    await f.incarnations.release(db, session);
    console.log('PASS identity benchmark: genealogy, adversarial controls, retention, scorer falsification');
  } finally {
    await db.close();
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
