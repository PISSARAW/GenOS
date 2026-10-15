'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const protocol = require('./runtimeControlReconnectProtocol');

const FILE_ENV = 'GENOS_RUNTIME_CONTROL_SIGNING_KEY_FILE';
const ID_ENV = 'GENOS_RUNTIME_CONTROL_SIGNING_KEY_ID';
const MAX_KEY_BYTES = 16 * 1024;

function secureMode(stats) {
  return process.platform === 'win32' || (stats.mode & 0o077) === 0;
}

function publicPem(key) {
  return crypto.createPublicKey(key).export({ type: 'spki', format: 'pem' }).toString();
}

function readConfiguration(environment) {
  const filename = environment[FILE_ENV];
  const expectedId = environment[ID_ENV];
  if (!filename && !expectedId) return null;
  if (!filename || !expectedId || !path.isAbsolute(filename)) {
    throw new Error('Runtime control signing authority configuration is incomplete.');
  }
  return { filename, expectedId };
}

function readPrivateKey(filename) {
  const stats = fs.statSync(filename);
  if (!stats.isFile() || stats.size <= 0 || stats.size > MAX_KEY_BYTES || !secureMode(stats)) {
    throw new Error('Runtime control signing key file is unsafe.');
  }
  return crypto.createPrivateKey(fs.readFileSync(filename));
}

function load(environment = process.env) {
  const configuration = readConfiguration(environment);
  if (!configuration) return null;
  const { filename, expectedId } = configuration;
  const privateKey = readPrivateKey(filename);
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('Runtime control signing key must be Ed25519.');
  }
  const publicKey = publicPem(privateKey);
  const keyId = protocol.keyId(publicKey);
  if (keyId !== expectedId) throw new Error('Runtime control signing key rotation is unacknowledged.');
  return Object.freeze({ privateKey, publicKey, keyId, filename });
}

module.exports = { FILE_ENV, ID_ENV, load };
