'use strict';

/**
 * @file proofArtifact.js
 * @description ProofArtifact — a mathematical result with verification receipt.
 * No theorem/lemma exists without a kernel certificate.
 */

const crypto = require('node:crypto');

function artifactId() {
  return `art-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

const ARTIFACT_TYPES = Object.freeze(['conjecture', 'lemma', 'theorem', 'counterexample', 'obligation']);

class ProofArtifact {
  constructor(options = {}) {
    this.id = options.id || artifactId();
    this.type = options.type || 'conjecture';
    this.statement = options.statement || '';
    this.domain = options.domain || 'general';
    this.proof = options.proof || null;
    this.receipt = options.receipt || null;
    this.status = options.status || 'conjecture';
    this.dependencies = options.dependencies || [];
    this.producedBy = options.producedBy || null;
    this.verifiedBy = options.verifiedBy || null;
    this.createdAt = new Date().toISOString();
  }

  attachReceipt(receipt) {
    this.receipt = receipt;
    this.verifiedBy = receipt.toolchainVersion || null;
    this.status = receipt.status === 'passed' ? 'verified' : 'failed';
    return this;
  }

  isVerified() {
    return this.status === 'verified' && this.receipt !== null;
  }

  summary() {
    return {
      id: this.id,
      type: this.type,
      statement: this.statement.substring(0, 80),
      status: this.status,
      verified: this.isVerified(),
      producedBy: this.producedBy,
    };
  }
}

function createProofArtifact(options) {
  return new ProofArtifact(options);
}

module.exports = {
  ProofArtifact,
  createProofArtifact,
  ARTIFACT_TYPES,
  artifactId,
};
