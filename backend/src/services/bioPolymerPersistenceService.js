/**
 * Biomimetic Bio-Polymer Persistence Service
 *
 * Biological information storage replaces verbose ASCII JSON with dense macromolecular
 * binary structures (MsgPack / Binary Polymers) analogous to nucleic acid chains.
 * Provides polymorphic dual-mode reading (Buffer/BLOB or legacy JSON String).
 */

const { pack, unpack } = require('msgpackr');

function packBioPolymer(data) {
  if (data === undefined || data === null) return null;
  return pack(data);
}

function unpackBioPolymer(source) {
  if (source === undefined || source === null) return null;
  if (Buffer.isBuffer(source) || source instanceof Uint8Array) {
    try {
      return unpack(source);
    } catch (_) {
      return null;
    }
  }
  if (typeof source === 'string') {
    try {
      return JSON.parse(source);
    } catch (_) {
      return source;
    }
  }
  if (typeof source === 'object') return source;
  return source;
}

function measurePolymerCompression(data) {
  const jsonString = typeof data === 'string' ? data : JSON.stringify(data || {});
  const jsonBytes = Buffer.byteLength(jsonString, 'utf8');
  const parsed = typeof data === 'string' ? JSON.parse(data) : data;
  const packed = packBioPolymer(parsed);
  const blobBytes = packed ? packed.length : 0;
  const savedPercent = jsonBytes > 0 ? Number(((1 - (blobBytes / jsonBytes)) * 100).toFixed(2)) : 0;
  const ratio = blobBytes > 0 ? Number((jsonBytes / blobBytes).toFixed(2)) : 1.0;
  return { jsonBytes, blobBytes, savedPercent, ratio };
}

async function tableExists(db, tableName) {
  const row = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name = ?", [tableName]);
  return Boolean(row);
}

async function ensureColumn(db, { table, column, definition }) {
  const columns = await db.all(`PRAGMA table_info(${table})`);
  if (!columns.some((entry) => entry.name === column)) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

async function migrateColumnPairs(db, config) {
  const { table, jsonCol, blobCol } = config;
  const query = `SELECT rowid AS _mig_rowid, ${jsonCol} FROM ${table} WHERE ${jsonCol} IS NOT NULL AND ${blobCol} IS NULL`;
  const rows = await db.all(query);
  let count = 0;
  for (const r of rows) {
    try {
      const parsed = typeof r[jsonCol] === 'string' ? JSON.parse(r[jsonCol]) : r[jsonCol];
      const packed = packBioPolymer(parsed);
      const rowId = r._mig_rowid ?? r.rowid ?? r.id;
      const res = await db.run(`UPDATE ${table} SET ${blobCol} = ? WHERE rowid = ?`, packed, rowId);
      if (res && res.changes !== 0) count++;
    } catch (_) {}
  }
  return count;
}

async function migrateTableBioPolymers(db, tableConfig) {
  const { table, blobCol } = tableConfig;
  const exists = await tableExists(db, table);
  if (!exists) return 0;
  await ensureColumn(db, { table, column: blobCol, definition: 'BLOB' });
  return migrateColumnPairs(db, tableConfig);
}

async function migrateAllBioPolymers(db) {
  const migrations = [
    { table: 'trajectories', jsonCol: 'diff_lines', blobCol: 'diff_lines_msgpack' },
    { table: 'genome_decisions', jsonCol: 'cart_nodes_json', blobCol: 'cart_nodes_msgpack' },
    { table: 'cryptobiosis_snapshots', jsonCol: 'state_json', blobCol: 'state_blob' },
    { table: 'cryptobiosis_snapshots', jsonCol: 'metadata_json', blobCol: 'metadata_blob' },
    { table: 'agent_state_snapshots', jsonCol: 'state_json', blobCol: 'state_blob' },
    { table: 'agent_state_snapshots', jsonCol: 'metadata_json', blobCol: 'metadata_blob' },
    { table: 'audit_logs', jsonCol: 'payload_json', blobCol: 'payload_blob' },
    { table: 'telemetry_events', jsonCol: 'payload_json', blobCol: 'payload_blob' }
  ];

  await db.exec('BEGIN IMMEDIATE;');
  const stats = {};
  try {
    for (const conf of migrations) {
      const key = `${conf.table}.${conf.blobCol}`;
      stats[key] = await migrateTableBioPolymers(db, conf);
    }
    await db.exec('COMMIT;');
  } catch (error) {
    try { await db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
  return stats;
}

module.exports = {
  packBioPolymer,
  unpackBioPolymer,
  measurePolymerCompression,
  ensureColumn,
  tableExists,
  migrateTableBioPolymers,
  migrateAllBioPolymers
};
