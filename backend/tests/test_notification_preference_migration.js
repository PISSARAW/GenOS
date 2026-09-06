const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { migrateNotificationPreferenceScope } = require('../src/db/schema-migrations');

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-notification-migration-'));
  const databasePath = path.join(directory, 'legacy.db');
  const db = await open({ filename: databasePath, driver: sqlite3.Database });
  try {
    await db.exec(`CREATE TABLE notification_preferences (
      event_type TEXT PRIMARY KEY, enabled INTEGER NOT NULL, channels_json TEXT NOT NULL,
      threshold REAL, organization_id TEXT, project_id TEXT, updated_at DATETIME
    );`);
    await db.run("INSERT INTO notification_preferences VALUES ('error', 1, '[\"studio\"]', 0.5, 'org-a', 'project-a', CURRENT_TIMESTAMP)");
    await migrateNotificationPreferenceScope(db);
    const row = await db.get('SELECT * FROM notification_preferences WHERE event_type = ?', 'error');
    assert.equal(row.organization_id, 'org-a');
    assert.equal(row.project_id, 'project-a');
  } finally {
    await db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
  console.log('Notification preference scope migration passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });