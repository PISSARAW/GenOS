const crypto = require('crypto');
const zlib = require('zlib');
const { unpack } = require('msgpackr');

const MAGIC = Buffer.from('GDNA');
const FORMAT_VERSION = 1;
const HEADER_LEN = 32;
const SECTION_ENTRY_LEN = 16;
const HASH_EXCLUDED_TAGS = new Set(['SIGN']);

function readHeader(buffer) {
  if (buffer.length < HEADER_LEN) throw new Error('AgentDNA file is shorter than the 32-byte header');
  if (!buffer.subarray(0, 4).equals(MAGIC)) throw new Error('Invalid AgentDNA magic (expected GDNA)');
  const version = buffer.readUInt16LE(4);
  if (version !== FORMAT_VERSION) throw new Error(`Unsupported AgentDNA format version ${version}`);
  if ((zlib.crc32(buffer.subarray(0, 20)) >>> 0) !== buffer.readUInt32LE(20)) {
    throw new Error('AgentDNA header CRC mismatch');
  }
  return {
    flags: buffer.readUInt16LE(6),
    sectionCount: buffer.readUInt16LE(8),
    totalLength: buffer.readUInt32LE(12),
    payloadCrc32: buffer.readUInt32LE(16),
  };
}

function readSection(buffer, base, tableEnd) {
  const tag = buffer.toString('ascii', base, base + 4);
  const offset = buffer.readUInt32LE(base + 4);
  const length = buffer.readUInt32LE(base + 8);
  const crc = buffer.readUInt32LE(base + 12);
  if (offset < tableEnd || offset + length > buffer.length) {
    throw new Error(`AgentDNA section ${tag} bounds are invalid`);
  }
  const payload = buffer.subarray(offset, offset + length);
  if ((zlib.crc32(payload) >>> 0) !== crc) throw new Error(`AgentDNA section ${tag} CRC mismatch`);
  return { tag, payload: Buffer.from(payload) };
}

function readSections(buffer, header) {
  const tableEnd = HEADER_LEN + header.sectionCount * SECTION_ENTRY_LEN;
  if (buffer.length < tableEnd) throw new Error('AgentDNA section table is truncated');
  if (header.totalLength !== buffer.length) throw new Error('AgentDNA total_length does not match file size');
  const sections = new Map();
  const chunks = [];
  for (let index = 0; index < header.sectionCount; index += 1) {
    const { tag, payload } = readSection(buffer, HEADER_LEN + index * SECTION_ENTRY_LEN, tableEnd);
    sections.set(tag, payload);
    chunks.push(payload);
  }
  if ((zlib.crc32(Buffer.concat(chunks)) >>> 0) !== header.payloadCrc32) {
    throw new Error('AgentDNA payload CRC mismatch');
  }
  return sections;
}

function canonicalFlux(sections) {
  const chunks = [];
  const tags = [...sections.keys()].filter((tag) => !HASH_EXCLUDED_TAGS.has(tag)).sort();
  for (const tag of tags) {
    const payload = sections.get(tag);
    const length = Buffer.alloc(4);
    length.writeUInt32LE(payload.length);
    chunks.push(Buffer.from(tag, 'ascii'), length, payload);
  }
  return Buffer.concat(chunks);
}

function contentHash(sections) {
  return crypto.createHash('sha256').update(canonicalFlux(sections)).digest('hex');
}

function verifyEd25519(signerHex, message, signature) {
  try {
    const raw = Buffer.from(String(signerHex).replace(/^0x/, ''), 'hex');
    if (raw.length !== 32) return false;
    const key = crypto.createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') },
      format: 'jwk'
    });
    return crypto.verify(null, message, key, signature);
  } catch (_) {
    return false;
  }
}

async function verifySignature(sections, scope) {
  const signature = sections.get('SIGN');
  if (!signature) return { signed: false, signer: null, valid: false, trusted: false };
  const provenance = sections.get('PROV');
  if (!provenance) return { signed: true, signer: null, valid: false, trusted: false };
  let signer = null;
  try {
    signer = unpack(provenance)[7];
  } catch (_) {
    return { signed: true, signer: null, valid: false, trusted: false };
  }
  if (!signer) return { signed: true, signer, valid: false, trusted: false };

  const valid = verifyEd25519(signer, canonicalFlux(sections), signature);

  // B6: vérifier que le signataire est dans le trust store du tenant
  let trusted = false;
  if (valid && scope && scope.organizationId && scope.projectId) {
    const { isSignerTrusted } = require('./genomeTrustStore');
    try {
      trusted = await isSignerTrusted({ organizationId: scope.organizationId, projectId: scope.projectId }, signer);
    } catch (_) {
      trusted = false;
    }
  }

  return { signed: true, signer, valid, trusted };
}

function uuidFromBuffer(buffer) {
  const hex = Buffer.from(buffer).toString('hex');
  if (hex.length !== 32) return buffer.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function decodeContainer(buffer) {
  const header = readHeader(buffer);
  return { header, sections: readSections(buffer, header) };
}

module.exports = { decodeContainer, contentHash, canonicalFlux, verifySignature, uuidFromBuffer, HEADER_LEN, FORMAT_VERSION };
