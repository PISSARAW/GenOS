const sqlite3 = require('sqlite3').verbose();
const dbPath = process.env.GENOS_DB_PATH || 'genos.db';
const db = new sqlite3.Database(dbPath);
db.serialize(() => {
    console.log("=== TELEMETRY ===");
    db.all(`SELECT * FROM telemetry_events ORDER BY id DESC LIMIT 5`, (err, rows) => {
        if (err) console.error(err);
        else console.log(JSON.stringify(rows, null, 2));
    });
    console.log("=== TRAJECTORIES ===");
    db.all(`SELECT * FROM trajectories ORDER BY id DESC LIMIT 5`, (err, rows) => {
        if (err) console.error(err);
        else console.log(JSON.stringify(rows, null, 2));
    });
});
db.close();
// test