#!/usr/bin/env node
'use strict';

const { pendingEvaluation } = require('../src/services/indicatorRegistryService');

async function main() {
  if (process.argv[2] === 'evaluate') {
    const { evaluateReceiptSet } = require('../src/services/indicatorReceiptService');
    const input = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
    const receipts = Array.isArray(input) ? input : (Array.isArray(input.receipts) ? input.receipts : [input]);
    const evaluation = evaluateReceiptSet(receipts);
    if (process.argv.includes('--persist')) {
      const { getDatabase, closeDatabase } = require('../src/db');
      try {
        const db = await getDatabase();
        const { persistIndicatorEvaluation } = require('../src/services/indicatorEvaluationPersistenceService');
        const persisted = await persistIndicatorEvaluation(db, evaluation);
        evaluation.persistence = { receiptId: persisted.receiptId, payloadHash: persisted.payloadHash };
      } finally {
        await closeDatabase();
      }
    }
    process.stdout.write(`${JSON.stringify(evaluation, null, 2)}\n`);
  } else {
    const profile = process.argv[2] || 'node-runtime';
    process.stdout.write(`${JSON.stringify(pendingEvaluation(profile), null, 2)}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
