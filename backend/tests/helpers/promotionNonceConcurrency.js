'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const fixture = require('./promotionNonceFixture');
const { consume } = require('../../src/services/promotionVerifierNonceService');

async function assertSeparateConnections() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-nonce-concurrent-'));
  const filename = path.join(root, 'nonces.db');
  const connections = [];
  try {
    const first = await fixture.database(filename);
    connections.push(first);
    const second = await fixture.connect(filename);
    connections.push(second);
    const input = await fixture.assembly(first);
    const outcomes = await Promise.allSettled([consume(first, input), consume(second, input)]);
    assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(r => r.status === 'rejected' && r.reason.code === 'receipt_replay').length, 1);
    assert.equal(await fixture.nonceCount(first), 2);
  } finally {
    for (const connection of connections) await connection.close();
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      const file = filename + suffix;
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    fs.rmdirSync(root);
  }
}

module.exports = { assertSeparateConnections };
