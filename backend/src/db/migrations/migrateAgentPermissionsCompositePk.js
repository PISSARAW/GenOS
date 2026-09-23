/**
 * Migration — point 18 de l'audit Agent Git : agent_permissions en PK composite.
 *
 * Avant : agent_id TEXT PRIMARY KEY → une seule ligne par agent. Le merge
 * multi-scopes (flattenPermMap retourne N lignes org/proj) provoquait une
 * collision PK à l'INSERT (replacePermissionState insère chaque ligne avec le
 * même targetAgentId).
 * Après : PRIMARY KEY (agent_id, organization_id, project_id) — un agent peut
 * avoir des permissions par scope, cohérent avec toutes les lectures
 * (mcpExecutor, platformController, mcpController) qui filtrent déjà par
 * (agent_id, organization_id, project_id).
 *
 * Rebuild de table requis (SQLite ne peut pas ALTER une PK) : copie dans une
 * table temporaire, dédoublonnée par (agent_id, organization_id, project_id)
 * en gardant la dernière ligne (rowid max).
 */

const migration = {
  name: 'V018_agent_permissions_composite_pk',
  description: 'agent_permissions: PK composite (agent_id, organization_id, project_id) pour le multi-scope',
  run: async (db) => {
    const tableInfo = await db.all('PRAGMA table_info(agent_permissions)');
    if (!tableInfo.length) return;
    const pkColumns = tableInfo.filter((c) => c.pk > 0).map((c) => c.name).sort();
    const isComposite = pkColumns.length === 3
      && pkColumns[0] === 'agent_id'
      && pkColumns[1] === 'organization_id'
      && pkColumns[2] === 'project_id';
    if (isComposite) return;

    const hasTaint = tableInfo.some((c) => c.name === 'taint_policy');
    const taintColumn = hasTaint ? 'taint_policy,' : '';
    // Bug audit #8 : rebuild TRANSACTIONNEL — sans BEGIN/COMMIT, un crash au
    // milieu (entre DROP et RENAME) laissait la DB sans table agent_permissions.
    await db.exec('BEGIN IMMEDIATE');
    try {
      await db.exec(`
        CREATE TABLE agent_permissions_v18 (
          agent_id TEXT NOT NULL,
          permissions_json TEXT NOT NULL DEFAULT '[]',
          denied_tools_json TEXT NOT NULL DEFAULT '[]',
          organization_id TEXT,
          project_id TEXT,
          ${taintColumn}
          PRIMARY KEY (agent_id, organization_id, project_id)
        );
        INSERT INTO agent_permissions_v18 (agent_id, permissions_json, denied_tools_json, organization_id, project_id)
          SELECT agent_id, permissions_json, denied_tools_json, organization_id, project_id
          FROM agent_permissions
          WHERE rowid IN (SELECT MAX(rowid) FROM agent_permissions GROUP BY agent_id, organization_id, project_id);
        DROP TABLE agent_permissions;
        ALTER TABLE agent_permissions_v18 RENAME TO agent_permissions;
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

module.exports = { migrationV018: migration };
