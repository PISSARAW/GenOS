'use strict';

const fs = require('node:fs');
const path = require('node:path');
const mode = process.argv[2];
const payload = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const receiptFile = process.argv[4];
const biology = require('../../src/services/biologicalWorkerReceiptService');
const original = biology.record;

biology.record = async (db, request) => {
  if (mode === 'crash' && request.event.eventType === 'AGENT_COMPLETED'
      && request.event.payload?.nativeOracleRef) {
    const observed = await require('../../src/db').withTransaction(db, tx =>
      require('../../src/services/biologicalWorkerStore').observe(tx, request));
    const reader = require('./biologyDatabase').openDatabase(process.env.GENOS_DB_PATH);
    try {
      const durable = await reader.get('SELECT applied FROM biological_worker_observations WHERE run_id=? AND event_key=?',
        observed.binding.runId, observed.eventKey);
      if (durable?.applied !== 0) throw new Error('Abrupt-exit probe requires a committed, unapplied observation');
    } finally { await reader.close(); }
    fs.writeFileSync(receiptFile, JSON.stringify({ agentId: request.agentId,
      runId: request.event.payload.executionRunId, eventId: request.event.id }));
    process.exit(77);
  }
  return original(db, request);
};

const cli = path.resolve(__dirname, '../../bin/genos-orchestrate.cjs');
process.argv = [process.execPath, cli, JSON.stringify(payload)];
require(cli);
