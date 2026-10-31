'use strict';
const assert = require('node:assert/strict');
const { promisify } = require('node:util');
const sqlite = require('sqlite3');
const { assertActiveSource } = require('../../benchmarks/qwen-worker-missions/relay-11.cjs');

async function main() {
  const raw = new sqlite.Database(':memory:');
  const exec = promisify(raw.exec.bind(raw));
  const db = { get: promisify(raw.get.bind(raw)) };
  try {
    await exec("CREATE TABLE missions(mission_id TEXT,status TEXT); CREATE TABLE biological_worker_bindings(run_id TEXT,mission_id TEXT); INSERT INTO missions VALUES ('mission','active'); INSERT INTO biological_worker_bindings VALUES ('source','mission');");
    await assertActiveSource(db, 'source');
    for (const status of ['dormant', 'completed', 'failed', 'cancelled']) {
      await exec(`UPDATE missions SET status='${status}'`);
      const before = await db.get('SELECT total_changes() AS count');
      await assert.rejects(assertActiveSource(db, 'source'), { code: 'HANDOFF_MISSION_INACTIVE' });
      assert.deepEqual(await db.get('SELECT total_changes() AS count'), before);
    }
    await assert.rejects(assertActiveSource(db, 'missing'), { code: 'HANDOFF_MISSION_INACTIVE' });
  } finally { await promisify(raw.close.bind(raw))(); }
  console.log('Active source required before relay mutation; terminal missions remain closed: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
