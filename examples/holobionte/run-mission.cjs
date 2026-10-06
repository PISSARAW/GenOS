'use strict';

const sqlite3 = require('../../backend/node_modules/sqlite3');
const { open } = require('../../backend/node_modules/sqlite');
const { runHolobiontMission } = require('../../backend/src/services/holobionteService');
const { createMissionInput } = require('./arithmetic-mission.cjs');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const result = await runHolobiontMission(db, createMissionInput());
    console.log(JSON.stringify({ status: result.status, stopped: result.stopped,
      holobiontId: result.holobiontId, result: result.completed[0].execution.result,
      usage: result.usage, lifecycle: result.lifecycle }, null, 2));
    if (result.status !== 'VERIFIED' || !result.stopped) process.exitCode = 1;
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
