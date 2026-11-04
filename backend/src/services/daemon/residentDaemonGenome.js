'use strict';

const { decodeBuffer } = require('../agentDna');
const GENOME_REF = 'agents/dna/daemons/resident_daemon.dna';

function runtimeGenome(options) {
  if (options?.genomeDna !== undefined) return bindGenome(options.genomeDna);
  if (options?.genomeRef && options.genomeRef !== GENOME_REF) return null;
  return bindGenome(require('../agentDna/hachimojiCatalog').loadQualifiedGenome(GENOME_REF));
}

function bindGenome(bytes) {
  if (bytes === undefined) return null;
  if (!Buffer.isBuffer(bytes) || bytes.length > 4 * 1024 * 1024) {
    throw new Error('Resident daemon genome must be an AgentDNA buffer below 4 MiB');
  }
  const model = decodeBuffer(bytes);
  if (model.signed && !model.signatureValid) throw new Error('Resident daemon genome signature invalid');
  if (require('../agentDnaPolicy').envRequiresSignature() && !model.signatureValid) {
    throw new Error('Resident daemon genome requires an authorized signature');
  }
  if (model.phenotype.role !== 'resident_daemon') throw new Error('Resident daemon genome role mismatch');
  return { genomeId: model.meta.genomeId, contentHash: model.contentHash,
    format: model.format, alphabet: model.alphabet };
}

module.exports = { bindGenome, runtimeGenome, GENOME_REF };
