const path = require('path');
const { getDatabase } = require(path.resolve(__dirname, '../backend/src/db'));

(async () => {
  const db = await getDatabase();
  const events = await db.all("SELECT * FROM telemetry_events ORDER BY rowid DESC LIMIT 10");
  console.log('=== telemetry_events ===');
  for (const e of events) {
    console.log(e.event_type || e.eventType, e.action, e.detail, e.severity);
  }
})();
