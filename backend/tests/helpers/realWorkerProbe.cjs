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
    await require('../../src/services/biologicalWorkerStore').observe(db, request);
    fs.writeFileSync(receiptFile, JSON.stringify({ agentId: request.agentId,
      runId: request.event.payload.executionRunId, eventId: request.event.id }));
    process.exit(77);
  }
  return original(db, request);
};

const cli = path.resolve(__dirname, '../../bin/genos-orchestrate.cjs');
process.argv = [process.execPath, cli, JSON.stringify(payload)];
require(cli);
