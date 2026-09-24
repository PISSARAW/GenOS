async function migrateAgentStatusConstraint(db) {
  const rows = await db.all("SELECT sql FROM sqlite_master WHERE type='table' AND name='agents'");
  if (!rows || rows.length === 0) return;
  const sql = rows[0].sql;
  if (sql.includes("'unverified'")) return;

  // Get all triggers and check which are corrupted
  const allTriggers = await db.all("SELECT name, sql FROM sqlite_master WHERE type='trigger'");
  const tableNames = new Set((await db.all("SELECT name FROM sqlite_master WHERE type='table'")).map(t => t.name));
  const corruptedTriggers = [];
  const validTriggers = [];

  for (const t of allTriggers) {
    const refs = t.sql.match(/NEW\.(\w+)/g) || [];
    const newCols = refs.map(r => r.replace('NEW.', ''));
    const onMatch = t.sql.match(/ON\s+(\w+)/);
    if (!onMatch) { validTriggers.push(t); continue; }
    const tableName = onMatch[1];
    if (!tableNames.has(tableName)) { corruptedTriggers.push(t); continue; }
    const cols = await db.all('PRAGMA table_info(' + tableName + ')');
    const realCols = new Set(cols.map(c => c.name));
    const missing = newCols.filter(c => !realCols.has(c));
    if (missing.length > 0) corruptedTriggers.push(t);
    else validTriggers.push(t);
  }

  // Drop ALL triggers (will recreate valid ones after)
  for (const t of allTriggers) {
    await db.exec('DROP TRIGGER IF EXISTS ' + t.name);
  }

  // Get actual columns from existing table
  const cols = await db.all('PRAGMA table_info(agents)');
  const colDefs = cols.map(c => {
    let def = c.name + ' ' + c.type;
    if (c.notnull) def += ' NOT NULL';
    if (c.dflt_value !== null) def += ' DEFAULT ' + c.dflt_value;
    if (c.pk) def += ' PRIMARY KEY';
    return def;
  });

  // Build CREATE TABLE with fixed status CHECK
  const statusIdx = cols.findIndex(c => c.name === 'status');
  colDefs[statusIdx] = "status TEXT NOT NULL CHECK (status IN ('idle', 'running', 'completed', 'unverified', 'blocked', 'error', 'terminated', 'apoptosis', 'Active', 'Apoptosis'))";

  await db.exec('BEGIN');
  try {
    await db.exec('CREATE TABLE agents_new (' + colDefs.join(', ') + ')');
    const colNames = cols.map(c => c.name).join(', ');
    await db.exec('INSERT INTO agents_new (' + colNames + ') SELECT ' + colNames + ' FROM agents');
    await db.exec('DROP TABLE agents');
    await db.exec('ALTER TABLE agents_new RENAME TO agents');
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }

  // Recreate valid triggers (skip corrupted ones)
  for (const t of validTriggers) {
    try { await db.exec(t.sql); } catch (_) {}
  }
}

module.exports = { migrateAgentStatusConstraint };
