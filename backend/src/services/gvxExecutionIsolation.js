'use strict';

const { error } = require('./gvxContracts');

function executionIdentity(profile) {
  const identity = profile.executionIdentity;
  if (!identity) {
    if (process.env.GENOS_GVX_REQUIRE_EXECUTION_IDENTITY === '1') throw error('GVX_EXECUTION_IDENTITY_REQUIRED');
    return {};
  }
  if (process.platform === 'win32' || typeof process.getuid !== 'function') throw error('GVX_EXECUTION_IDENTITY_UNSUPPORTED');
  if (!Number.isInteger(identity.uid) || identity.uid <= 0 || identity.uid === process.getuid()
      || !Number.isInteger(identity.gid) || identity.gid <= 0) throw error('GVX_EXECUTION_IDENTITY_INVALID');
  return { uid: identity.uid, gid: identity.gid };
}

function validateSigningKey(file) {
  if (process.env.GENOS_GVX_REQUIRE_EXECUTION_IDENTITY !== '1') return;
  if (!file || process.platform === 'win32') throw error('GVX_PRIVATE_KEY_FILE_ISOLATION_REQUIRED');
  const info = require('node:fs').statSync(file);
  if (info.uid !== process.getuid() || (info.mode & 0o077) !== 0) throw error('GVX_PRIVATE_KEY_PERMISSIONS_INVALID');
}

module.exports = { executionIdentity, validateSigningKey };
