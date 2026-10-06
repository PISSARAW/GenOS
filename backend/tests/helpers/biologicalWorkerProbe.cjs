'use strict';
const { openDatabase } = require('./biologyDatabase');
const store = require('../../src/services/biologicalWorkerStore');
const biology = require('../../src/services/biologicalWorkerReceiptService');

async function main() {
  const [mode, filename, runId] = process.argv.slice(2);
  const db = openDatabase(filename);
  try {
    if (mode === 'execute') {
      const binding = await store.binding(db, runId);
      const { runProcedure } = require('../../src/services/agents/deterministicWorkerProcedures');
      const { reportFor } = require('../../src/services/agents/deterministicWorkerRuntime');
      const result = runProcedure(binding.genome.workerContract.mission.methodContract);
      const report = reportFor('procedural_executor', result);
      process.stdout.write(JSON.stringify({ result, report }));
    } else {
      await biology.recover(db, 'worker-mission');
      const receipt = await store.receipt(db, runId);
      const authority = await require('../../src/services/homeostasisAuthorityStore').active(db, 'worker-mission');
      process.stdout.write(JSON.stringify({ receipt, authority }));
    }
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
