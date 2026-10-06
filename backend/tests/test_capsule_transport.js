'use strict';

const assert = require('node:assert/strict');
const sodium = require('libsodium-wrappers');
const { sealCapsule, openCapsule } = require('../src/services/capsuleTransportService');

async function main() {
  await sodium.ready;
  const key = sodium.crypto_secretstream_xchacha20poly1305_keygen();
  const context = { domainId: 'd1', vaultId: 'v1', artifactId: 'a1', artifactVersion: 3, schemaVersion: 1 };
  const authorize = (request) => request.operation === 'capsule:restore';
  const state = { text: 'x'.repeat(150000), values: [1, 2, 3] };
  const capsule = await sealCapsule({ state, context, key });
  assert.ok(capsule.chunks.length > 1);
  const input = { capsule, context, key, authorize, minimumVersion: 3 };
  assert.deepEqual(await openCapsule(input), state);
  await assert.rejects(() => openCapsule({ ...input, minimumVersion: 4 }), { code: 'CAPSULE_ROLLBACK_DENIED' });
  await assert.rejects(() => openCapsule({ ...input, authorize: () => false }), { code: 'CAPSULE_ACCESS_DENIED' });
  await assert.rejects(() => openCapsule({ ...input, context: { ...context, artifactId: 'a2' } }), { code: 'INVALID_CAPSULE' });
  await assert.rejects(() => openCapsule({ ...input, key: sodium.crypto_secretstream_xchacha20poly1305_keygen() }), { code: 'INVALID_CAPSULE' });
  await assert.rejects(() => openCapsule({ ...input, capsule: { ...capsule, chunks: capsule.chunks.slice(0, -1) } }), { code: 'INVALID_CAPSULE' });
  const reordered = [...capsule.chunks];
  [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  await assert.rejects(() => openCapsule({ ...input, capsule: { ...capsule, chunks: reordered } }), { code: 'INVALID_CAPSULE' });
  const altered = [...capsule.chunks];
  altered[0] = altered[0].slice(0, 4) + 'AAAA' + altered[0].slice(8);
  await assert.rejects(() => openCapsule({ ...input, capsule: { ...capsule, chunks: altered } }), { code: 'INVALID_CAPSULE' });
  console.log('Secretstream capsule transport authenticates chunks, context and restore version.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });