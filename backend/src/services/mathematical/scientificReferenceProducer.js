'use strict';

const { createHash } = require('node:crypto');
const { naturalStatementFingerprint } = require('./formalizationArtifact');

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function requiredText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  return value;
}

function requireProducer(options) {
  if (typeof options.workflow?.publishVerified !== 'function' ||
      typeof options.authority?.attest !== 'function') {
    throw new Error('Scientific producer requires a workflow and receipt authority.');
  }
  for (const name of ['organizationId', 'projectId', 'workspaceId', 'senderAgentId']) {
    requiredText(options[name], name);
  }
}

function assertDirectProof(artifact) {
  const formalResult = artifact._formalResult;
  if (!['theorem', 'lemma', 'obligation'].includes(artifact.type)) {
    throw new Error('Scientific producer requires a mathematical proof artifact.');
  }
  if (!Array.isArray(formalResult?.dependencies) || formalResult.dependencies.length !== 0 ||
      !Array.isArray(formalResult.assumptions) || formalResult.assumptions.length !== 0) {
    throw new Error('Scientific producer only publishes direct dependency-free Lean proofs.');
  }
}

function verifiedInput(attempt) {
  const artifact = attempt?.artifact;
  if (!artifact?.isVerified?.() || !attempt.verified) {
    throw new Error('Scientific producer requires a Lean-verified proof artifact.');
  }
  assertDirectProof(artifact);
  const receipt = artifact.receipt?.leanReceipt;
  const canonicalStatement = artifact._formalResult?.canonicalStatement;
  const source = requiredText(attempt.leanSource, 'Exact Lean source');
  if (!receipt || canonicalStatement !== attempt.goal ||
      receipt.formalStatementDigest !== naturalStatementFingerprint(canonicalStatement) ||
      digest(Buffer.from(source, 'utf8')) !== receipt.sourceDigest) {
    throw new Error('Scientific proof is not bound to its direct formal statement and source.');
  }
  return { artifact, receipt, canonicalStatement, source };
}

function referenceFor(options, proof) {
  const { artifact, receipt, canonicalStatement, source } = proof;
  const contentBytes = Buffer.from(source, 'utf8');
  const validityDomain = artifact._formalResult.validityDomain?.statement;
  const reference = {
    organizationId: options.organizationId, projectId: options.projectId,
    workspaceId: options.workspaceId, objectType: artifact.type === 'theorem' ? 'theorem' : 'lemma',
    objectId: receipt.nodeId, version: 1,
    contentDigest: digest(contentBytes), sourceDigest: receipt.sourceDigest,
    canonicalStatement, formalStatementDigest: receipt.formalStatementDigest,
    environmentDigest: receipt.environmentDigest,
    assumptions: artifact._formalResult.assumptions,
    validityDomain: requiredText(validityDomain, 'Proof validity domain'),
    dependencies: [],
  };
  return { reference, contentBytes };
}

function createScientificReferenceProducer(options = {}) {
  requireProducer(options);
  async function publishVerified(attempt) {
    const proof = verifiedInput(attempt);
    const { reference, contentBytes } = referenceFor(options, proof);
    await options.authority.attest({ receipt: proof.receipt, ref: reference,
      source: proof.source, canonicalStatement: proof.canonicalStatement });
    return options.workflow.publishVerified({ reference, contentBytes,
      receiptDigest: proof.receipt.receiptDigest, senderAgentId: options.senderAgentId });
  }
  return Object.freeze({ publishVerified });
}

module.exports = { createScientificReferenceProducer };
