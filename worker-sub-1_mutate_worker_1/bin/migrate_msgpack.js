const { getDatabase } = require('../src/db');
const { pack, unpack } = require('msgpackr');

async function migrateToMsgPack() {
    console.log("[Migration] Starting JSON to MsgPack Migration...");
    const db = await getDatabase();
    
    // 1. Create BLOB columns
    await db.exec('ALTER TABLE trajectories ADD COLUMN diff_lines_msgpack BLOB;');
    await db.exec('ALTER TABLE genome_decisions ADD COLUMN cart_nodes_msgpack BLOB;');

    // 2. Migrate Trajectories
    const trajs = await db.all('SELECT rowid, diff_lines FROM trajectories WHERE diff_lines IS NOT NULL');
    let migratedTrajs = 0;
    for (const t of trajs) {
        try {
            const parsed = JSON.parse(t.diff_lines);
            const packed = pack(parsed);
            await db.run('UPDATE trajectories SET diff_lines_msgpack = ? WHERE rowid = ?', [packed, t.rowid]);
            migratedTrajs++;
        } catch(e) {}
    }
    console.log(`[Migration] Migrated ${migratedTrajs} trajectories to MsgPack.`);

    // 3. Migrate Genome Decisions
    const decs = await db.all('SELECT rowid, cart_nodes_json FROM genome_decisions WHERE cart_nodes_json IS NOT NULL');
    let migratedDecs = 0;
    for (const d of decs) {
        try {
            const parsed = JSON.parse(d.cart_nodes_json);
            const packed = pack(parsed);
            await db.run('UPDATE genome_decisions SET cart_nodes_msgpack = ? WHERE rowid = ?', [packed, d.rowid]);
            migratedDecs++;
        } catch(e) {}
    }
    console.log(`[Migration] Migrated ${migratedDecs} genome decisions to MsgPack.`);

    console.log("[Migration] IMPORTANT: You must update the schema to DROP the old TEXT columns and rename the BLOB columns manually. See docs.");
    process.exit(0);
}

migrateToMsgPack().catch(console.error);
