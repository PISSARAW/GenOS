'use strict';

const { pack, unpack } = require('msgpackr');

const FORMAT = 'genos-capsule-secretstream-v1';
const CHUNK_BYTES = 65536;
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;
const MAX_CHUNKS = Math.ceil(MAX_PAYLOAD_BYTES / CHUNK_BYTES);

function invalid() {
  return Object.assign(new Error('Capsule is invalid or authentication failed.'), { code: 'INVALID_CAPSULE' });
}

function contextBytes(context) {
  const fields = ['domainId', 'vaultId', 'artifactId'];
  if (!context || fields.some((field) => typeof context[field] !== 'string' || !context[field])) throw invalid();
  if (!Number.isSafeInteger(context.artifactVersion) || context.artifactVersion < 1
      || !Number.isSafeInteger(context.schemaVersion) || context.schemaVersion < 1) throw invalid();
  return Buffer.from(JSON.stringify([
    context.domainId, context.vaultId, context.artifactId,
    context.artifactVersion, context.schemaVersion
  ]));
}

function validKey(key, sodium) {
  if (!(key instanceof Uint8Array) || key.length !== sodium.crypto_secretstream_xchacha20poly1305_KEYBYTES) throw invalid();
  return key;
}

function decode(value, maxBytes) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw invalid();
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > maxBytes || bytes.toString('base64') !== value) throw invalid();
  return bytes;
}

async function sealCapsule(input) {
  const sodium = require('libsodium-wrappers');
  await sodium.ready;
  const key = validKey(input.key, sodium);
  const ad = contextBytes(input.context);
  const payload = pack(input.state);
  if (payload.length > MAX_PAYLOAD_BYTES) throw invalid();
  const { state, header } = sodium.crypto_secretstream_xchacha20poly1305_init_push(key);
  const chunks = [];
  for (let offset = 0; offset < payload.length; offset += CHUNK_BYTES) {
    const end = Math.min(offset + CHUNK_BYTES, payload.length);
    const tag = end === payload.length
      ? sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
      : sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE;
    const encrypted = sodium.crypto_secretstream_xchacha20poly1305_push(state, payload.subarray(offset, end), ad, tag);
    chunks.push(Buffer.from(encrypted).toString('base64'));
  }
  return { format: FORMAT, header: Buffer.from(header).toString('base64'), chunks };
}

function requireRestoration(input) {
  const { context, authorize, minimumVersion } = input;
  contextBytes(context);
  if (typeof authorize !== 'function' || authorize({ ...context, operation: 'capsule:restore' }) !== true) {
    throw Object.assign(new Error('Fresh restore authorization is required.'), { code: 'CAPSULE_ACCESS_DENIED' });
  }
  if (!Number.isSafeInteger(minimumVersion) || minimumVersion < 1
      || context.artifactVersion < minimumVersion) {
    throw Object.assign(new Error('Capsule version is older than the restoration floor.'), { code: 'CAPSULE_ROLLBACK_DENIED' });
  }
}

function decryptChunks(input) {
  const { capsule, stream, ad, sodium } = input;
  const plaintext = [];
  for (let index = 0; index < capsule.chunks.length; index += 1) {
    const encrypted = decode(capsule.chunks[index], CHUNK_BYTES + sodium.crypto_secretstream_xchacha20poly1305_ABYTES);
    const result = sodium.crypto_secretstream_xchacha20poly1305_pull(stream, encrypted, ad);
    if (!result) throw invalid();
    const isFinal = result.tag === sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL;
    if (isFinal !== (index === capsule.chunks.length - 1)) throw invalid();
    plaintext.push(Buffer.from(result.message));
  }
  return Buffer.concat(plaintext);
}
async function openCapsule(input) {
  requireRestoration(input);
  const sodium = require('libsodium-wrappers');
  await sodium.ready;
  const { capsule, context } = input;
  if (!capsule || capsule.format !== FORMAT || !Array.isArray(capsule.chunks)
      || capsule.chunks.length < 1 || capsule.chunks.length > MAX_CHUNKS) throw invalid();
  try {
    const key = validKey(input.key, sodium);
    const ad = contextBytes(context);
    const header = decode(capsule.header, sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES);
    if (header.length !== sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES) throw invalid();
    const stream = sodium.crypto_secretstream_xchacha20poly1305_init_pull(header, key);
    return unpack(decryptChunks({ capsule, stream, ad, sodium }));
  } catch (_) {
    throw invalid();
  }
}

module.exports = { sealCapsule, openCapsule, FORMAT, CHUNK_BYTES };