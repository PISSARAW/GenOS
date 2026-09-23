/**
 * Migration — bug audit #4 : les colonnes PK NULL contournent l'unicité.
 *
 * V018 a créé PRIMARY KEY (agent_id, organization_id, project_id) mais a laissé
 * organization_id/project_id NULLables. En SQLite, NULL != NULL dans une PK :
 * le pattern de platformController (INSERT OR REPLACE sans org/proj) créait
 * une NOUVELLE ligne à chaque appel (prouvé: 4 lignes identiques après 3 appels).
 *
 * V019 : normalise les NULL en chaîne vide '' et rend les colonnes NOT NULL.
 * Rebuild de table requis, dans une TRANSACTION (bug audit #8 : V018 n'en avait
 * pas — un crash au milieu laissait la DB sans table agent_permissions).
 */

const migration = {
  name: 'V019_agent_permissions_not_null_scope',
  description: 'agent_permissions: organization_id/project_id NOT NULL DEFAULT \'\' — les NULL contournent la PK composite',
  run: async (db) => {
    const tableInfo = await db.all('PRAGMA table_info(agent_permissions)');
    if (!tableInfo.length) return;
    const orgCol = tableInfo.find((c) => c.name === 'organization_id');
    const projCol = tableInfo.find((c) => c.name === 'project_id');
    if (!orgCol || !projCol) return;
    // Déjà migré (NOT NULL) : rien à faire.
    if (orgCol.notnull && projCol.notnull) return;

    const hasTaint = tableInfo.some((c) => c.name === 'taint_policy');
    const taintColumn = hasTaint ? 'taint_policy,' : '';
    await db.exec('BEGIN IMMEDIATE');
    try {
      await db.exec(`
        CREATE TABLE agent_permissions_v19 (
          agent_id TEXT NOT NULL,
          permissions_json TEXT NOT NULL DEFAULT '[]',
          denied_tools_json TEXT NOT NULL DEFAULT '[]',
          organization_id TEXT NOT NULL DEFAULT '',
          project_id TEXT NOT NULL DEFAULT '',
          ${taintColumn}
          PRIMARY KEY (agent_id, organization_id, project_id)
        );
        INSERT INTO agent_permissions_v19 (agent_id, permissions_json, denied_tools_json, organization_id, project_id ${hasTaint ? ', taint_policy' : ''})
          SELECT agent_id, permissions_json, denied_tools_json,
                 COALESCE(organization_id, ''), COALESCE(project_id, '') ${hasTaint ? ', taint_policy' : ''}
          FROM agent_permissions
          WHERE rowid IN (
            SELECT MAX(rowid) FROM (
              SELECT rowid, agent_id, COALESCE(organization_id, '') AS o, COALESCE(project_id, '') AS p
              FROM agent_permissions
            ) GROUP BY agent_id, o, p
          );
        DROP TABLE agent_permissions;
        ALTER TABLE agent_permissions_v19 RENAME TO agent_permissions;
        CREATE INDEX IF NOT EXISTS idx_agent_permissions_agent ON agent_permissions(agent_id);
      `);
      await db.exec('COMMIT');
    } catch (err) {
      await db.exec('ROLLBACK');
      throw err;
    }
  },
};

const { migrationRunners } = require('./registry');
migrationRunners.push(migration);

module.exports = { migrationV019: migration };
