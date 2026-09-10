const { getDatabase } = require('../src/db');
const { pack } = require('msgpackr');

async function ensureColumn(db, { table, column, definition }) {
    const columns = await db.all(`PRAGMA table_info(${table})`);
    if (!columns.some((entry) => entry.name === column)) {
        await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
    }
}

async function migrateToMsgPack(database = null) {
    console.log('[Migration] Starting JSON to MsgPack migration...');
    const db = database || await getDatabase();
    await db.exec('BEGIN IMMEDIATE;');
    try {
        await ensureColumn(db, { table: 'trajectories', column: 'diff_lines_msgpack', definition: 'BLOB' });
        await ensureColumn(db, { table: 'genome_decisions', column: 'cart_nodes_msgpack', definition: 'BLOB' });

        const trajs = await db.all('SELECT rowid, diff_lines FROM trajectories WHERE diff_lines IS NOT NULL AND diff_lines_msgpack IS NULL');
        let migratedTrajs = 0;
        for (const t of trajs) {
            const parsed = JSON.parse(t.diff_lines);
            const packed = pack(parsed);
            await db.run('UPDATE trajectories SET diff_lines_msgpack = ? WHERE rowid = ?', [packed, t.rowid]);
            migratedTrajs++;

        }

        const decs = await db.all('SELECT rowid, cart_nodes_json FROM genome_decisions WHERE cart_nodes_json IS NOT NULL AND cart_nodes_msgpack IS NULL');
        let migratedDecs = 0;
        for (const d of decs) {
            const parsed = JSON.parse(d.cart_nodes_json);
            const packed = pack(parsed);
            await db.run('UPDATE genome_decisions SET cart_nodes_msgpack = ? WHERE rowid = ?', [packed, d.rowid]);
            migratedDecs++;
        }
        await db.exec('COMMIT;');
        console.log(`[Migration] Migrated ${migratedTrajs} trajectories and ${migratedDecs} genome decisions to MsgPack.`);
        return { migratedTrajs, migratedDecs };
    } catch (error) {
        try { await db.exec('ROLLBACK;'); } catch (_) {}
        throw error;
    }
}

if (require.main === module) {
    migrateToMsgPack().catch((error) => {
        console.error('[Migration] MsgPack migration failed:', error.message);
        process.exitCode = 1;
    });
}

module.exports = { ensureColumn, migrateToMsgPack };
