'use strict';

const memory = require('./memory.cjs');
async function main() {
  const db = await memory.connect(process.argv[2]);
  try { console.log(JSON.stringify(await memory.restore(db, process.argv[3]))); }
  finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
