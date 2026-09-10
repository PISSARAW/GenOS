async function migrateNotificationPreferenceScope(db) {
  const table = await db.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'notification_preferences'");
  if (!table?.sql || (/organization_id\s+TEXT\s+NOT\s+NULL/i.test(table.sql) && /PRIMARY\s+KEY\s*\(event_type, organization_id, project_id\)/i.test(table.sql))) return;
  await db.exec('PRAGMA foreign_keys = OFF;');
  try {
    await db.exec('BEGIN IMMEDIATE;');
    await db.exec(`CREATE TABLE notification_preferences_scoped (
      event_type TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, channels_json TEXT NOT NULL DEFAULT '["studio"]',
      threshold REAL, organization_id TEXT NOT NULL DEFAULT '', project_id TEXT NOT NULL DEFAULT '', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (event_type, organization_id, project_id)
    );
    INSERT OR IGNORE INTO notification_preferences_scoped (event_type, enabled, channels_json, threshold, organization_id, project_id, updated_at)
      SELECT event_type, enabled, channels_json, threshold, organization_id_key, project_id_key, updated_at FROM (
        SELECT event_type, enabled, channels_json, threshold,
          COALESCE(organization_id, '') AS organization_id_key,
          COALESCE(project_id, '') AS project_id_key,
          updated_at,
          ROW_NUMBER() OVER (
            PARTITION BY event_type, COALESCE(organization_id, ''), COALESCE(project_id, '')
            ORDER BY updated_at DESC, rowid DESC
          ) AS row_rank
        FROM notification_preferences
      )
      WHERE row_rank = 1;
    DROP TABLE notification_preferences;
    ALTER TABLE notification_preferences_scoped RENAME TO notification_preferences;`);
    await db.exec('COMMIT;');
  } catch (error) {
    try { await db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  } finally {
    await db.exec('PRAGMA foreign_keys = ON;');
  }
}

module.exports = { migrateNotificationPreferenceScope };
