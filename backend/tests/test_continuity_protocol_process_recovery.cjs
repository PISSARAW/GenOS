'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startNode } = require('./helpers/continuityProcessClient.cjs');
const fixture = require('./helpers/continuityProcessFixtures.cjs');

const command = operationId => ({ operationId, resourceId: 'protected-note', key: 'mission-result',
  value: operationId, cost: 1 });

function copySealedDatabase(source, destination) {
  for (const suffix of ['', '-wal']) {
    const filename = path.join(source, `handoff.sqlite${suffix}`);
    if (fs.existsSync(filename)) fs.copyFileSync(filename, path.join(destination, `handoff.sqlite${suffix}`));
  }
}

async function recoverActivation(nodes, launch) {
  const activation = fixture.messages()[3];
  await nodes.new.request('armCrash');
  const interrupted = nodes.new.request('apply', activation).then(
    () => ({ unexpectedSuccess: true }), error => ({ error: error.message }));
  await nodes.new.milestone('authority-transferred');
  await nodes.new.stop();
  assert.ok((await interrupted).error);
  assert.equal((await nodes.resource.request('authority', fixture.CONTEXT)).generation, 2);
  await nodes.resource.stop();
  nodes.resource = await launch('resource');
  nodes.new = await launch('new');
  assert.equal((await nodes.new.request('state', fixture.TRANSFER.transferId)).status, 'activation_pending');
  const recovered = await nodes.new.request('apply', activation);
  assert.equal(recovered.status, 'activated');
  assert.deepEqual(await nodes.new.request('apply', activation), recovered);
  const state = await nodes.new.request('state', fixture.TRANSFER.transferId);
  assert.deepEqual(state.bundle.obligations, fixture.BUNDLE.obligations);
  assert.deepEqual(state.bundle.unknownEffects, fixture.BUNDLE.unknownEffects);
  assert.equal(state.acceptedResponsibility.bundleDigest, fixture.TRANSFER.bundleDigest);
}

async function verifyReconnection(nodes) {
  await assert.rejects(nodes.old.request('write', command('old-write')), /stale authority/);
  await assert.rejects(nodes.old.request('write', command('late-old-write')), /stale authority/);
  const forged = { ...fixture.CONTEXT, ...command('forged-new-owner'),
    actor: fixture.actor(fixture.SUCCESSOR), generation: 2 };
  await assert.rejects(nodes.old.request('rawWrite', forged), /authorization rejected/);
  await assert.rejects(nodes.new.request('rawWrite', { ...forged,
    operationId: 'self-priced-write', cost: 0 }), /authorization rejected/);
  const accepted = await nodes.new.request('write', command('new-write'));
  assert.equal(accepted.status, 'applied');
  assert.deepEqual(await nodes.new.request('write', command('new-write')), accepted);
  const effects = await nodes.resource.request('effects', fixture.CONTEXT);
  assert.deepEqual(effects.map(effect => effect.operationId), ['old-write', 'new-write']);
  const authority = await nodes.resource.request('authority', fixture.CONTEXT);
  assert.deepEqual(authority.owner, fixture.actor(fixture.SUCCESSOR));
  assert.equal(authority.generation, 2);
  assert.equal(authority.budget.spent, 2);
  assert.equal(authority.budget.reserved, fixture.BUNDLE.budget.reserved);
  return { processes: 3, generation: authority.generation, appliedEffects: effects.length,
    staleOwnerRejected: true, crashRecoveredWithoutDuplicateAuthority: true };
}

async function scenario(directory) {
  const nodes = {};
  let disconnected = false;
  const places = Object.fromEntries(['resource', 'old', 'new'].map(role => [role, path.join(directory, role)]));
  Object.values(places).forEach(fixture.prepare);
  const launch = role => startNode({ role, directory: places[role], broker: request => {
    if (role === 'old' && disconnected) throw new Error('Demo network disconnected.');
    const identity = role === 'old' ? fixture.SOURCE : fixture.SUCCESSOR;
    return nodes.resource.request(request.action, request.value, fixture.actor(identity));
  } });
  try {
    nodes.resource = await launch('resource');
    nodes.old = await launch('old');
    await nodes.resource.request('bootstrap', fixture.bootstrap());
    await nodes.old.request('write', command('old-write'));
    const [offer, seal, accept] = fixture.messages();
    await nodes.old.request('apply', offer);
    await nodes.old.request('apply', seal);
    await nodes.old.stop();
    copySealedDatabase(places.old, places.new);
    nodes.old = await launch('old');
    nodes.new = await launch('new');
    assert.equal(new Set(Object.values(nodes).map(node => node.pid)).size, 3);
    await assert.rejects(nodes.new.request('write', command('copied-state-write')), /stale authority/);
    disconnected = true;
    await assert.rejects(nodes.old.request('write', command('offline-write')), /network disconnected/);
    await nodes.new.request('apply', accept);
    await recoverActivation(nodes, launch);
    disconnected = false;
    return await verifyReconnection(nodes);
  } finally { await Promise.all(Object.values(nodes).map(node => node.stop())); }
}

async function run() {
  const temporaryRoot = path.resolve(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'genos-continuity-process-'));
  try { console.log('CONTINUITY process recovery:', JSON.stringify(await scenario(directory))); }
  finally {
    assert.equal(path.dirname(path.resolve(directory)), temporaryRoot);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { scenario };
