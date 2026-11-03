const NUCLEOTIDES = ['A', 'C', 'G', 'T', 'P', 'Z', 'B', 'S'];
const HACHIMOJI_COUNT_FLAG = 0x80000000;

function strandLayout(encodedCount) {
  if (!Number.isInteger(encodedCount) || encodedCount < 0 || encodedCount > 0xffffffff) {
    throw new Error('Invalid AgentDNA encoded base count');
  }
  const bitsPerBase = encodedCount >= HACHIMOJI_COUNT_FLAG ? 3 : 2;
  const baseCount = encodedCount % HACHIMOJI_COUNT_FLAG;
  return { baseCount, bitsPerBase, bitCount: baseCount * bitsPerBase };
}

function validatePacked(packed, layout) {
  if (packed.length !== Math.ceil(layout.bitCount / 8)) throw new Error('AgentDNA packed strand length invalid');
  const padding = (8 - layout.bitCount % 8) % 8;
  if (packed.length && (packed[packed.length - 1] & ((1 << padding) - 1))) {
    throw new Error('AgentDNA packed strand has nonzero padding');
  }
}

function unpackBases(packed, baseCount) {
  const layout = strandLayout(baseCount);
  validatePacked(packed, layout);
  let out = '';
  for (let start = 0; start < layout.bitCount; start += layout.bitsPerBase) {
    let code = 0;
    for (let bit = start; bit < start + layout.bitsPerBase; bit += 1) {
      code = (code << 1) | ((packed[Math.floor(bit / 8)] >> (7 - bit % 8)) & 1);
    }
    out += NUCLEOTIDES[code];
  }
  return out;
}

function decodeInstruction(packed, baseCount) {
  const layout = strandLayout(baseCount);
  validatePacked(packed, layout);
  const byteCount = Math.floor(layout.bitCount / 8);
  return Buffer.from(packed.subarray(0, byteCount)).toString('utf8');
}

function splitStrandPayload(payload) {
  if (payload.length < 4) {
    throw new Error('AgentDNA strand section is missing its base count');
  }
  return { baseCount: payload.readUInt32LE(0), packed: payload.subarray(4) };
}

module.exports = { NUCLEOTIDES, HACHIMOJI_COUNT_FLAG, strandLayout, unpackBases, decodeInstruction, splitStrandPayload };
