'use strict';

/**
 * @file proofArtifact.js
 * @description ProofArtifact — a mathematical result with verification receipt.
 * No theorem/lemma exists without a kernel certificate.
 *
 * ProofArtifact is now a verified view over FormalResult + LeanIncrementalGate.
 * attachReceipt() is forbidden — verification must pass through the Lean gate.
 */

const { createFormalResult, decodeFormalResult } = require('../formalResultService');
const { LeanIncrementalGate, PLACEHOLDER_PROOF } = require('../epistemicScheduler/leanIncrementalGate');

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const ARTIFACT_TYPES = Object.freeze(['conjecture', 'lemma', 'theorem', 'counterexample', 'obligation']);

class ProofArtifact {
  constructor(options = {}) {
    this.id = options.id || `art-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    this._formalResult = options._formalResult || null;
  }

  /**
   * Attach a formal result created by formalResultService.
   * The result must have valid proof evidence.
   */
  attachFormalResult(formalResult) {
    if (!formalResult || typeof formalResult !== 'object') {
      throw new Error('ProofArtifact.attachFormalResult requires a FormalResult object.');
    }
    if (formalResult.status === 'verified' && formalResult.evidence.kind !== 'proof') {
      throw new Error('Verified status requires proof evidence.');
    }
    this._formalResult = formalResult;
    this.receipt = {
      resultId: formalResult.resultId,
      semanticFingerprint: formalResult.semanticFingerprint,
      status: formalResult.status,
      evidence: formalResult.evidence,
      provenance: formalResult.provenance,
    };
    this.verifiedBy = formalResult.producer?.model || null;
    this.status = formalResult.status === 'verified' ? 'verified' : formalResult.status;
    return this;
  }

  /**
   * Verify this artifact through the LeanIncrementalGate.
   * This is the only way to produce a verified artifact.
   */
  async verifyThroughLean(leanGate, source) {
    if (!leanGate || typeof leanGate.verifyNode !== 'function') {
      throw new Error('ProofArtifact.verifyThroughLean requires a LeanIncrementalGate instance.');
    }
    if (PLACEHOLDER_PROOF.test(source || '')) {
      throw new Error('Lean placeholders sorry/admit are forbidden.');
    }

    const execution = await leanGate.executor({
      nodeId: this.id,
      source,
      leanExecutable: 'lean',
      toolchainVersion: leanGate.toolchainVersion,
      environmentDigest: leanGate.environmentDigest,
    });

    if (execution.exitCode !== 0) {
      this.status = 'failed';
      return false;
    }

    this.receipt = {
      nodeId: this.id,
      status: 'passed',
      toolchainVersion: leanGate.toolchainVersion,
      environmentDigest: leanGate.environmentDigest,
      sourceDigest: execution.sourceDigest,
      axioms: execution.axioms || [],
      checkedAt: new Date().toISOString(),
    };
    this.status = 'verified';
    this.verifiedBy = leanGate.toolchainVersion;
    return true;
  }

  isVerified() {
    return this.status === 'verified'
      && this.receipt !== null
      && this._formalResult !== null
      && SHA256.test(this.receipt.sourceDigest || '');
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
};
