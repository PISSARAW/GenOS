const assert = require('assert');
const {
  encodeStringToNucleotides,
  decodeNucleotidesToString,
  encodeGenesToNucleotides,
  decodeGenesFromNucleotides,
  translateNucleotidesToPeptides
} = require('../src/services/geneticsService');

console.log('[Test] Running test_genome_nucleotide_translation...');

// 1. Texte Hachimoji versionné, avec lecture des anciens brins 2 bits.
const sampleText = 'INSPECT_AND_REPAIR_CELL_STRUCTURE';
const nucs = encodeStringToNucleotides(sampleText);
assert.strictEqual(typeof nucs, 'string');
assert.strictEqual(nucs.length, 3 + Math.ceil(Buffer.byteLength(sampleText) * 8 / 3));
assert.ok(/^H8:[ACGTPZBS]+$/.test(nucs));

const restoredText = decodeNucleotidesToString(nucs);
assert.strictEqual(restoredText, sampleText, 'Le décodage nucléotidique doit être sans perte');
const legacy = encodeStringToNucleotides(sampleText, 'canonical');
assert.ok(/^[ACGT]+$/.test(legacy));
assert.strictEqual(decodeNucleotidesToString(legacy), sampleText);
assert.strictEqual(decodeNucleotidesToString('CAAC'), 'A');
assert.strictEqual(decodeNucleotidesToString('H8:AAAAAAAA').length, 3);
assert.strictEqual(decodeNucleotidesToString('AAAAAAAA').length, 2);
for (const text of ['', 'a', 'ab', 'abc', 'daemon résident 🧬', '\0']) {
  assert.strictEqual(decodeNucleotidesToString(encodeStringToNucleotides(text)), text);
}
assert.throws(() => decodeNucleotidesToString('ACGX'), /alphabet/);

// 2. Test encodage/décodage de gènes cognitifs complets
const cognitiveGenes = {
  role: 'architect_cell',
  strategy: 'tree-search',
  tools: ['genos_inspect', 'genos_patch'],
  temp: 0.2,
  topP: 0.95
};

const geneStrand = encodeGenesToNucleotides(cognitiveGenes);
assert.ok(/^H8:[ACGTPZBS]+$/.test(geneStrand));
const decodedGenes = decodeGenesFromNucleotides(geneStrand);
assert.deepStrictEqual(decodedGenes, cognitiveGenes, 'Les gènes décodés doivent correspondre exactement aux gènes initiaux');

// 3. Test de traduction ribosomale par codons (triplets)
const peptides = translateNucleotidesToPeptides('ATGACGTGA');
assert.strictEqual(peptides[0], 'MET_START');
assert.strictEqual(peptides[1], 'TOKEN_ACG');
assert.strictEqual(peptides[2], 'STOP');
assert.deepStrictEqual(translateNucleotidesToPeptides('PZB'), ['SYNTHETIC_CODON_PZB']);

console.log('[Test] test_genome_nucleotide_translation PASSED successfully.');
