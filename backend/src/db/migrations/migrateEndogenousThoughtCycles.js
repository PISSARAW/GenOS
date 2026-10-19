'use strict';

const TABLE = /^[a-z_]+$/;

function legacyConstraint(sql) {
  return /UNIQUE\s*\(\s*organization_id\s*,\s*project_id\s*,\s*episode_id\s*\)/i.test(sql || '');
}

function upgradedCreate(sql, table, temporary) {
  const declaration = new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?[\"\\[]?${table}[\"\\]]?`, 'i');
  return sql.replace(declaration, `CREATE TABLE ${temporary}`)
    .replace(/,\s*UNIQUE\s*\(\s*organization_id\s*,\s*project_id\s*,\s*episode_id\s*\)/i, '');
}

async function upgradeEpisodeMultiplicity(db, table) {
  if (!TABLE.test(table)) throw new TypeError('A trusted migration table is required.');
  const row = await db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", table);
  if (!legacyConstraint(row?.sql)) return false;
  const temporary = `${table}_cycle_upgrade`;
  const columns = (await db.all(`PRAGMA table_info(${table})`)).map((item) => item.name);
  if (!columns.length) throw new Error(`Cannot inspect ${table} for ETT cycle migration.`);
  const names = columns.map((name) => `"${name}"`).join(',');
  const create = upgradedCreate(row.sql, table, temporary);
  await db.exec('PRAGMA foreign_keys=OFF');
  try {
    await db.exec(`BEGIN IMMEDIATE;
      ${create};
      INSERT INTO ${temporary} (${names}) SELECT ${names} FROM ${table};
      DROP TABLE ${table};
      ALTER TABLE ${temporary} RENAME TO ${table};
      COMMIT;`);
  } catch (error) {
    try { await db.exec('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    await db.exec('PRAGMA foreign_keys=ON');
  }
  return true;
}

module.exports = { upgradeEpisodeMultiplicity };
