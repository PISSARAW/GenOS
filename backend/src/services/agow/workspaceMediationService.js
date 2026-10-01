'use strict';

const { randomUUID } = require('node:crypto');
const receipts = [];

function record(options) {
  const { candidate, frame, targetModule, transformation } = options || {};
  if (!candidate?.candidateId || !frame?.frameId || !targetModule || !transformation) return { recorded: false, reason: 'incomplete_causal_chain' };
  const receipt = {
    receiptId: randomUUID(), sourceModule: candidate.source.module, sourceCandidateId: candidate.candidateId,
    frameId: frame.frameId, targetModule, beforeStateHash: options.beforeStateHash || null,
    afterStateHash: options.afterStateHash || null, workspaceTransformation: transformation,
    downstreamAction: options.downstreamAction || null, outcome: options.outcome || null, createdAt: Date.now()
  };
  receipts.push(receipt);
  return { recorded: true, receipt };
}

function list(options) {
  return receipts.filter((receipt) => (!options?.sourceModule || receipt.sourceModule === options.sourceModule)
    && (!options?.targetModule || receipt.targetModule === options.targetModule));
}

function influenceMatrix(options) {
  const selected = list(options);
  const matrix = {};
  for (const receipt of selected) {
    const key = `${receipt.sourceModule}->${receipt.targetModule}`;
    const edge = matrix[key] || { observations: 0, changed: 0 };
    edge.observations += 1;
    if (receipt.beforeStateHash && receipt.afterStateHash && receipt.beforeStateHash !== receipt.afterStateHash) edge.changed += 1;
    matrix[key] = edge;
  }
  return Object.fromEntries(Object.entries(matrix).map(([key, value]) => [key, { ...value, changeRate: value.changed / value.observations }]));
}

module.exports = { record, list, influenceMatrix };
