'use strict';

const crypto = require('node:crypto');
const { pack, unpack } = require('msgpackr');

const FORMAT = 'genos-spore-v1';
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

function contextBytes(context) {
  const fields = ['domainId', 'vaultId', 'artifactId'];
  if (!context || fields.some((field) => typeof context[field] !== 'string' || !context[field])) {
    throw new Error('INVALID_SPORE_CONTEXT: Domain, vault and artifact IDs are required');
  }
  if (!Number.isSafeInteger(context.artifactVersion) || context.artifactVersion < 1
      || !Number.isSafeInteger(context.schemaVersion) || context.schemaVersion < 1) {
    throw new Error('INVALID_SPORE_CONTEXT: Positive artifact and schema versions are required');
  }
  return Buffer.from(JSON.stringify([
    context.domainId, context.vaultId, context.artifactId,
    context.artifactVersion, context.schemaVersion
  ]));
}

function deriveKey(salt) {
  const master = process.env.GENOS_SECRET_KEY;
  if (!master) throw new Error('GENOS_SECRET_KEY must be configured to seal spores');
  return crypto.scryptSync(master, Buffer.concat([Buffer.from(FORMAT), salt]), 32, SCRYPT_PARAMS);
}

function decode(value, length) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error('INVALID_SPORE: Invalid binary encoding');
  }
  const bytes = Buffer.from(value, 'base64');
  if (length && bytes.length !== length) throw new Error('INVALID_SPORE: Invalid binary length');
  return bytes;
}

function sealState(state, context) {
  const associatedData = contextBytes(context);
  const salt = crypto.randomBytes(16);
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(salt), nonce);
  cipher.setAAD(associatedData);
  const ciphertext = Buffer.concat([cipher.update(pack(state)), cipher.final()]);
  return {
    format: FORMAT,
    salt: salt.toString('base64'),
    nonce: nonce.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

function openState(spore, context, authorize) {
  const associatedData = contextBytes(context);
  if (typeof authorize !== 'function' || authorize({ ...context, operation: 'spore:thaw' }) !== true) {
    throw new Error('SPORE_ACCESS_DENIED: Fresh authorization is required');
  }
  if (!spore || spore.format !== FORMAT) throw new Error('INVALID_SPORE: Unsupported format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(decode(spore.salt, 16)), decode(spore.nonce, 12));
  decipher.setAAD(associatedData);
  decipher.setAuthTag(decode(spore.tag, 16));
  return unpack(Buffer.concat([decipher.update(decode(spore.ciphertext)), decipher.final()]));
}

module.exports = { sealState, openState };
