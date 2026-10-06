'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function loadProvider() {
  const source = process.env.GENOS_SHEV_ACTION_MODULE;
  const expected = process.env.GENOS_SHEV_ACTION_SHA256;
  if (!source || !/^[a-f0-9]{64}$/.test(expected || '')) throw new Error('SHEV host action provider is not configured.');
  const file = path.resolve(source);
  const actual = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (actual !== expected) throw new Error('SHEV host action provider digest mismatch.');
  delete require.cache[require.resolve(file)];
  return require(file);
}

function adapter(name) {
  const provider = loadProvider();
  if (typeof provider[name] !== 'function') throw new Error(`SHEV host adapter is missing: ${name}`);
  return provider[name].bind(provider);
}

module.exports = { adapter, loadProvider };
