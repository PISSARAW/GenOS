'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { error } = require('./gvxContracts');

async function readRecord(options, id) {
  const file = recordPath(options.root, id);
  let text;
  try {
    if ((await fs.lstat(file)).isSymbolicLink()) throw error('GVX_EXECUTION_RECORD_LINK');
    text = await fs.readFile(file, 'utf8');
  } catch (failure) { if (failure.code === 'ENOENT') return null; throw failure; }
  const record = JSON.parse(text);
  if (!crypto.verify(null, Buffer.from(JSON.stringify(record.payload)), options.publicKey,
    Buffer.from(record.signature || '', 'base64'))) throw error('GVX_EXECUTION_RECORD_TAMPERED');
  return record.payload;
}

async function writeRecord(options, payload) {
  const record = { payload, signature: crypto.sign(null, Buffer.from(JSON.stringify(payload)),
    options.privateKey).toString('base64') };
  await fs.mkdir(options.root, { recursive: true, mode: 0o700 });
  try { await fs.writeFile(recordPath(options.root, payload.executionId), JSON.stringify(record), { flag: 'wx', mode: 0o600 }); }
  catch (failure) { if (failure.code !== 'EEXIST') throw failure; }
  const saved = await readRecord(options, payload.executionId);
  if (JSON.stringify(saved) !== JSON.stringify(payload)) throw error('GVX_EXECUTION_RECORD_CONFLICT');
  return saved;
}

function recordPath(root, id) {
  if (!/^[a-f0-9]{64}$/.test(id || '')) throw error('GVX_EXECUTION_ID_INVALID');
  return path.join(root, `${id}.json`);
}

module.exports = { readRecord, writeRecord };
