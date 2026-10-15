'use strict';
// Lecture seule d'une DB GenOS (progression d'une mission).
const Database = require('better-sqlite3');

const db = new Database(process.argv[2], { readonly: true });
const agents = db.prepare('SELECT id, status, substr(current_task,1,80) AS task FROM agents ORDER BY created_at DESC LIMIT 12').all();
for (const row of agents) console.log(`${row.status} ${row.id} :: ${row.task}`);
console.log('--- telemetry (dernieres) ---');
const events = db.prepare('SELECT event_type, substr(detail,1,100) AS detail FROM telemetry_events ORDER BY created_at DESC LIMIT 12').all();
for (const row of events) console.log(`${row.event_type} :: ${row.detail}`);
