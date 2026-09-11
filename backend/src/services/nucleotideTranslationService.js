/**
 * GenOS Nucleotide Translation Service
 * 2-bit DNA/RNA nucleotide strand encoding, decoding, and ribosomal peptide translation.
 */

const { validateCognitiveGenes } = require('./geneticsConstants');

const NUC_MAP = ['A', 'C', 'G', 'T'];
const NUC_REV = { A: 0, C: 1, G: 2, T: 3 };

function encodeStringToNucleotides(str) {
  const buf = Buffer.from(str, 'utf8');
  let nucs = '';
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i];
    for (const shift of [6, 4, 2, 0]) {
      const pair = (byte >> shift) & 0b11;
      nucs += NUC_MAP[pair];
    }
  }
  return nucs;
}

function decodeNucleotidesToString(nucs) {
  const bytes = [];
  for (let i = 0; i < nucs.length; i += 4) {
    if (i + 4 <= nucs.length) {
      let byte = 0;
      for (let j = 0; j < 4; j++) {
        const val = NUC_REV[nucs[i + j]] ?? 0;
        byte |= (val << ((3 - j) * 2));
      }
      bytes.push(byte);
    }
  }
  return Buffer.from(bytes).toString('utf8');
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
  const peptides = [];
  for (let i = 0; i < nucleotideStr.length; i += 3) {
    if (i + 3 <= nucleotideStr.length) {
      const triplet = nucleotideStr.slice(i, i + 3);
      if (triplet === 'ATG' || triplet === 'AUG') {
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
