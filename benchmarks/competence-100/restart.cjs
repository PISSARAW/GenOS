'use strict';

const agent = require('./agent.cjs');

async function main() {
  const db = await agent.connect(process.argv[2]);
  try { process.stdout.write(JSON.stringify({ stateHash: await agent.stateHash(db) })); }
  finally { await db.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
