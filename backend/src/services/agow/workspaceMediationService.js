'use strict';

const { randomUUID } = require('node:crypto');
const SCOPE = 'agow_mediation_receipts';

async function record(options) {
  const { candidate, frame, targetModule, transformation } = options || {};
  if (!validChain({ candidate, frame, targetModule, transformation })) return { recorded: false, reason: 'incomplete_causal_chain' };
  const persistence = require('./agowStatePersistenceService');
  const loaded = await persistence.load({ scope: SCOPE, agentId: frame.agentId, db: options.db });
  const receipts = Array.isArray(loaded.state.receipts) ? loaded.state.receipts : [];
  const receipt = {
    receiptId: randomUUID(), sourceModule: candidate.source.module, sourceCandidateId: candidate.candidateId,
    frameId: frame.frameId, targetModule, beforeStateHash: options.beforeStateHash || null,
    afterStateHash: options.afterStateHash || null, workspaceTransformation: transformation,
    downstreamAction: options.downstreamAction || null, outcome: options.outcome || null, createdAt: Date.now()
  };
  receipts.push(receipt);
  await persistence.save({ scope: SCOPE, agentId: frame.agentId, db: loaded.db, state: { receipts: receipts.slice(-5000) }, version: receipts.length });
  return { recorded: true, receipt };
}

function validChain(options) {
  const { candidate, frame, targetModule, transformation } = options;
  return Boolean(candidate?.candidateId && frame?.frameId && targetModule && transformation);
}

async function list(options) {
  const loaded = await require('./agowStatePersistenceService').load({ scope: SCOPE, agentId: options.agentId, db: options.db });
  const receipts = Array.isArray(loaded.state.receipts) ? loaded.state.receipts : [];
  return receipts.filter((receipt) => (!options?.sourceModule || receipt.sourceModule === options.sourceModule)
    && (!options?.targetModule || receipt.targetModule === options.targetModule));
}

async function influenceMatrix(options) {
  const selected = await list(options);
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
