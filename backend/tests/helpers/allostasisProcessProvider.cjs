'use strict';

const path = require('node:path');
const Database = require('better-sqlite3');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const fixture = require('./allostasisProcessFixtures.cjs');

class MeasuredProvider {
  constructor(directory, readonly = false) {
    this.db = new Database(path.join(directory, 'provider.sqlite'), { readonly });
    if (!readonly) {
      this.db.pragma('journal_mode = WAL'); this.db.pragma('synchronous = FULL');
      this.db.exec(`CREATE TABLE IF NOT EXISTS operations (
        operation_key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, status TEXT NOT NULL, receipt TEXT
      )`);
    }
  }

  close() { this.db.close(); }

  lookup(input) {
    const row = this.db.prepare('SELECT * FROM operations WHERE operation_key = ?').get(fixture.providerKey(input));
    return row?.receipt ? JSON.parse(row.receipt) : null;
  }

  perform(input) {
    const key = fixture.providerKey(input);
    const prior = this.db.prepare('SELECT * FROM operations WHERE operation_key = ?').get(key);
    if (prior) {
      if (prior.fingerprint !== digest(input)) throw new Error('Provider operation binding conflict.');
      if (!prior.receipt) throw new Error('Provider operation outcome unknown; do not repeat work.');
      return JSON.parse(prior.receipt);
    }
    if (input.exposure.status !== 'exposure_recorded' || input.exposure.operationId !== input.operationId ||
        digest(input.exposure.scope) !== digest(input.query.scope) || input.exposure.allocationDigest !== input.query.allocationDigest) {
      throw new Error('Measured provider requires the real recorded exposure.');
    }
    this.db.prepare('INSERT INTO operations VALUES (?,?,?,NULL)').run(key, digest(input), 'started');
    const start = process.hrtime.bigint();
    const startedAt = new Date().toISOString();
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    const cumulativeAmount = Number((process.hrtime.bigint() - start + 999999n) / 1000000n);
    const body = { status: 'known', ...input.query, operationId: input.operationId,
      unit: fixture.UNIT, cumulativeAmount, metricId: 'wallTimeMs', final: true, source: 'exact',
      evidenceRef: key, startedAt, finishedAt: new Date().toISOString(), providerId: 'local-wall-time' };
    const receipt = { ...body, receiptDigest: digest({ profile: 'allostasis-demo-provider/v1', ...body }) };
    this.db.prepare('UPDATE operations SET status = ?,receipt = ? WHERE operation_key = ?')
      .run('completed', JSON.stringify(receipt), key);
    return receipt;
  }

  completedCount() { return this.db.prepare("SELECT COUNT(*) AS count FROM operations WHERE status = 'completed'").get().count; }
}

module.exports = { MeasuredProvider };
