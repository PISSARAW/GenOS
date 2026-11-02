'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { withTransaction } = require('../src/db');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const objects = require('../src/services/gqwf/objects');
const metadata = require('../src/services/gqwf/metadataStore');
const fixture = require('./helpers/gqwfExchangeTransferFixture');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function parentJunctionRejected() {
  const setup = await fixture.setup();
  const outside = path.join(setup.directory, 'outside');
  const parent = path.join(setup.targetRoot, '.genos', 'gqwf', 'blobs');
  try {
    await setup.receiver.assertSafeCas();
    fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'sentinel.txt'), 'unchanged');
    fs.rmdirSync(parent);
    fs.symlinkSync(outside, parent, process.platform === 'win32' ? 'junction' : 'dir');
    await setup.receiver.apply(fixture.message(setup.world));
    await assert.rejects(setup.receiver.apply(await fixture.next(setup.receiver, 'NEED_OBJECTS', { query: setup.query })), /parent is linked or unsafe/);
    assert.deepEqual(fs.readdirSync(outside), ['sentinel.txt']);
    assert.equal(fs.readFileSync(path.join(outside, 'sentinel.txt'), 'utf8'), 'unchanged');
  } finally {
    if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink()) fs.unlinkSync(parent);
    fixture.cleanup(setup);
  }
}

async function metadataJunctionRejected() {
  const setup = await fixture.setup();
  const outside = path.join(setup.directory, 'metadata-outside');
  const parent = path.join(setup.targetRoot, '.genos', 'gqwf', 'metadata', 'objects');
  try {
    await setup.receiver.assertSafeCas();
    await fixture.transferAll(setup);
    fs.mkdirSync(outside);
    fs.rmdirSync(parent);
    fs.symlinkSync(outside, parent, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(setup.receiver.apply(await fixture.next(setup.receiver, 'VERIFY_WORLD', { query: setup.query })), /parent is linked or unsafe/);
    assert.deepEqual(fs.readdirSync(outside), []);
  } finally {
    if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink()) fs.unlinkSync(parent);
    fixture.cleanup(setup);
  }
}

async function linkedLeafRejected() {
  const setup = await fixture.setup();
  try {
    const file = setup.world.manifest.files[0];
    const outside = path.join(setup.directory, 'outside-blob');
    fs.writeFileSync(outside, setup.content.get(file.hash));
    const target = objects.blobPath(setup.targetRoot, file.hash);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.linkSync(outside, target);
    await setup.receiver.apply(fixture.message(setup.world));
    await assert.rejects(setup.receiver.apply(await fixture.next(setup.receiver, 'NEED_OBJECTS', { query: setup.query })), /private regular file/);
    assert.deepEqual(fs.readFileSync(outside), setup.content.get(file.hash));
  } finally { fixture.cleanup(setup); }
}

async function remotePathsAndChangedMetadataRejected() {
  const setup = await fixture.setup();
  try {
    const malicious = structuredClone(setup.world);
    malicious.manifest.files[0].path = '../outside';
    await assert.rejects(setup.receiver.apply(fixture.message(malicious)), /relative|path|invalid|escape/i);
    await assert.rejects(async () => setup.receiver.apply(fixture.message(setup.world, 'OFFER_WORLD',
      { payload: { world: setup.world, workspaceRoot: setup.sourceRoot } })), /contract/);
    await fixture.transferAll(setup);
    await setup.receiver.apply(await fixture.next(setup.receiver, 'VERIFY_WORLD', { query: setup.query }));
    const closurePath = metadata.objectPath(setup.targetRoot, setup.world.closureHash);
    fs.writeFileSync(closurePath, 'tampered');
    await assert.rejects(setup.receiver.verifiedWorld(setup.query), /integrity check failed/);
    fs.writeFileSync(closurePath, setup.world.closureSerialized);
    setup.receiver.store.raw.prepare('UPDATE gqwf_execution_closures SET manifest_json = ? WHERE closure_hash = ?')
      .run('{}', setup.world.closureHash);
    await assert.rejects(setup.receiver.verifiedWorld(setup.query), /index mismatch/);
  } finally { fixture.cleanup(setup); }
}

async function revocationAndVerifierTampering() {
  const setup = await fixture.setup();
  try {
    await fixture.transferAll(setup);
    let granted = true;
    setup.receiver.authorize = async () => granted;
    setup.receiver.verifyWorld = async (request) => {
      granted = false;
      return { status: 'validated', requestDigest: digest(request), receiptDigest: digest('verification') };
    };
    await assert.rejects(setup.receiver.apply(await fixture.next(setup.receiver, 'VERIFY_WORLD', { query: setup.query })), /authority rejected or revoked/);
    assert.equal(setup.receiver.store.state(setup.query).status, 'transferring');
    granted = true;
    setup.receiver.verifyWorld = async (request) => {
      const file = setup.world.manifest.files[0];
      fs.writeFileSync(objects.blobPath(setup.targetRoot, file.hash), Buffer.alloc(file.size, 120));
      return { status: 'validated', requestDigest: digest(request), receiptDigest: digest('verification') };
    };
    await assert.rejects(setup.receiver.apply(await fixture.next(setup.receiver, 'VERIFY_WORLD', { query: setup.query })), /integrity check failed/);
    assert.equal(setup.receiver.store.state(setup.query).status, 'transferring');
  } finally { fixture.cleanup(setup); }
}

async function sharedNativeTransactionIsolation() {
  const setup = await fixture.setup();
  const entered = deferred();
  const release = deferred();
  try {
    await setup.receiver.apply(fixture.message(setup.world));
    const original = setup.receiver.store.state(setup.query);
    const transaction = withTransaction(setup.receiver.db, async () => {
      const uncommitted = { ...original, status: 'uncommitted-native-transaction' };
      setup.receiver.store.raw.prepare('UPDATE gqwf_exchange_worlds SET state = ?').run(JSON.stringify(uncommitted));
      entered.resolve();
      await release.promise;
      throw new Error('rollback native transaction');
    });
    await entered.promise;
    let settled = false;
    const reading = setup.receiver.describe(setup.query).then((value) => { settled = true; return value; });
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
    assert.equal(settled, false);
    release.resolve();
    await assert.rejects(transaction, /rollback native transaction/);
    assert.equal((await reading).status, 'offered');
    const needed = await setup.receiver.apply(await fixture.next(setup.receiver, 'NEED_OBJECTS', { query: setup.query }));
    assert.equal(needed.status, 'requested');
  } finally { release.resolve(); fixture.cleanup(setup); }
}

async function expirationAfterFinalCasRead() {
  const setup = await fixture.setup();
  try {
    await fixture.transferAll(setup);
    let now = fixture.NOW;
    setup.receiver.clock = () => now;
    const readMetadata = setup.receiver.cas.readMetadata.bind(setup.receiver.cas);
    setup.receiver.cas.readMetadata = async (hash) => {
      const result = await readMetadata(hash);
      if (hash === setup.world.closureHash) now = '2026-11-03T10:00:00.000Z';
      return result;
    };
    await assert.rejects(setup.receiver.apply(await fixture.next(setup.receiver, 'VERIFY_WORLD', { query: setup.query })), /expired/);
    assert.equal(setup.receiver.store.state(setup.query).status, 'transferring');
  } finally { fixture.cleanup(setup); }
}

async function finalTransactionAuthorizationTampering() {
  const setup = await fixture.setup();
  try {
    await fixture.transferAll(setup);
    let checks = 0;
    setup.receiver.authorize = async ({ operation, request }) => {
      if (operation === 'APPLY' && request.type === 'VERIFY_WORLD') {
        checks += 1;
        if (checks === 3) {
          const file = setup.world.manifest.files[0];
          fs.writeFileSync(objects.blobPath(setup.targetRoot, file.hash), Buffer.alloc(file.size, 120));
        }
      }
      return true;
    };
    await assert.rejects(setup.receiver.apply(await fixture.next(setup.receiver, 'VERIFY_WORLD', { query: setup.query })), /integrity check failed/);
    assert.equal(checks, 3);
    assert.equal(setup.receiver.store.state(setup.query).status, 'transferring');
    const indexed = await setup.receiver.db.get('SELECT COUNT(*) AS count FROM gqwf_roots WHERE workspace_id = ? AND root_hash = ?',
      setup.world.workspaceId, setup.world.rootHash);
    assert.equal(indexed.count, 0);
    assert.equal(setup.receiver.store.history().filter((event) => event.message.type === 'VERIFY_WORLD').length, 0);
  } finally { fixture.cleanup(setup); }
}

async function replayVerificationAfterAuthorizationTampering() {
  const setup = await fixture.setup();
  try {
    await fixture.transferAll(setup);
    const verification = await fixture.next(setup.receiver, 'VERIFY_WORLD', { query: setup.query });
    await setup.receiver.apply(verification);
    let checks = 0;
    setup.receiver.authorize = async ({ operation, request }) => {
      if (operation === 'APPLY' && request.type === 'VERIFY_WORLD') {
        checks += 1;
        if (checks === 2) {
          const file = setup.world.manifest.files[0];
          fs.writeFileSync(objects.blobPath(setup.targetRoot, file.hash), Buffer.alloc(file.size, 120));
        }
      }
      return true;
    };
    await assert.rejects(setup.receiver.apply(verification), /integrity check failed/);
    assert.equal(checks, 2);
    assert.equal(setup.receiver.store.history().filter((event) => event.message.type === 'VERIFY_WORLD').length, 1);
  } finally { fixture.cleanup(setup); }
}

async function main() {
  await parentJunctionRejected();
  await metadataJunctionRejected();
  await linkedLeafRejected();
  await remotePathsAndChangedMetadataRejected();
  await revocationAndVerifierTampering();
  await sharedNativeTransactionIsolation();
  await expirationAfterFinalCasRead();
  await finalTransactionAuthorizationTampering();
  await replayVerificationAfterAuthorizationTampering();
  console.log('GQWF Exchange CAS confinement, scoped reads, callback races and native transaction isolation passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
