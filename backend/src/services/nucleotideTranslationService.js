/**
 * GenOS Nucleotide Translation Service
 * Versioned Hachimoji text encoding with legacy 2-bit DNA decoding.
 */

const { validateCognitiveGenes } = require('./geneticsConstants');

const { encodeText, decodeText, HACHIMOJI_PREFIX } = require('./nucleotideTextCodec');

function encodeStringToNucleotides(str, alphabet = 'hachimoji') {
  return encodeText(str, alphabet);
}

function decodeNucleotidesToString(nucs) {
  return decodeText(nucs);
}

function encodeGenesToNucleotides(genes) {
  validateCognitiveGenes(genes, 'encodeGenesToNucleotides');
  const payload = JSON.stringify(genes);
  return encodeStringToNucleotides(payload);
}

function decodeGenesFromNucleotides(nucleotideStr) {
  const rawJson = decodeNucleotidesToString(nucleotideStr);
  const parsed = JSON.parse(rawJson);
  validateCognitiveGenes(parsed, 'decodeGenesFromNucleotides');
  return parsed;
}

function translateNucleotidesToPeptides(nucleotideStr) {
  if (nucleotideStr.startsWith(HACHIMOJI_PREFIX)) nucleotideStr = nucleotideStr.slice(HACHIMOJI_PREFIX.length);
  const peptides = [];
  for (let i = 0; i < nucleotideStr.length; i += 3) {
    if (i + 3 <= nucleotideStr.length) {
      const triplet = nucleotideStr.slice(i, i + 3);
      if (/[PZBS]/.test(triplet)) {
        peptides.push(`SYNTHETIC_CODON_${triplet}`);
      } else if (triplet === 'ATG' || triplet === 'AUG') {
        peptides.push('MET_START');
      } else if (['TAA', 'TAG', 'TGA', 'UAA', 'UAG', 'UGA'].includes(triplet)) {
        peptides.push('STOP');
      } else {
        peptides.push(`TOKEN_${triplet}`);
      }
    }
  }
  return peptides;
}

module.exports = {
  encodeStringToNucleotides,
  decodeNucleotidesToString,
  encodeGenesToNucleotides,
  decodeGenesFromNucleotides,
  translateNucleotidesToPeptides
};
