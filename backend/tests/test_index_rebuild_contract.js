const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../src/db/schema.js'), 'utf8');

for (const table of ['trajectories', 'genome_decisions']) {
  if (!source.includes(`SELECT COUNT(*) as c FROM ${table}`)) throw new Error(`Missing source count for ${table}`);
}
if (!source.includes('trajectoriesFtsCount.c !== trajectoriesCount.c')) throw new Error('FTS cardinality reconciliation is missing.');
if (!source.includes('genomeVecCount.c !== genomeVectorCount.c')) throw new Error('Vector cardinality reconciliation is missing.');
console.log('Index rebuild contract checks passed.');