const fs = require('fs');

const { decodeBuffer } = require('./decode');
const { express } = require('./express');

function decodeFile(filePath) {
  return decodeBuffer(fs.readFileSync(filePath));
}

function workerGenes(model) {
  const phenotype = model.phenotype || express(model);
  return {
    role: phenotype.role,
    strategy: phenotype.strategy,
    tools: phenotype.tools,
    capabilities: phenotype.capabilities,
    prompt: phenotype.prompt,
    temp: phenotype.temp,
    topP: phenotype.topP,
    exprTfs: phenotype.exprTfs,
    exprMirnas: phenotype.exprMirnas,
    silenced: phenotype.silenced,
    expressed: phenotype.expressed,
    genomeContentHash: model.contentHash || null
  };
}

module.exports = { decodeBuffer, decodeFile, express, workerGenes };
