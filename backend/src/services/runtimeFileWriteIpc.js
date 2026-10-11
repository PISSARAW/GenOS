'use strict';

const crypto = require('node:crypto');

let pending = Promise.resolve();

function record(path, content) {
  if (typeof process.send !== 'function') return;
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  pending = pending.then(() => new Promise((resolve, reject) => {
    process.send({ kind: 'genos.runtime.file-write/v1', path, hash }, error => {
      if (error) reject(error);
      else resolve();
    });
  }));
}

async function flush() { await pending; }

module.exports = { record, flush };
