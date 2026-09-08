const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function run() {
    const db = await open({
      filename: './genos.db',
      driver: sqlite3.Database
    });

    const capsuleId = '01a033d1-ab3c-7d90-b515-053e2b73b36a';
    
    // Attempt to fetch from trace_spans
    try {
        const spans = await db.all("SELECT span_id, name, start_time, end_time, status, payload FROM trace_spans WHERE trace_id = ?", capsuleId);
        if (spans && spans.length > 0) {
            console.log(`Found ${spans.length} trace spans for capsule ${capsuleId}:`);
            spans.forEach(s => console.log(`[${s.start_time}] ${s.name} (${s.status}) => ${s.payload.substring(0, 100)}...`));
        } else {
            console.log(`No trace_spans found for ${capsuleId}.`);
        }
    } catch (e) {
        console.log("No trace_spans table or error:", e.message);
    }

    console.log("\n------------------\n");

    try {
        const events = await db.all("SELECT id, event_type, action, detail, payload FROM telemetry_events WHERE detail LIKE '%' || ? || '%' OR payload LIKE '%' || ? || '%'", capsuleId, capsuleId);
        if (events && events.length > 0) {
            console.log(`Found ${events.length} telemetry_events referencing ${capsuleId}:`);
            events.forEach(e => console.log(`[${e.event_type}] ${e.action}: ${e.detail}`));
        } else {
            console.log(`No telemetry_events found referencing ${capsuleId}.`);
        }
    } catch (e) {
        console.log("No telemetry_events table or error:", e.message);
    }
    
    // Just list tables in case it's named something else
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
    console.log("\nTables available in DB:", tables.map(t => t.name).join(", "));
}
run();
