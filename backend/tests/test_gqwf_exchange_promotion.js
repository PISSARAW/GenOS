'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const f = require('./helpers/gqwfExchangePromotionFixture');

function query(candidate) {
  return { scope: f.SCOPE, missionId: 'mission-1', conversationId: 'conversation-1', candidateId: candidate.candidateId };
}

async function competingCandidates(directory) {
  const fixture = await f.setup(directory);
  try {
    const base = await fixture.promotion.head({ scope: f.SCOPE, name: 'main' });
    const worldA = await f.candidateWorld(fixture, { id: 'world-a', content: 'module.exports = 2;\n' });
    const worldB = await f.candidateWorld(fixture, { id: 'world-b', content: 'module.exports = 3;\n' });
    const a = f.candidate(worldA, base, 'candidate-a');
    const b = f.candidate(worldB, base, 'candidate-b');
    const preparedA = await f.prepare(fixture, a);
    const preparedB = await f.prepare(fixture, b);
    assert.equal(fixture.probes, 2);
    assert.deepEqual(await fixture.promotion.head({ scope: f.SCOPE, name: 'main' }), base);
    const first = await f.advance(fixture, a, { previous: preparedA, type: 'COMMIT' });
    assert.equal(first.result.generation, 1);
    assert.equal(first.result.externalEffectsAuthorized, false);
    assert.equal(first.result.origin.kind, 'isolated');
    const stale = f.message('COMMIT', { candidateId: b.candidateId, candidateDigest: digest(b) }, { causalRefs: [preparedB.messageId] });
    await assert.rejects(fixture.promotion.apply(stale), /current base changed/);
    assert.equal(fixture.probes, 2);
    const rebased = f.candidate(worldB, { rootHash: a.rootHash, generation: 1 }, 'candidate-b-rebased');
    const preparedRebase = await f.prepare(fixture, rebased);
    assert.equal(fixture.probes, 3);
    const second = await f.advance(fixture, rebased, { previous: preparedRebase, type: 'COMMIT' });
    assert.equal(second.result.generation, 2);
    assert.equal(second.result.previousHash, a.rootHash);
    assert.deepEqual(await fixture.promotion.apply(first.envelope), first.result);
    assert.deepEqual(await fixture.promotion.receipt(query(a)), first.result);
    assert.deepEqual(await fixture.promotion.head({ scope: f.SCOPE, name: 'main' }), { rootHash: b.rootHash, generation: 2 });
    const events = await fixture.exchange.db.all('SELECT * FROM gqwf_head_events ORDER BY generation');
    assert.equal(events.length, 2);
    assert.equal(events[0].evidence_id, first.result.evidenceId);
    assert.equal(events[1].root_hash, b.rootHash);
  } finally { fixture.close(); }
}

async function receiptRollback(directory) {
  const fixture = await f.setup(directory);
  try {
    const base = await fixture.promotion.head({ scope: f.SCOPE, name: 'main' });
    const world = await f.candidateWorld(fixture, { id: 'world-a', content: 'module.exports = 2;\n' });
    const candidate = f.candidate(world, base);
    const prepared = await f.prepare(fixture, candidate);
    await fixture.exchange.db.exec(`CREATE TEMP TRIGGER reject_publication_receipt BEFORE INSERT ON gqwf_exchange_promotion_events
      BEGIN SELECT RAISE(ABORT, 'injected receipt failure'); END;`);
    const commit = f.message('COMMIT', { candidateId: candidate.candidateId, candidateDigest: digest(candidate) }, { causalRefs: [prepared.messageId] });
    await assert.rejects(fixture.promotion.apply(commit), /injected receipt failure/);
    assert.deepEqual(await fixture.promotion.head({ scope: f.SCOPE, name: 'main' }), base);
    assert.equal((await fixture.exchange.db.all('SELECT * FROM gqwf_head_events')).length, 0);
    assert.equal(await fixture.promotion.receipt(query(candidate)), null);
    assert.equal((await fixture.promotion.state(query(candidate))).status, 'prepared');
    await fixture.exchange.db.exec('DROP TRIGGER reject_publication_receipt');
    assert.equal((await fixture.promotion.apply(commit)).status, 'committed');
  } finally { fixture.close(); }
}

async function separateAuthority(directory) {
  let promoted = false;
  const fixture = await f.setup(directory, { authorizePromotion: async () => promoted });
  try {
    const base = await fixture.promotion.head({ scope: f.SCOPE, name: 'main' });
    const world = await f.candidateWorld(fixture, { id: 'world-a', content: 'module.exports = 2;\n' });
    const candidate = f.candidate(world, base);
    const offered = await f.offer(fixture, candidate);
    const verified = await f.advance(fixture, candidate, { previous: offered, type: 'REQUEST_EVIDENCE' });
    await assert.rejects(f.advance(fixture, candidate, { previous: verified.envelope, type: 'PREPARE_PROMOTION' }), /separate promotion authorization/);
    assert.equal(fixture.probes, 1);
    assert.deepEqual(await fixture.promotion.head({ scope: f.SCOPE, name: 'main' }), base);
    promoted = true;
    const prepared = await f.advance(fixture, candidate, { previous: verified.envelope, type: 'PREPARE_PROMOTION' });
    promoted = false;
    await assert.rejects(f.advance(fixture, candidate, { previous: prepared.envelope, type: 'COMMIT' }), /separate promotion authorization/);
    assert.deepEqual(await fixture.promotion.head({ scope: f.SCOPE, name: 'main' }), base);
  } finally { fixture.close(); }
}

async function run() {
  const temporaryRoot = path.resolve(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'gqwf-exchange-promotion-'));
  try {
    await competingCandidates(path.join(directory, 'competition'));
    await receiptRollback(path.join(directory, 'rollback'));
    await separateAuthority(path.join(directory, 'authority'));
    console.log('GQWF Exchange native head CAS, independent current-base evidence and atomic publication receipt: PASS');
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), temporaryRoot);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
