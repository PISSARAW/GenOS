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
    temp: phenotype.temp,
    topP: phenotype.topP
  };
}

module.exports = { decodeBuffer, decodeFile, express, workerGenes };
