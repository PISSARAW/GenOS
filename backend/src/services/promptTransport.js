'use strict';

const path = require('path');
const protobuf = require('protobufjs');

const root = protobuf.loadSync(path.resolve(__dirname, '../proto/synapse.proto'));
const PromptCapsule = root.lookupType('synapse.PromptCapsule');
const DNA_ALPHABET = ['A', 'C', 'G', 'T'];
const DNA_INDEX = new Map(DNA_ALPHABET.map((base, index) => [base, index]));

function promptToDna(prompt) {
  const bytes = Buffer.from(String(prompt || ''), 'utf8');
  const dna = Buffer.alloc(bytes.length * 4);
  let offset = 0;
  for (const byte of bytes) {
    dna[offset++] = DNA_ALPHABET[(byte >> 6) & 3].charCodeAt(0);
    dna[offset++] = DNA_ALPHABET[(byte >> 4) & 3].charCodeAt(0);
    dna[offset++] = DNA_ALPHABET[(byte >> 2) & 3].charCodeAt(0);
    dna[offset++] = DNA_ALPHABET[byte & 3].charCodeAt(0);
  }
  return dna;
}

function dnaToPrompt(dna) {
  const bases = Buffer.isBuffer(dna) ? dna.toString('ascii') : String(dna || '');
  if (bases.length % 4 !== 0) throw new Error('Prompt DNA strand is truncated.');
  const bytes = Buffer.alloc(bases.length / 4);
  for (let index = 0; index < bases.length; index += 4) {
    const values = bases.slice(index, index + 4).split('').map((base) => DNA_INDEX.get(base));
    if (values.some((value) => value === undefined)) throw new Error('Prompt DNA strand contains an invalid base.');
    bytes[index / 4] = (values[0] << 6) | (values[1] << 4) | (values[2] << 2) | values[3];
  }
  return bytes.toString('utf8');
}

function encodePromptCapsule({ prompt, sourceAgentId = '', recipientAgentId = '' }) {
  const message = PromptCapsule.create({
    sourceAgentId,
    recipientAgentId,
    promptDna: promptToDna(prompt),
    encoding: 'UTF-8-2BIT-DNA'
  });
  return Buffer.from(PromptCapsule.encode(message).finish());
}

function decodePromptCapsule(buffer) {
  const message = PromptCapsule.decode(buffer);
  if (message.encoding !== 'UTF-8-2BIT-DNA') throw new Error(`Unsupported prompt capsule encoding '${message.encoding}'.`);
  return {
    prompt: dnaToPrompt(message.promptDna),
    sourceAgentId: message.sourceAgentId,
    recipientAgentId: message.recipientAgentId
  };
}

module.exports = { promptToDna, dnaToPrompt, encodePromptCapsule, decodePromptCapsule };
