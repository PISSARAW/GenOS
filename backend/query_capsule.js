const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function queryTraceSpans(db, capsuleId) {
    try {
        const spans = await db.all("SELECT span_id, name, start_time, end_time, status, payload FROM trace_spans WHERE trace_id = ?", capsuleId);
        if (Array.isArray(spans) && spans.length > 0) {
            console.log(`Found ${spans.length} trace spans for capsule ${capsuleId}:`);
            spans.forEach(s => console.log(`[${s.start_time}] ${s.name} (${s.status}) => ${String(s.payload).substring(0, 100)}...`));
        } else {
            console.log(`No trace_spans found for ${capsuleId}.`);
        }
    } catch (e) {
        console.log("No trace_spans table or error:", e.message);
    }
}

async function queryTelemetryEvents(db, capsuleId) {
    try {
        const query = "SELECT id, event_type, action, detail, payload FROM telemetry_events WHERE detail LIKE '%' || ? || '%' OR payload LIKE '%' || ? || '%'";
        const events = await db.all(query, capsuleId, capsuleId);
        if (Array.isArray(events) && events.length > 0) {
            console.log(`Found ${events.length} telemetry_events referencing ${capsuleId}:`);
            events.forEach(e => console.log(`[${e.event_type}] ${e.action}: ${e.detail}`));
        } else {
            console.log(`No telemetry_events found referencing ${capsuleId}.`);
        }
    } catch (e) {
        console.log("No telemetry_events table or error:", e.message);
    }
}

async function run() {
    const filename = process.env.GENOS_DB_PATH || process.env.DATABASE_URL || './genos.db';
    const db = await open({ filename, driver: sqlite3.Database });
    const capsuleId = process.argv[2] || process.env.GENOS_CAPSULE_ID || '01a033d1-ab3c-7d90-b515-053e2b73b36a';

    await queryTraceSpans(db, capsuleId);
    console.log("\n------------------\n");
    await queryTelemetryEvents(db, capsuleId);

    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
    console.log("\nTables available in DB:", tables.map(t => t.name).join(", "));
    await db.close();
}
run();
