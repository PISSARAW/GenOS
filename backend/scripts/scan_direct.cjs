// Diagnostic rapide : agents + inbox, sans passer par getDatabase()
'use strict';
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB = 'C:/Users/Shadow/Documents/GitHub/Genos/backend/genos.db';

function q(sql, params, label) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) { console.log(`[ERR] ${label}:`, err.message); resolve([]); }
      else { console.log(`[OK] ${label}:`, rows.length, 'row(s)'); resolve(rows); }
    });
  });
}

async function scanOrchestrators(db) {
  console.log('--- orchestrateurs ---');
  const orgs = await q("SELECT id, name, role, status, model_tier, isolation_mode, current_task, created_at FROM agents WHERE execution_mode='orchestrator' ORDER BY created_at DESC LIMIT 5", [], 'orgs');
  orgs.forEach(o => console.log(` - ${o.id} | ${o.name} | ${o.role} | ${o.status} | ${o.model_tier} | ${o.isolation_mode} | task: ${o.current_task||'-'}`));
}

async function scanWorkers(db) {
  console.log('\n--- workers actifs ---');
  const workers = await q("SELECT id, name, role, status, fleet_id, current_task FROM agents WHERE execution_mode='worker' AND status NOT IN ('terminated','apoptosis','completed','idle') ORDER BY created_at DESC", [], 'workers');
  console.log('total workers non-terminés:', workers.length);
  workers.slice(0,10).forEach(w => console.log(` - ${w.id} | ${w.name} | ${w.role} | ${w.status} | fleet=${w.fleet_id||'-'} | task=${w.current_task||'-'}`));
}

async function scanInboxTables(db) {
  console.log('\n--- tables inbox/message ---');
  const tables = await q("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", [], 'tables');
  const inboxTables = tables.filter(t => /inbox|message|mail|queue/i.test(t.name)).map(t=>t.name);
  console.log('inbox-related tables:', inboxTables.length ? inboxTables.join(', ') : 'aucune');

  for (const tn of inboxTables) {
    await scanInboxTable(db, tn);
  }
}

async function scanInboxTable(db, tn) {
  const count = await q(`SELECT COUNT(*) as cnt FROM ${tn}`, [], `count:${tn}`);
  if (count.length) console.log(` ${tn}: ${count[0].cnt} message(s)`);
  const cols = await q(`PRAGMA table_info(${tn})`, [], `cols:${tn}`);
  const colNames = cols.map(c=>c.name);
  console.log(`   colonnes: ${colNames.join(', ')}`);
  let unreadSql = null;
  if (colNames.includes('read')) unreadSql = `SELECT COUNT(*) as cnt FROM ${tn} WHERE read = 0`;
  else if (colNames.includes('is_read')) unreadSql = `SELECT COUNT(*) as cnt FROM ${tn} WHERE is_read = 0`;
  else if (colNames.includes('status')) unreadSql = `SELECT COUNT(*) as cnt FROM ${tn} WHERE status IN ('pending','new','unread')`;
  if (unreadSql) {
    const u = await q(unreadSql, [], `unread:${tn}`);
    if (u.length) console.log(`   non-lus: ${u[0].cnt}`);
  }
  if (count.length && count[0].cnt > 0) {
    const recent = await q(`SELECT * FROM ${tn} ORDER BY created_at DESC LIMIT 3`, [], `recent:${tn}`);
    recent.forEach(m => console.log(`   - ${JSON.stringify(m).slice(0,160)}`));
  }
}

const db = new sqlite3.Database(DB);
console.log('=== GENOS SCAN (direct SQLite) ===', new Date().toISOString());
console.log('DB:', DB);
console.log('');

(async () => {
  await scanOrchestrators(db);
  await scanWorkers(db);
  await scanInboxTables(db);
  db.close();
  console.log('\n=== SCAN DIRECT COMPLETE ===');
})().catch(e => { console.error('FATAL:', e); db.close(); process.exit(1); });
