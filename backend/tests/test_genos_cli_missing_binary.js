'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const genosCli = require('../src/services/genosCli');

async function verifyMissingBinary() {
  const binaryName = path.basename(genosCli.resolveGenosBin()).toLowerCase();
  const originalExistsSync = fs.existsSync;
  fs.existsSync = function existsSyncWithoutGenos(candidate, ...args) {
    if (path.basename(String(candidate)).toLowerCase() === binaryName) return false;
    return originalExistsSync.call(this, candidate, ...args);
  };

  try {
    const asyncResult = await genosCli.runGenos(['--help']);
    assert.equal(asyncResult.ok, false);
    assert.equal(asyncResult.code, 'BIN_NOT_FOUND');
    assert.match(asyncResult.error, /cargo build -p genos-cli/);
    assert.throws(() => genosCli.runGenosSync('--help'), /genos binary not found/);
  } finally {
    fs.existsSync = originalExistsSync;
  }
}

verifyMissingBinary().then(() => {
  console.log('GenOS CLI missing-binary behavior checks passed.');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
