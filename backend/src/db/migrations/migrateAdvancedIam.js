'use strict';

async function migrateAdvancedIam(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS iam_policies (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
    policy_json TEXT NOT NULL, organization_id TEXT, project_id TEXT, created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (enabled IN (0, 1)), CHECK (json_valid(policy_json)),
    CHECK ((organization_id IS NULL AND project_id IS NULL) OR (organization_id IS NOT NULL AND project_id IS NOT NULL))
  );
  CREATE INDEX IF NOT EXISTS idx_iam_policies_scope ON iam_policies(organization_id, project_id, enabled);
  CREATE TABLE IF NOT EXISTS secrets (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'workspace',
    ciphertext TEXT NOT NULL DEFAULT '', iv TEXT NOT NULL DEFAULT '', tag TEXT NOT NULL DEFAULT '',
    organization_id TEXT, project_id TEXT, provider TEXT NOT NULL DEFAULT 'local', external_ref TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, rotated_at DATETIME
  );
  CREATE INDEX IF NOT EXISTS idx_secrets_scoped_name ON secrets(name, organization_id, project_id);`);
  await ensureSecretColumns(db);
}

async function ensureSecretColumns(db) {
  const columns = new Set((await db.all('PRAGMA table_info(secrets)')).map((column) => column.name));
  if (!columns.has('provider')) await db.exec("ALTER TABLE secrets ADD COLUMN provider TEXT NOT NULL DEFAULT 'local'");
  if (!columns.has('external_ref')) await db.exec('ALTER TABLE secrets ADD COLUMN external_ref TEXT');
  if (!columns.has('organization_id')) await db.exec('ALTER TABLE secrets ADD COLUMN organization_id TEXT');
  if (!columns.has('project_id')) await db.exec('ALTER TABLE secrets ADD COLUMN project_id TEXT');
}

module.exports = { migrateAdvancedIam };
