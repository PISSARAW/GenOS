const assert = require('assert');
const {
  encodeStringToNucleotides,
  decodeNucleotidesToString,
  encodeGenesToNucleotides,
  decodeGenesFromNucleotides,
  translateNucleotidesToPeptides
} = require('../src/services/geneticsService');

console.log('[Test] Running test_genome_nucleotide_translation...');

// 1. Test encodage et décodage 2-bit de texte arbitraire
const sampleText = 'INSPECT_AND_REPAIR_CELL_STRUCTURE';
const nucs = encodeStringToNucleotides(sampleText);
assert.strictEqual(typeof nucs, 'string');
assert.strictEqual(nucs.length, sampleText.length * 4); // 4 nucléotides par octet
assert.ok(/^[ACGT]+$/.test(nucs), 'La chaîne ne doit contenir que A, C, G, T');

const restoredText = decodeNucleotidesToString(nucs);
assert.strictEqual(restoredText, sampleText, 'Le décodage nucléotidique doit être sans perte');

// 2. Test encodage/décodage de gènes cognitifs complets
const cognitiveGenes = {
  role: 'architect_cell',
  strategy: 'tree-search',
  tools: ['genos_inspect', 'genos_patch'],
  temp: 0.2,
  topP: 0.95
};

const geneStrand = encodeGenesToNucleotides(cognitiveGenes);
assert.ok(/^[ACGT]+$/.test(geneStrand));
const decodedGenes = decodeGenesFromNucleotides(geneStrand);
assert.deepStrictEqual(decodedGenes, cognitiveGenes, 'Les gènes décodés doivent correspondre exactement aux gènes initiaux');

// 3. Test de traduction ribosomale par codons (triplets)
const peptides = translateNucleotidesToPeptides('ATGACGTGA');
assert.strictEqual(peptides[0], 'MET_START');
assert.strictEqual(peptides[1], 'TOKEN_ACG');
assert.strictEqual(peptides[2], 'STOP');

console.log('[Test] test_genome_nucleotide_translation PASSED successfully.');
