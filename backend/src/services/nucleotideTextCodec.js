'use strict';

const { NUCLEOTIDES, HACHIMOJI_COUNT_FLAG, unpackBases } = require('./agentDna/packing');
const HACHIMOJI_PREFIX = 'H8:';

function encodeText(text, alphabet = 'hachimoji') {
  if (!['hachimoji', 'canonical'].includes(alphabet)) throw new Error('Unknown DNA alphabet');
  const width = alphabet === 'hachimoji' ? 3 : 2;
  const input = Buffer.from(text, 'utf8');
  const count = Math.ceil(input.length * 8 / width);
  const packed = Buffer.alloc(Math.ceil(count * width / 8));
  input.copy(packed);
  const encodedCount = count + (width === 3 ? HACHIMOJI_COUNT_FLAG : 0);
  const sequence = unpackBases(packed, encodedCount);
  return width === 3 ? HACHIMOJI_PREFIX + sequence : sequence;
}

function textLayout(value) {
  if (typeof value !== 'string') throw new Error('DNA text must be a string');
  const hachimoji = value.startsWith(HACHIMOJI_PREFIX);
  const sequence = hachimoji ? value.slice(HACHIMOJI_PREFIX.length) : value;
  const pattern = hachimoji ? /^[ACGTPZBS]*$/ : /^[ACGT]*$/;
  if (!pattern.test(sequence)) throw new Error('Invalid DNA text alphabet');
  return { sequence, width: hachimoji ? 3 : 2 };
}

function decodeText(value) {
  const { sequence, width } = textLayout(value);
  const bytes = Buffer.alloc(Math.floor(sequence.length * width / 8));
  for (let bit = 0; bit < bytes.length * 8; bit += 1) {
    const code = NUCLEOTIDES.indexOf(sequence[Math.floor(bit / width)]);
    bytes[Math.floor(bit / 8)] |= ((code >> (width - 1 - bit % width)) & 1) << (7 - bit % 8);
  }
  return bytes.toString('utf8');
}

module.exports = { encodeText, decodeText, HACHIMOJI_PREFIX };
