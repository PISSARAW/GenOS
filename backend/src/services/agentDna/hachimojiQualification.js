'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { decodeBuffer } = require('./decode');
const { decodeContainer } = require('./container');

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function receiptDigest(receipt) {
  const { receiptHash, ...body } = receipt;
  return digest(JSON.stringify(canonical(body)));
}

function semanticModel(model) {
  const genes = Object.fromEntries(Object.entries(model.genes).map(([locus, gene]) => {
    const { length, bitsPerBase, ...semantic } = gene;
    return [locus, semantic];
  }));
  return {
    name: model.meta.name, lineageId: model.meta.lineageId, ploidy: model.meta.ploidy,
    hayflickLimit: model.meta.hayflickLimit, labels: model.meta.labels,
    maternal: model.maternal.instruction, paternal: model.paternal.instruction,
    extraChromosomes: model.extraChromosomes.map(strand => strand.instruction), genes,
    phenotype: model.phenotype, plasmids: model.plasmids, enhancers: model.enhancers,
    scars: model.scars, epigenome: model.epigenome, grn: model.grn, development: model.development
  };
}

function assertHachimoji(model) {
  assert.equal(model.format, 'AgentDNA/v2');
  assert.equal(model.alphabet, 'ACGTPZBS');
  const strands = [model.maternal, model.paternal, ...model.extraChromosomes,
    ...Object.values(model.genes)];
  assert.ok(strands.every(strand => strand.bitsPerBase === 3), 'All strands must use three bits');
  assert.equal(model.phenotypeCacheValid, true, 'Phenotype cache must match expression');
  assert.equal(model.meta.status, 'DRAFT');
  assert.equal(model.signed, false);
  assert.equal(model.provenance?.selection ?? null, null, 'Encoding does not qualify a selection');
}

function assertOpaqueSections(source, target) {
  const mutable = new Set(['META', 'CHRM', 'CHRP', 'GENE', 'XCHR', 'PHEN', 'PROV', 'SIGN']);
  const before = decodeContainer(source).sections;
  const after = decodeContainer(target).sections;
  const opaque = sections => [...sections].filter(([tag]) => !mutable.has(tag));
  assert.deepEqual(opaque(after), opaque(before), 'Regulatory and opaque sections must be preserved');
}

function assertProvenance(source, target) {
  assert.notEqual(target.meta.genomeId, source.meta.genomeId);
  assert.equal(target.meta.generation, source.meta.generation + 1);
  assert.equal(target.meta.ts, source.meta.ts);
  assert.deepEqual(target.meta.parentIds, [source.meta.genomeId]);
  const { parents, mutations, selection, ...provenance } = target.provenance;
  const { parents: oldParents, mutations: oldMutations, selection: oldSelection, ...oldProvenance } = source.provenance;
  assert.deepEqual(provenance, oldProvenance);
  assert.deepEqual(parents, [source.meta.genomeId]);
  assert.deepEqual(mutations.slice(0, -1), oldMutations);
  assert.equal(mutations.at(-1).kind, 'encoding:hachimoji');
  assert.equal(mutations.at(-1).from, source.contentHash);
  assert.equal(mutations.at(-1).to, 'AgentDNA/v2:ACGTPZBS');
}

function qualifyPair(sourceBytes, targetBytes) {
  const source = decodeBuffer(sourceBytes);
  const target = decodeBuffer(targetBytes);
  assertHachimoji(target);
  assert.equal(source.signed, false, 'Signed sources require their authorized signer');
  assert.equal(source.meta.status, 'DRAFT');
  assert.deepEqual(semanticModel(target), semanticModel(source), 'Instruction or behavior drift');
  assertProvenance(source, target);
  assertOpaqueSections(sourceBytes, targetBytes);
  return { source, target, semanticHash: digest(JSON.stringify(semanticModel(target))) };
}

function qualifyCompilation(manifestBytes, targetBytes) {
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const target = decodeBuffer(targetBytes);
  assertHachimoji(target);
  assert.equal(target.meta.name, manifest.metadata?.name || manifest.name);
  assert.equal(target.phenotype.role, manifest.identity?.role?.trim() || 'worker');
  assert.equal(target.phenotype.prompt, manifest.objectives?.primary || target.phenotype.role);
  const tools = manifest.tool_policy?.allowed_tools || manifest.tools?.allowed_tools || [];
  assert.deepEqual(target.phenotype.tools, [...tools].sort());
  assert.deepEqual(target.phenotype.capabilities, [...(manifest.capabilities || [])].sort());
  return { target, semanticHash: digest(JSON.stringify(semanticModel(target))) };
}

module.exports = { digest, receiptDigest, semanticModel, assertHachimoji, qualifyPair, qualifyCompilation };
