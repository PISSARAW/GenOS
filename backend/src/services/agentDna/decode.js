const { unpack } = require('msgpackr');

const { decodeContainer, contentHash, verifySignature, verifySignerTrust, uuidFromBuffer } = require('./container');
const { decodeInstruction, splitStrandPayload } = require('./packing');
const { express } = require('./express');

function arrayOr(value) {
  if (Array.isArray(value)) return value;
  return [];
}

function bytesOr(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from([]);
}

function nullOr(value) {
  if (value === undefined || value === null) return null;
  return value;
}

function optional(sections, tag) {
  if (!sections.has(tag)) return null;
  return unpack(sections.get(tag));
}

function toMeta(arr) {
  return {
    name: arr[0],
    generation: arr[1],
    ploidy: arr[2],
    hayflickLimit: arr[3],
    genomeId: uuidFromBuffer(arr[4]),
    lineageId: uuidFromBuffer(arr[5]),
    parentIds: arrayOr(arr[6]).map(uuidFromBuffer),
    ts: arr[7],
    labels: nullOr(arr[8])
  };
}

function toStrand(payload) {
  const { baseCount, packed } = splitStrandPayload(payload);
  return { baseCount, instruction: decodeInstruction(packed, baseCount) };
}

function toGene(arr) {
  const packed = bytesOr(arr[1]);
  return {
    locus: arr[0],
    instruction: decodeInstruction(packed, arr[2]),
    length: arr[2],
    chromatin: arr[3],
    methylated: Boolean(arr[4]),
    volume: arr[5],
    locked: Boolean(arr[6]),
    activator: nullOr(arr[7]),
    repressor: nullOr(arr[8]),
    exons: arrayOr(arr[9]).map((range) => [range[0], range[1]])
  };
}

function toGenes(raw) {
  const genes = {};
  for (const [locus, arr] of Object.entries(raw || {})) {
    genes[locus] = toGene(arr);
  }
  return genes;
}

function toPlasmids(raw) {
  return arrayOr(raw).map((entry) => ({ id: uuidFromBuffer(entry[0]), instruction: entry[1] }));
}

function toExtra(raw) {
  return arrayOr(raw).map((payload) => toStrand(Buffer.from(payload)));
}

function toPhenotype(raw) {
  if (raw === null) return null;
  return {
    role: raw[0],
    strategy: raw[1],
    tools: arrayOr(raw[2]),
    capabilities: arrayOr(raw[3]),
    temp: raw[4],
    topP: raw[5],
    prompt: raw[6],
    exprTfs: arrayOr(raw[7]),
    exprMirnas: arrayOr(raw[8]),
    silenced: arrayOr(raw[9]),
    expressed: raw[10]
  };
}

function toCrossover(raw) {
  if (raw === null) return null;
  return { strategy: raw[0], seed: raw[1], point: nullOr(raw[2]) };
}

function toMutation(entry) {
  return { gene: nullOr(entry[0]), kind: entry[1], from: entry[2], to: entry[3] };
}

function toSelection(raw) {
  if (raw === null) return null;
  return { fitness: raw[0], status: raw[1] };
}

function toDecoy(raw) {
  if (raw === null) return null;
  return { targetSelector: raw[1], detectability: raw[2], hasMarker: bytesOr(raw[0]).length > 0 };
}

function toProvenance(raw) {
  if (raw === null) return null;
  return {
    sourceManifest: nullOr(raw[0]),
    sourceDoc: nullOr(raw[1]),
    parents: arrayOr(raw[2]).map(uuidFromBuffer),
    crossover: toCrossover(nullOr(raw[3])),
    mutations: arrayOr(raw[4]).map(toMutation),
    selection: toSelection(nullOr(raw[5])),
    decoy: toDecoy(nullOr(raw[6])),
    signer: nullOr(raw[7])
  };
}

function decodeBuffer(buffer) {
  const { sections } = decodeContainer(buffer);
  const model = {
    format: 'AgentDNA/v1',
    contentHash: contentHash(sections),
    meta: toMeta(unpack(sections.get('META'))),
    maternal: toStrand(sections.get('CHRM')),
    paternal: toStrand(sections.get('CHRP')),
    genes: toGenes(unpack(sections.get('GENE'))),
    plasmids: toPlasmids(optional(sections, 'PLAS')),
    enhancers: arrayOr(optional(sections, 'ENHA')),
    extraChromosomes: toExtra(optional(sections, 'XCHR')),
    scars: arrayOr(optional(sections, 'SCAR')).map(uuidFromBuffer),
    phenotype: toPhenotype(optional(sections, 'PHEN')),
    provenance: toProvenance(optional(sections, 'PROV')),
    raw: buffer
  };
  // Recalculate phenotype and compare against cached PHEN if present.
  const current = express(model);
  if (model.phenotype) {
    const cached = model.phenotype;
    const cacheMatches = cached.role === current.role
      && cached.strategy === current.strategy
      && JSON.stringify(cached.tools) === JSON.stringify(current.tools)
      && JSON.stringify(cached.capabilities) === JSON.stringify(current.capabilities);
    model.phenotypeCacheValid = cacheMatches;
  }
  model.phenotype = current;
  const signature = verifySignature(sections);
  model.signed = signature.signed;
  model.signer = signature.signer;
  model.signatureValid = signature.valid;
  return model;
}

module.exports = { decodeBuffer };
