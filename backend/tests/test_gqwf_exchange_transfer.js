'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const objects = require('../src/services/gqwf/objects');
const metadata = require('../src/services/gqwf/metadataStore');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const fixture = require('./helpers/gqwfExchangeTransferFixture');

async function partialTransferAndRestart() {
  const setup = await fixture.setup();
  try {
    await setup.receiver.apply(fixture.message(setup.world));
    const needed = await setup.receiver.apply(await fixture.next(setup.receiver, 'NEED_OBJECTS', { query: setup.query }));
    assert.equal(needed.objects.length, 2);
    const exported = await setup.source.exportObjects({ ...setup.query, hashes: needed.objects.map((blob) => blob.hash) });
    const first = await fixture.next(setup.receiver, 'TRANSFER', { query: setup.query,
      payload: { hash: exported[0].hash, bytesBase64: exported[0].bytesBase64 } });
    const result = await setup.receiver.apply(first);
    assert.deepEqual(await setup.receiver.apply(first), result);
    setup.receiver.close();
    setup.receiver = fixture.instance(setup.targetRoot);
    assert.equal((await setup.receiver.describe(setup.query)).received.length, 1);
    const renegotiated = await setup.receiver.apply(await fixture.next(setup.receiver, 'NEED_OBJECTS', { query: setup.query }));
    assert.deepEqual(renegotiated.objects.map((blob) => blob.hash), [exported[1].hash]);
    await setup.receiver.apply(await fixture.next(setup.receiver, 'TRANSFER', { query: setup.query,
      payload: { hash: exported[1].hash, bytesBase64: exported[1].bytesBase64 } }));
    const verify = await fixture.next(setup.receiver, 'VERIFY_WORLD', { query: setup.query });
    const verified = await setup.receiver.apply(verify);
    assert.equal(verified.status, 'verified');
    const read = await setup.receiver.verifiedWorld(setup.query);
    assert.equal(read.qualification.actionAuthorized, false);
    assert.equal(read.world.origin.kind, 'isolated');
    assert.equal(read.world.closure.assurance.sandbox, 'not-attested');
    assert.equal(read.receipt.worldDigest, digest(setup.world));
    assert.deepEqual(await setup.receiver.apply(verify), verified);
    const root = await setup.receiver.db.get('SELECT root_hash FROM gqwf_roots WHERE workspace_id = ?', setup.world.workspaceId);
    const closure = await setup.receiver.db.get('SELECT closure_hash FROM gqwf_execution_closures WHERE workspace_id = ?', setup.world.workspaceId);
    assert.equal(root.root_hash, setup.world.rootHash);
    assert.equal(closure.closure_hash, setup.world.closureHash);
    assert.equal(await metadata.readObject(setup.targetRoot, setup.world.closureHash), setup.world.closureSerialized);
    assert.equal(fs.existsSync(path.join(setup.targetRoot, 'counter.json')), false);
  } finally { fixture.cleanup(setup); }
}

async function tamperedBlobBeforeVerification() {
  const setup = await fixture.setup();
  try {
    await fixture.transferAll(setup);
    const file = setup.world.manifest.files[0];
    fs.writeFileSync(objects.blobPath(setup.targetRoot, file.hash), Buffer.alloc(file.size, 120));
    await assert.rejects(setup.receiver.apply(await fixture.next(setup.receiver, 'VERIFY_WORLD', { query: setup.query })), /integrity check failed/);
    assert.equal((await setup.receiver.describe(setup.query)).status, 'transferring');
    await assert.rejects(setup.receiver.verifiedWorld(setup.query), /not been physically verified/);
  } finally { fixture.cleanup(setup); }
}

async function unauthorizedAndForeignScope() {
  const setup = await fixture.setup();
  try {
    await fixture.transferAll(setup);
    await assert.rejects(setup.source.exportObjects({ ...setup.query,
      scope: { ...setup.query.scope, projectId: 'foreign' }, hashes: [] }), /scope or digest mismatch/);
    await assert.rejects(setup.source.verifiedWorld({ ...setup.query, missionId: 'foreign' }), /scope or digest mismatch/);
    setup.source.authorize = async () => false;
    await assert.rejects(setup.source.exportObjects({ ...setup.query, hashes: [] }), /authority rejected/);
    await assert.rejects(setup.source.describe(setup.query), /authority rejected/);
    await assert.rejects(setup.source.verifiedWorld(setup.query), /authority rejected/);
  } finally { fixture.cleanup(setup); }
}

async function unrequestedAndCorruptPayloads() {
  const setup = await fixture.setup();
  try {
    await setup.receiver.apply(fixture.message(setup.world));
    await setup.receiver.apply(await fixture.next(setup.receiver, 'NEED_OBJECTS', { query: setup.query }));
    const file = setup.world.manifest.files[0];
    const query = setup.query;
    await assert.rejects(setup.receiver.apply(await fixture.next(setup.receiver, 'TRANSFER', { query,
      payload: { hash: 'f'.repeat(64), bytesBase64: 'eA==' } })), /unrequested/);
    await assert.rejects(async () => setup.receiver.apply(await fixture.next(setup.receiver, 'TRANSFER', { query,
      payload: { hash: file.hash, bytesBase64: 'AAAA=' } })), /canonical base64|base64 is not canonical/);
    await assert.rejects(setup.receiver.apply(await fixture.next(setup.receiver, 'TRANSFER', { query,
      payload: { hash: file.hash, bytesBase64: Buffer.alloc(file.size).toString('base64') } })), /hash or size mismatch/);
    await assert.rejects(setup.source.exportObjects({ ...query, hashes: ['f'.repeat(64)] }), /outside offered world/);
  } finally { fixture.cleanup(setup); }
}

async function main() {
  await partialTransferAndRestart();
  await tamperedBlobBeforeVerification();
  await unauthorizedAndForeignScope();
  await unrequestedAndCorruptPayloads();
  console.log('GQWF Exchange separate CAS stores, missing objects, restart and integrity passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
