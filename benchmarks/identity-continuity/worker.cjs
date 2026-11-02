'use strict';

process.env.NODE_ENV = 'test';
const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const f = require('./fixture.cjs');
const identity = require('./identity-probe.cjs');
const learning = require('./learning-probe.cjs');
const snapshots = f.service('identity/snapshots');

async function training(db, input) {
  const session = await f.activate(db, f.ROOT);
  const traces = [];
  let recognitions = 0;
  try {
    for (let offset = 0; offset < input.protocol.chunkSize; offset++) {
      const cycle = input.chunk * input.protocol.chunkSize + offset;
      const transformation = await identity.transform(db, cycle);
      const episode = await learning.train(db, { cycle, seed: input.seed, session });
      const row = { transformation, episode };
      if (cycle % input.protocol.recognitionEvery === 0) {
        row.recognition = await identity.recognize(db, {
          index: cycle / input.protocol.recognitionEvery, protocol: input.protocol });
        recognitions++;
      }
      traces.push(row);
    }
    const rejected = await identity.adversarial(db, { session, chunk: input.chunk });
    const inheritance = await identity.inherit(db, input.chunk);
    const verification = await identity.verifyAll(db, input.protocol);
    return { transformations: traces.length, cycles: traces.length, recognitions,
      rejected, inheritance, verification, incarnationId: session.incarnationId, traces };
  } finally { await f.incarnations.release(db, session); }
}

async function restoreIdentityAnchor(db, input) {
  const contentHash = f.store.hash({ seed: input.seed, chunk: input.chunk });
  await f.checkpoints.seal(db, { agentId: f.ROOT, checkpointId: `restart:${input.chunk}`,
    contentHash, coverage: ['identity'] });
  await snapshots.restored(db, { agentId: f.ROOT, operationId: `restart:${input.chunk}`,
    state: { _genosSnapshot: { organismSnapshot: { hash: contentHash, components: { identity: {} } } } } });
}

async function evaluation(db, input) {
  const session = await f.activate(db, f.ROOT);
  try {
    return { evaluation: await learning.evaluate(db, { ...input, session }),
      verification: await identity.verifyAll(db, input.protocol), incarnationId: session.incarnationId };
  } finally { await f.incarnations.release(db, session); }
}

async function staleSession(db) {
  const previous = await f.activate(db, f.ROOT);
  await f.incarnations.release(db, previous);
  const next = await f.activate(db, f.ROOT);
  try {
    assert.notEqual(next.incarnationId, previous.incarnationId);
    await assert.rejects(f.incarnations.assertSession(db, previous), /SESSION_STALE/);
    return 1;
  } finally { await f.incarnations.release(db, next); }
}

async function main(input) {
  const db = await f.open(input.database);
  try {
    if (input.initialize) await f.initialize(db, input.protocol);
    let result;
    if (input.mode === 'train') {
      await restoreIdentityAnchor(db, input);
      result = await training(db, input);
      result.staleSessionRejected = await staleSession(db);
    } else {
      result = await evaluation(db, input);
    }
    const report = { pid: process.pid, processNonce: crypto.randomUUID(),
      seed: input.seed, mode: input.mode, chunk: input.chunk, window: input.window, ...result };
    fs.writeFileSync(input.output, JSON.stringify(report, null, 2));
  } finally { await db.close(); }
}

if (require.main === module) {
  main(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')))
    .catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { main };
