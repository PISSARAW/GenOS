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
  const chromatin = arr[3];
  if (chromatin !== 0 && chromatin !== 1 && chromatin !== 2) {
    throw new Error(`Invalid chromatin code ${chromatin}: expected 0, 1 or 2`);
  }
  return {
    locus: arr[0],
    instruction: decodeInstruction(packed, arr[2]),
    length: arr[2],
    chromatin,
    methylated: Boolean(arr[4]),
    volume: arr[5],
    locked: Boolean(arr[6]),
    requiredActivator: nullOr(arr[7]),
    boundRepressor: nullOr(arr[8]),
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

function toEpigenomeMarks(raw, marks) {
  if (!Array.isArray(raw)) return;
  for (const entry of raw) {
    if (Array.isArray(entry) && entry.length >= 3) {
      marks[entry[0]] = { kind: entry[1], level: Number(entry[2]) || 0 };
    }
  }
}

function toEpigenome(raw) {
  if (raw === null) return null;
  const marks = {};
  if (Array.isArray(raw[0])) toEpigenomeMarks(raw[0], marks);
  return {
    marks,
    stage: raw[1] || 'Zygote',
    stressMemory: Array.isArray(raw[2]) ? raw[2] : [],
    generation: Number(raw[3]) || 0
  };
}

function toGrnNodes(raw, nodes) {
  if (!Array.isArray(raw)) return;
  for (const entry of raw) {
    if (Array.isArray(entry) && entry.length >= 2) {
      nodes[entry[0]] = { isTf: Boolean(entry[1]), basalExpression: Number(entry[2]) || 0 };
    }
  }
}

function toGrnEdges(raw, edges) {
  if (!Array.isArray(raw)) return;
  for (const entry of raw) {
    if (Array.isArray(entry) && entry.length >= 3) {
      edges.push({ from: entry[0], to: entry[1], weight: Number(entry[2]) || 0 });
    }
  }
}

function toGrn(raw) {
  if (raw === null) return null;
  const nodes = {};
  const edges = [];
  if (Array.isArray(raw[0])) toGrnNodes(raw[0], nodes);
  if (Array.isArray(raw[1])) toGrnEdges(raw[1], edges);
  return { nodes, edges };
}

function toDevelopment(raw) {
  if (raw === null) return null;
  return {
    stage: raw[0] || 'Zygote',
    lineageCommitment: raw[1] || null,
    morphogens: Array.isArray(raw[2]) ? raw[2] : [],
    differentiationSignal: raw[3] || null
  };
}

function fieldsMatch(cached, current) {
  return cached.role === current.role
    && cached.strategy === current.strategy
    && cached.temp === current.temp
    && cached.topP === current.topP
    && cached.prompt === current.prompt
    && cached.expressed === current.expressed;
}

function arraysMatch(cached, current) {
  return JSON.stringify(cached.tools) === JSON.stringify(current.tools)
    && JSON.stringify(cached.capabilities) === JSON.stringify(current.capabilities)
    && JSON.stringify(cached.exprTfs) === JSON.stringify(current.exprTfs)
    && JSON.stringify(cached.exprMirnas) === JSON.stringify(current.exprMirnas)
    && JSON.stringify(cached.silenced) === JSON.stringify(current.silenced);
}

function decodePhenotype(model) {
  const current = express(model);
  if (model.phenotype) {
    const cached = model.phenotype;
    model.phenotypeCacheValid = fieldsMatch(cached, current) && arraysMatch(cached, current);
  }
  model.phenotype = current;
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
    epigenome: toEpigenome(optional(sections, 'EPIE')),
    grn: toGrn(optional(sections, 'GRN_')),
    development: toDevelopment(optional(sections, 'DEVO')),
    raw: buffer
  };
  decodePhenotype(model);
  const signature = verifySignature(sections);
  model.signed = signature.signed;
  model.signer = signature.signer;
  model.signatureValid = signature.valid;
  return model;
}

module.exports = { decodeBuffer };
