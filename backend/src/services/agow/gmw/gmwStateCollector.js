'use strict';

async function collect(options) {
  const receipts = await require('../workspaceMediationService').list({ agentId: options.agentId, db: options.db });
  return receipts.filter(hasVectors).map(toSample);
}

function hasVectors(receipt) {
  const sample = receipt.interventionSample;
  return Array.isArray(sample?.inputVector) && Array.isArray(sample?.outputDelta)
    && sample.inputVector.length > 0 && sample.outputDelta.length > 0;
}

function toSample(receipt) {
  return { source: receipt.sourceModule, target: receipt.targetModule,
    condition: receipt.interventionSample.condition, input: receipt.interventionSample.inputVector,
    output: receipt.interventionSample.outputDelta, evidenceRef: receipt.receiptId };
}

module.exports = { collect, hasVectors, toSample };
