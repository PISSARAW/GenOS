'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function databasePath(argv) {
  const index = argv.indexOf('--db');
  if (index < 0 || !argv[index + 1] || argv[index + 1] === ':memory:') {
    throw new Error('usage: provision-gvx-ledger-key.cjs --db PATH');
  }
  return path.resolve(argv[index + 1]);
}

function provision(dbPath) {
  const secretPath = `${dbPath}.gvx-ledger-hmac`;
  const secret = crypto.randomBytes(32).toString('hex');
  let descriptor;
  try {
    descriptor = fs.openSync(secretPath, 'wx', 0o600);
    fs.writeFileSync(descriptor, secret);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (descriptor !== undefined) fs.unlinkSync(secretPath);
    throw error;
  }
  return secretPath;
}

function main(argv = process.argv.slice(2)) {
  const secretPath = provision(databasePath(argv));
  process.stdout.write(`GVX ledger signing key provisioned at ${secretPath}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { databasePath, provision };
