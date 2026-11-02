'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const { blobPath } = require('../src/services/gqwf/objects');
const { withTransaction } = require('../src/db');
const f = require('./helpers/gqwfExchangePromotionFixture');

async function singleCandidate(fixture) {
  const base = await fixture.promotion.head({ scope: f.SCOPE, name: 'main' });
  const world = await f.candidateWorld(fixture, { id: 'world-a', content: 'module.exports = 2;\n' });
  const candidate = f.candidate(world, base);
  const prepared = await f.prepare(fixture, candidate);
  const commit = f.message('COMMIT', { candidateId: candidate.candidateId, candidateDigest: digest(candidate) }, { causalRefs: [prepared.messageId] });
  return { base, world, candidate, prepared, commit };
}

async function duplicateCommit(directory) {
  const fixture = await f.setup(directory);
  try {
    const { commit } = await singleCandidate(fixture);
    const outcomes = await Promise.all([fixture.promotion.apply(commit), fixture.promotion.apply(commit)]);
    assert.deepEqual(outcomes[0], outcomes[1]);
    assert.equal((await fixture.exchange.db.all('SELECT * FROM gqwf_head_events')).length, 1);
    assert.equal((await fixture.promotion.head({ scope: f.SCOPE, name: 'main' })).generation, 1);
  } finally { fixture.close(); }
}

async function receiverFailureIsNotVerification(directory) {
  const fixture = await f.setup(directory);
  try {
    const base = await fixture.promotion.head({ scope: f.SCOPE, name: 'main' });
    const world = await f.candidateWorld(fixture, { id: 'bad-syntax', content: 'module.exports = ;\n' });
    const candidate = f.candidate(world, base);
    const offered = await f.offer(fixture, candidate);
    await assert.rejects(f.advance(fixture, candidate, { previous: offered, type: 'REQUEST_EVIDENCE' }), /receiver predicate failed/);
    assert.equal(fixture.probes, 0);
    assert.deepEqual(await fixture.promotion.head({ scope: f.SCOPE, name: 'main' }), base);
    const query = { scope: f.SCOPE, missionId: 'mission-1', conversationId: 'conversation-1', candidateId: candidate.candidateId };
    assert.equal((await fixture.promotion.state(query)).status, 'offered');
    assert.equal(await fixture.promotion.receipt(query), null);
  } finally { fixture.close(); }
}

async function revokedAfterHeadCas(directory) {
  let granted = true;
  const fixture = await f.setup(directory, { authorize: async ({ action }) => action !== 'COMMIT' || granted });
  try {
    const value = await singleCandidate(fixture);
    const getter = fixture.promotion.verifiedWorld;
    fixture.promotion.verifiedWorld = async query => {
      const result = await getter(query);
      const head = await fixture.exchange.db.get('SELECT generation FROM gqwf_heads WHERE workspace_id=? AND name=?', 'workspace-1', 'main');
      if (head.generation === 1) granted = false;
      return result;
    };
    await assert.rejects(fixture.promotion.apply(value.commit), /authority rejected or revoked/);
    assert.deepEqual(await fixture.promotion.head({ scope: f.SCOPE, name: 'main' }), value.base);
    assert.equal((await fixture.exchange.db.all('SELECT * FROM gqwf_head_events')).length, 0);
    assert.equal(await fixture.promotion.receipt({ scope: f.SCOPE, missionId: 'mission-1',
      conversationId: 'conversation-1', candidateId: value.candidate.candidateId }), null);
  } finally { fixture.close(); }
}

async function physicalCasRechecked(directory) {
  const fixture = await f.setup(directory);
  try {
    const value = await singleCandidate(fixture);
    const blob = value.world.manifest.files.find(file => file.path === 'candidate.js');
    fs.writeFileSync(blobPath(fixture.workspace, blob.hash), 'corrupt');
    await assert.rejects(fixture.promotion.apply(value.commit), /size mismatch|integrity check failed/);
    assert.deepEqual(await fixture.promotion.head({ scope: f.SCOPE, name: 'main' }), value.base);
    assert.equal((await fixture.exchange.db.all('SELECT * FROM gqwf_head_events')).length, 0);
  } finally { fixture.close(); }
}

async function expiryAndForeignEvidence(directory) {
  let now = f.NOW;
  const fixture = await f.setup(directory, { clock: () => now });
  try {
    const value = await singleCandidate(fixture);
    const verify = fixture.promotion.verifyEvidence;
    fixture.promotion.verifyEvidence = async request => {
      const receipt = await verify(request);
      now = '2026-11-04T18:00:00Z';
      return receipt;
    };
    await assert.rejects(fixture.promotion.apply(value.commit), /expired/);
    now = f.NOW;
    fixture.promotion.verifyEvidence = async request => ({ ...(await verify(request)), verifierRef: 'not-installed' });
    await assert.rejects(fixture.promotion.apply(value.commit), /evidence binding rejected/);
    assert.deepEqual(await fixture.promotion.head({ scope: f.SCOPE, name: 'main' }), value.base);
    await assert.rejects(fixture.promotion.head({ scope: { ...f.SCOPE, projectId: 'foreign' }, name: 'main' }), /workspace scope mismatch/);
    const foreign = { ...value.commit, audience: { ...value.commit.audience, agentId: 'another-receiver' } };
    await assert.rejects(fixture.promotion.apply(foreign), /context or digest mismatch/);
  } finally { fixture.close(); }
}

async function nativeTransactionIsolation(directory) {
  let entered;
  let release;
  const reached = new Promise(resolve => { entered = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const fixture = await f.setup(directory);
  try {
    const value = await singleCandidate(fixture);
    fixture.promotion.authorize = async ({ action }) => {
      if (action !== 'COMMIT') return true;
      const head = await fixture.exchange.db.get('SELECT generation FROM gqwf_heads WHERE workspace_id=? AND name=?', 'workspace-1', 'main');
      if (head.generation !== 1) return true;
      entered(); await held; return false;
    };
    const committing = fixture.promotion.apply(value.commit).catch(error => error);
    await reached;
    let headReturned = false;
    let exchangeAcked = false;
    const reading = fixture.promotion.head({ scope: f.SCOPE, name: 'main' }).then(result => { headReturned = true; return result; });
    const world = { ...value.world, worldId: 'parallel-world-offer' };
    const offering = fixture.exchange.apply(f.message('OFFER_WORLD', { world })).then(result => { exchangeAcked = true; return result; });
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(headReturned, false, 'An independent reader must not observe the uncommitted native head.');
    assert.equal(exchangeAcked, false, 'A separate transfer must not ACK a nested write before promotion commits.');
    release();
    assert.match((await committing).message, /authority rejected or revoked/);
    assert.deepEqual(await reading, value.base);
    assert.equal((await offering).status, 'offered');
    const state = await fixture.exchange.describe({ scope: f.SCOPE, missionId: 'mission-1', conversationId: 'conversation-1',
      worldId: world.worldId, worldDigest: digest(world) });
    assert.equal(state.status, 'offered');
  } finally { release(); fixture.close(); }
}

async function corruptionAtFinalAuthorization(directory) {
  const fixture = await f.setup(directory);
  try {
    const value = await singleCandidate(fixture);
    let calls = 0;
    fixture.promotion.authorize = async ({ action }) => {
      if (action === 'COMMIT') {
        calls += 1;
        if (calls === 3) {
          const blob = value.world.manifest.files.find(file => file.path === 'candidate.js');
          fs.writeFileSync(blobPath(fixture.workspace, blob.hash), Buffer.alloc(blob.size, 120));
        }
      }
      return true;
    };
    await assert.rejects(fixture.promotion.apply(value.commit), /integrity check failed/);
    assert.equal(calls, 3);
    assert.deepEqual(await fixture.promotion.head({ scope: f.SCOPE, name: 'main' }), value.base);
    assert.equal((await fixture.exchange.db.all('SELECT * FROM gqwf_head_events')).length, 0);
  } finally { fixture.close(); }
}

async function intermediateMutexGuard(directory, mode) {
  const fixture = await f.setup(directory);
  try {
    const base = await fixture.promotion.head({ scope: f.SCOPE, name: 'main' });
    const world = await f.candidateWorld(fixture, { id: 'world-a', content: 'module.exports = 2;\n' });
    const candidate = f.candidate(world, base);
    const offered = await f.offer(fixture, candidate);
    const verified = await f.advance(fixture, candidate, { previous: offered, type: 'REQUEST_EVIDENCE' });
    const commit = fixture.promotion.store.commit.bind(fixture.promotion.store);
    fixture.promotion.store.commit = async change => {
      let entered;
      let release;
      const reached = new Promise(resolve => { entered = resolve; });
      const held = new Promise(resolve => { release = resolve; });
      const blocker = withTransaction(fixture.exchange.db, async () => { entered(); await held; });
      await reached;
      const pending = commit(change).then(value => ({ value }), error => ({ error }));
      if (mode === 'expiry') fixture.promotion.clock = () => '2026-11-04T18:00:00Z';
      else fixture.promotion.authorize = async ({ action }) => action !== 'PREPARE_PROMOTION';
      release(); await blocker;
      const result = await pending;
      if (result.error) throw result.error;
      return result.value;
    };
    await assert.rejects(f.advance(fixture, candidate, { previous: verified.envelope, type: 'PREPARE_PROMOTION' }), /expired|authority rejected or revoked/);
    const state = await fixture.promotion.state({ scope: f.SCOPE, missionId: 'mission-1', conversationId: 'conversation-1', candidateId: candidate.candidateId });
    assert.equal(state.status, 'verified');
    assert.deepEqual(await fixture.promotion.head({ scope: f.SCOPE, name: 'main' }), base);
  } finally { fixture.close(); }
}

async function intermediateHeadGuard(directory) {
  const fixture = await f.setup(directory);
  try {
    const a = await singleCandidate(fixture);
    const worldB = await f.candidateWorld(fixture, { id: 'world-b', content: 'module.exports = 3;\n' });
    const b = f.candidate(worldB, a.base, 'candidate-b');
    const offered = await f.offer(fixture, b);
    const verified = await f.advance(fixture, b, { previous: offered, type: 'REQUEST_EVIDENCE' });
    const commit = fixture.promotion.store.commit.bind(fixture.promotion.store);
    fixture.promotion.store.commit = async change => {
      if (change.message.type === 'PREPARE_PROMOTION') await fixture.promotion.apply(a.commit);
      return commit(change);
    };
    await assert.rejects(f.advance(fixture, b, { previous: verified.envelope, type: 'PREPARE_PROMOTION' }), /current base changed/);
    assert.deepEqual(await fixture.promotion.head({ scope: f.SCOPE, name: 'main' }), { rootHash: a.candidate.rootHash, generation: 1 });
  } finally { fixture.close(); }
}

async function initializeWaitsForNativeTransaction(directory) {
  let entered;
  let release;
  const reached = new Promise(resolve => { entered = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const fixture = await f.setup(directory);
  try {
    const value = await singleCandidate(fixture);
    fixture.promotion.authorize = async ({ action }) => {
      if (action !== 'COMMIT') return true;
      const head = await fixture.exchange.db.get('SELECT generation FROM gqwf_heads WHERE workspace_id=? AND name=?', 'workspace-1', 'main');
      if (head.generation !== 1) return true;
      entered(); await held; return false;
    };
    const committing = fixture.promotion.apply(value.commit).catch(error => error);
    await reached;
    let settled = false;
    const initializing = fixture.promotion.initializeHead({ scope: f.SCOPE, name: 'parallel', rootHash: value.base.rootHash })
      .then(result => { settled = true; return result; });
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(settled, false);
    const provisional = await fixture.exchange.db.get('SELECT root_hash FROM gqwf_heads WHERE workspace_id=? AND name=?', 'workspace-1', 'parallel');
    assert.equal(provisional, undefined);
    release();
    assert.match((await committing).message, /authority rejected or revoked/);
    assert.deepEqual(await initializing, { rootHash: value.base.rootHash, generation: 0 });
    assert.deepEqual(await fixture.promotion.head({ scope: f.SCOPE, name: 'parallel' }), { rootHash: value.base.rootHash, generation: 0 });
  } finally { release(); fixture.close(); }
}

async function metadataShardCannotEscape(directory) {
  const fixture = await f.setup(directory);
  let shard;
  let backup;
  try {
    const value = await singleCandidate(fixture);
    const parent = path.resolve(fixture.workspace, '.genos', 'gqwf', 'metadata', 'objects');
    shard = path.join(parent, value.world.rootHash.slice(0, 2));
    backup = path.join(fixture.directory, 'saved-shard');
    const outside = path.join(fixture.directory, 'outside-catalog');
    assert.equal(path.dirname(path.resolve(shard)), parent);
    assert.equal(path.dirname(path.resolve(backup)), path.resolve(fixture.directory));
    fs.mkdirSync(outside);
    fs.renameSync(shard, backup);
    fs.symlinkSync(outside, shard, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(fixture.promotion.apply(value.commit), /CAS shard is linked|CAS parent is linked/);
    assert.deepEqual(fs.readdirSync(outside), []);
    const head = await fixture.exchange.db.get('SELECT root_hash,generation FROM gqwf_heads WHERE workspace_id=? AND name=?', 'workspace-1', 'main');
    assert.equal(head.root_hash, value.base.rootHash);
    assert.equal(head.generation, 0);
  } finally {
    if (shard && fs.existsSync(shard) && fs.lstatSync(shard).isSymbolicLink()) fs.unlinkSync(shard);
    if (backup && fs.existsSync(backup)) fs.renameSync(backup, shard);
    fixture.close();
  }
}

async function run() {
  const temporaryRoot = path.resolve(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'gqwf-promotion-races-'));
  try {
    await duplicateCommit(path.join(directory, 'duplicate'));
    await receiverFailureIsNotVerification(path.join(directory, 'predicate'));
    await revokedAfterHeadCas(path.join(directory, 'revoked'));
    await physicalCasRechecked(path.join(directory, 'tamper'));
    await expiryAndForeignEvidence(path.join(directory, 'expiry'));
    await nativeTransactionIsolation(path.join(directory, 'isolation'));
    await corruptionAtFinalAuthorization(path.join(directory, 'final-corruption'));
    await intermediateMutexGuard(path.join(directory, 'prepare-expiry'), 'expiry');
    await intermediateMutexGuard(path.join(directory, 'prepare-authority'), 'authority');
    await intermediateHeadGuard(path.join(directory, 'prepare-base'));
    await initializeWaitsForNativeTransaction(path.join(directory, 'initialize-isolation'));
    await metadataShardCannotEscape(path.join(directory, 'metadata-shard'));
    console.log('GQWF Exchange concurrent publication, independent predicate failure, revocation and immutable CAS checks: PASS');
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), temporaryRoot);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
