'use strict';
const assert = require('node:assert/strict');
const { getDatabase, closeDatabase } = require('../src/db');
process.env.GENOS_ADMIN_PASSWORD ||= 'aeis-memory-database-test';
process.env.GENOS_DB_BACKUP_SKIP = '1';
async function main() {
  try {
    const first = await getDatabase(':memory:');
    assert.equal((await first.get('PRAGMA database_list')).file, '');
    await first.run("INSERT INTO agents (id,name,role,status) VALUES ('memory-only','memory-only','worker','idle')");
    await closeDatabase();
    const second = await getDatabase(':memory:');
    assert.equal((await second.get('PRAGMA database_list')).file, '');
    assert.equal(await second.get('SELECT id FROM agents WHERE id = ?', 'memory-only'), undefined);
    console.log('AEIS provider databases are genuinely in memory and lose state after closure: PASS');
  } finally { await closeDatabase(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
