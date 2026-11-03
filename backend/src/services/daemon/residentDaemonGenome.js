'use strict';

const { decodeBuffer } = require('../agentDna');

function bindGenome(bytes) {
  if (bytes === undefined) return null;
  if (!Buffer.isBuffer(bytes) || bytes.length > 4 * 1024 * 1024) {
    throw new Error('Resident daemon genome must be an AgentDNA buffer below 4 MiB');
  }
  const model = decodeBuffer(bytes);
  if (model.signed && !model.signatureValid) throw new Error('Resident daemon genome signature invalid');
  if (model.phenotype.role !== 'resident_daemon') throw new Error('Resident daemon genome role mismatch');
  return { genomeId: model.meta.genomeId, contentHash: model.contentHash,
    format: model.format, alphabet: model.alphabet };
}

module.exports = { bindGenome };
