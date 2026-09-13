const NUCLEOTIDES = ['A', 'C', 'G', 'T'];

function unpackBases(packed, baseCount) {
  let out = '';
  for (let index = 0; index < baseCount; index += 1) {
    const shift = (3 - (index % 4)) * 2;
    const bits = (packed[Math.floor(index / 4)] >> shift) & 0b11;
    out += NUCLEOTIDES[bits];
  }
  return out;
}

// Mirrors genos-genome DnaStrand::decode_instruction. Because pack puts base i at
// shift (3-i)*2, a group of 4 bases reconstructs exactly the original UTF-8 byte,
// so the packed buffer bytes are the instruction bytes.
function decodeInstruction(packed, baseCount) {
  const byteCount = Math.floor(baseCount / 4);
  return Buffer.from(packed.subarray(0, byteCount)).toString('utf8');
}

function splitStrandPayload(payload) {
  if (payload.length < 4) {
    throw new Error('AgentDNA strand section is missing its base count');
  }
  return { baseCount: payload.readUInt32LE(0), packed: payload.subarray(4) };
}

module.exports = { NUCLEOTIDES, unpackBases, decodeInstruction, splitStrandPayload };
