'use strict';
process.env.GENOS_DISABLE_DOTENV = '1';
const fs = require('node:fs');
const { openDatabase } = require('./biologyDatabase');
const { loadQualityReceipt } = require('../../src/services/qualityElevation/qualityReceiptService');
const { enforceQualityContract } = require('../../src/services/qualityElevation/workerQualityContractEnforcer');

async function run() {
  const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const db = openDatabase(input.database);
  try {
    const found = await loadQualityReceipt({ db, worker: input.worker, text: input.text });
    const evaluation = enforceQualityContract(input.worker, { output: input.text, qualityElevationReceipt: found.receipt }, null);
    process.stdout.write(JSON.stringify({ passed: evaluation.passed, sessionId: found.session.sessionId }));
  } finally { await db.close(); }
}
run().catch(error => { process.stderr.write(error.stack); process.exitCode = 1; });
