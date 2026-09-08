const assert = require('assert');
const { getDatabase } = require('../src/db');
const { depositExosome, absorbExosomes } = require('../src/services/synapticTransmissionService');
const fs = require('fs');
const path = require('path');

async function run() {
  console.log('--- Running Epigenetic & Exosome Assimilation Suite ---');

  const db = await getDatabase();

  // Test 1: Exosome plasmid absorption generates 768-dim embedding_blob (3072 bytes)
  console.log('1. Testing exosome plasmid vector embedding absorption...');
  const plasmidName = 'BioAdaptiveResistance_01';
  const plasmidCode = 'ATG_ADAPT_RESISTANCE_PATHWAY_PROMPT';

  await depositExosome({
    plasmid_name: plasmidName,
    plasmid_code: plasmidCode
  });

  const absorbResult = await absorbExosomes(db);
  assert.strictEqual(absorbResult.success, true, 'Exosome absorption must succeed without errors');
  assert.ok(absorbResult.plasmidsAssimilated >= 1, 'At least one plasmid must be assimilated');

  const row = await db.get(
    "SELECT id, title, content, embedding_blob FROM genome_decisions WHERE category = 'Plasmid' AND title LIKE ? ORDER BY rowid DESC LIMIT 1",
    `%${plasmidName}%`
  );

  assert.ok(row, 'Assimilated plasmid must be inserted into genome_decisions');
  assert.ok(row.embedding_blob, 'Assimilated plasmid must possess a non-null embedding_blob');
  assert.strictEqual(Buffer.isBuffer(row.embedding_blob), true, 'embedding_blob must be a Buffer');
  assert.strictEqual(row.embedding_blob.length, 3072, 'embedding_blob must be exactly 3072 bytes (768 * 4 float32 bytes)');

  // Verify that sqlite-vec trigger populated genome_decisions_vec
  const vecRow = await db.get('SELECT rowid FROM genome_decisions_vec WHERE rowid = (SELECT rowid FROM genome_decisions WHERE id = ?)', row.id);
  assert.ok(vecRow, 'genome_decisions_vec must contain the rowid indexed by the SQLite trigger');
  console.log('  ✓ Plasmid embedding blob successfully generated, stored (3072 bytes) and indexed into genome_decisions_vec');

  console.log('✓ Epigenetic & Exosome test suite passed successfully!');
}

run().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});