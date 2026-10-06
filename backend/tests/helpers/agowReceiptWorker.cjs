'use strict';

const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const experience = require('../../src/services/agow/cognitiveModeExperienceService');

async function main() {
  const [filename, prefix] = process.argv.slice(2);
  if (!filename || !prefix) throw new Error('Receipt worker requires database and prefix.');
  const db = await open({ filename, driver: sqlite3.Database });
  try {
    await db.exec('PRAGMA busy_timeout=1000;');
    for (let index = 0; index < 4; index++) {
      await experience.recordDecision({ agentId: 'process-agent', db,
        receipt: { receiptId: `${prefix}:${index}`, chosenMode: 'ACT' } });
    }
  } finally { await db.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
