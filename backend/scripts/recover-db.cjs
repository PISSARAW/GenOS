const { getDatabase, closeDatabase } = require('../src/db/index.js');

async function recover() {
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const db = await getDatabase();
      await db.exec('PRAGMA busy_timeout = 15000');
      const checkpoint = await db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      console.log('Checkpoint result:', JSON.stringify(checkpoint));
      const integrity = await db.get('PRAGMA integrity_check');
      console.log('Integrity:', integrity);
      const agents = await db.get('SELECT COUNT(*) as c FROM agents');
      console.log('Agents:', agents.c);
      await closeDatabase();
      console.log('DB recovered on attempt', attempt);
      return;
    } catch (e) {
      console.log('Attempt', attempt, ':', e.message);
      if (attempt < 8) { const s = require('child_process').execSync('sleep 3'); }
    }
  }
  console.log('FAILED');
  process.exit(1);
}
recover().catch(e => { console.error(e); process.exit(1); });
