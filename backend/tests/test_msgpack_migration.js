const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { unpack } = require('msgpackr');
const { migrateToMsgPack } = require('../bin/migrate_msgpack');

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec("CREATE TABLE trajectories (diff_lines TEXT); CREATE TABLE genome_decisions (cart_nodes_json TEXT);");
  await db.run("INSERT INTO trajectories (diff_lines) VALUES ('[\"file.js\"]')");
  await db.run("INSERT INTO genome_decisions (cart_nodes_json) VALUES ('[{\"id\":1}]')");

  assert.deepEqual(await migrateToMsgPack(db), { migratedTrajs: 1, migratedDecs: 1 });
  const trajectory = await db.get('SELECT diff_lines_msgpack FROM trajectories');
  const decision = await db.get('SELECT cart_nodes_msgpack FROM genome_decisions');
  assert.deepEqual(unpack(trajectory.diff_lines_msgpack), ['file.js']);
  assert.deepEqual(unpack(decision.cart_nodes_msgpack), [{ id: 1 }]);
  assert.deepEqual(await migrateToMsgPack(db), { migratedTrajs: 0, migratedDecs: 0 });

  await db.close();
  console.log('MsgPack migration checks passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });