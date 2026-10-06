'use strict';

const { normalizeRouteOutcome } = require('../contracts/routeOutcome');
const { createHash } = require('node:crypto');
const verifierReceipts = require('../../epistemicVerifierReceiptService');

function outcomeDigest(receipt) {
  const payload = [receipt.routeId, receipt.needId, receipt.capability, receipt.nodeIds.join('/'), receipt.edgeIds.join('/'), receipt.outcome, (receipt.verification?.evidenceRefs || []).join('/')].join('\u0000');
  const bound = receipt.executionDigest ? payload + '\u0000' + receipt.executionDigest : payload;
  return `sha256:${createHash('sha256').update(bound).digest('hex')}`;
}

function validateReceipt(session, input, trustedVerifierDigests) {
  const receipt = normalizeRouteOutcome(input);
  if (receipt.outcome !== receipt.verification.result) {
    throw Object.assign(new Error('Route outcome does not match its verification receipt.'), { code: 'RHIZOME_ROUTE_RECEIPT_INVALID' });
  }
  const expectedId = `route:${receipt.needId}:${receipt.edgeIds.join('/') || receipt.nodeIds[0]}`;
  if (receipt.routeId !== expectedId || receipt.nodeIds.length !== receipt.edgeIds.length + 1) {
    throw Object.assign(new Error('Route receipt does not match the planned path.'), { code: 'RHIZOME_ROUTE_RECEIPT_INVALID' });
  }
  if (receipt.verification.signedReceipt.resultId !== receipt.routeId
    || receipt.verification.signedReceipt.evidenceDigest !== outcomeDigest(receipt)
    || !verifierReceipts.validateReceipt(receipt.verification.signedReceipt, trustedVerifierDigests)) {
    throw Object.assign(new Error('Route outcome lacks a trusted, evidence-bound verifier receipt.'), { code: 'RHIZOME_ROUTE_RECEIPT_INVALID' });
  }
  if (receipt.verification.signedReceipt.status !== 'verified' || receipt.verification.signedReceipt.independent !== true) {
    throw Object.assign(new Error('Route outcome requires independent verified evidence.'), { code: 'RHIZOME_ROUTE_RECEIPT_INVALID' });
  }
  validatePath(session, receipt);
  return receipt;
}

function validatePath(session, receipt) {
  const byId = new Map((session.edges || []).map((edge) => [edge.edgeId, edge]));
  for (let index = 0; index < receipt.edgeIds.length; index += 1) {
    const edge = byId.get(receipt.edgeIds[index]);
    if (!edge || edge.status !== 'ACTIVE' || edge.from !== receipt.nodeIds[index] || edge.to !== receipt.nodeIds[index + 1]) {
      throw Object.assign(new Error('Route receipt contains an invalid or inactive edge.'), { code: 'RHIZOME_ROUTE_RECEIPT_INVALID' });
    }
  }
  validateNodes(session, receipt.nodeIds);
  const target = (session.nodes || []).find((node) => node.nodeId === receipt.nodeIds.at(-1));
  if (!validTarget(target, receipt.capability)) {
    throw Object.assign(new Error('Route receipt target does not provide its capability.'), { code: 'RHIZOME_ROUTE_RECEIPT_INVALID' });
  }
}

function validateNodes(session, ids) {
  const nodes = new Map((session.nodes || []).map(node => [node.nodeId, node]));
  if (ids.some(id => !nodes.has(id) || !['ACTIVE', 'AVAILABLE'].includes(nodes.get(id).state)
    || nodes.get(id).availability?.status === 'UNAVAILABLE')) {
    throw Object.assign(new Error('Route receipt traverses an unavailable node.'), { code: 'RHIZOME_ROUTE_RECEIPT_INVALID' });
  }
}

function validTarget(target, capability) {
  return Boolean(target) && ['ACTIVE', 'AVAILABLE'].includes(target.state)
    && target.availability?.status !== 'UNAVAILABLE' && target.capabilities.includes(capability);
}

module.exports = { validateReceipt, outcomeDigest };
