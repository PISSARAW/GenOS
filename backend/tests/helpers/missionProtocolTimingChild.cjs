'use strict';

const { openDatabase } = require('./biologyDatabase');

async function main() {
  const db = openDatabase(process.argv[2]);
  try {
    const binding = await require('../../src/services/missionProtocols/context').load(db, process.argv[3]);
    const result = await require('../../src/services/missionProtocols/allostasis').finish(binding);
    process.stdout.write(JSON.stringify(result));
  } finally { await db.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
