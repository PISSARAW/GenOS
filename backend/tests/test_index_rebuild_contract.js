const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../src/db/schema.js'), 'utf8');

if (!source.includes("INSERT INTO trajectories_fts(trajectories_fts) VALUES ('rebuild')")) throw new Error('Trajectories FTS rebuild is missing.');
if (!source.includes("INSERT INTO genome_decisions_fts(genome_decisions_fts) VALUES ('rebuild')")) throw new Error('Genome decisions FTS rebuild is missing.');
for (const table of ['trajectories_vec', 'genome_decisions_vec', 'rag_chunks_vec']) {
  if (!source.includes(`DELETE FROM ${table}`)) throw new Error(`Missing vec rebuild for ${table}`);
}
console.log('Index rebuild contract checks passed.');