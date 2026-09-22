'use strict';

/**
 * @file proofArtifact.js
 * @description ProofArtifact — a mathematical result with verification receipt.
 * No theorem/lemma exists without a kernel certificate.
 *
 * ProofArtifact is a VIEW over FormalResult + LeanIncrementalGate receipt.
 * Direct receipt attachment is FORBIDDEN — verification MUST pass through Lean gate.
 * No fake receipts, no sorry/admit, no bypass.
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
    this.receipt = null;
    this.status = options.status || 'conjecture';
    this.dependencies = options.dependencies || [];
    this.producedBy = options.producedBy || null;
    this.verifiedBy = null;
    this.createdAt = new Date().toISOString();
    this._formalResult = null;
    this._leanReceipt = null;
  }

  /**
   * Attach a FormalResult created by formalResultService.
   * The result MUST have valid proof evidence and real SHA-256 fingerprints.
   * This does NOT verify — it only attaches the formalized statement.
   * Verification requires verifyThroughLean().
   */
  attachFormalResult(formalResult) {
    if (!formalResult || typeof formalResult !== 'object') {
      throw new Error('ProofArtifact.attachFormalResult requires a FormalResult object.');
    }
    if (!formalResult.resultId || !SHA256.test(formalResult.resultId)) {
      throw new Error('FormalResult must have a valid SHA-256 resultId.');
    }
    if (!formalResult.semanticFingerprint || !SHA256.test(formalResult.semanticFingerprint)) {
      throw new Error('FormalResult must have a valid SHA-256 semanticFingerprint.');
    }
    if (formalResult.status === 'verified' && formalResult.evidence.kind !== 'proof') {
      throw new Error('Verified status requires proof evidence.');
    }
    // Reject any attempt to inject fake receipts
    if (formalResult.status === 'verified' && (!formalResult.provenance || !formalResult.provenance.source?.digest || !SHA256.test(formalResult.provenance.source.digest))) {
      throw new Error('Verified FormalResult requires valid provenance with SHA-256 source digest.');
    }
    this._formalResult = formalResult;
    this.status = formalResult.status;
    this.verifiedBy = formalResult.producer?.model || null;
    return this;
  }

  /**
   * Verify this artifact through the LeanIncrementalGate.
   * This is the ONLY way to produce a verified artifact.
   * Requires: real Lean execution, no sorry/admit, pinned toolchain, valid dependencies.
   */
  async verifyThroughLean(leanGate, source) {
    if (!leanGate || typeof leanGate.verifyNode !== 'function') {
      throw new Error('ProofArtifact.verifyThroughLean requires a LeanIncrementalGate instance.');
    }
    if (!this._formalResult) {
      throw new Error('Cannot verify: no FormalResult attached. Call attachFormalResult first.');
    }
    if (PLACEHOLDER_PROOF.test(source || '')) {
      throw new Error('Lean placeholders sorry/admit are forbidden.');
    }
    if (!SHA256.test(leanGate.environmentDigest)) {
      throw new Error('LeanIncrementalGate must have a valid SHA-256 environmentDigest.');
    }
    if (!leanGate.toolchainVersion || !String(leanGate.toolchainVersion).trim()) {
      throw new Error('LeanIncrementalGate must have a pinned toolchainVersion.');
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
      this._leanReceipt = {
        nodeId: this.id,
        status: 'failed',
        reason: 'lean_execution_failed',
        sourceDigest: execution.sourceDigest,
        toolchainVersion: leanGate.toolchainVersion,
        environmentDigest: leanGate.environmentDigest,
        axioms: execution.axioms || [],
        checkedAt: new Date().toISOString(),
      };
      return false;
    }

    const forbiddenAxioms = leanGate.forbiddenAxioms(execution.axioms);
    const passed = execution.exitCode === 0
      && execution.toolchainVersion === leanGate.toolchainVersion
      && forbiddenAxioms.length === 0;

    if (!passed) {
      this.status = 'failed';
      this._leanReceipt = {
        nodeId: this.id,
        status: 'failed',
        reason: forbiddenAxioms.length > 0 ? 'forbidden_axioms' : 'lean_execution_failed',
        sourceDigest: execution.sourceDigest,
        toolchainVersion: leanGate.toolchainVersion,
        environmentDigest: leanGate.environmentDigest,
        axioms: execution.axioms || [],
        checkedAt: new Date().toISOString(),
      };
      return false;
    }

    // Build cryptographic receipt matching LeanIncrementalGate format
    const dependencyReceiptDigests = leanGate.dependencyReceipts(this.id).map(r => r.receiptDigest);
    this._leanReceipt = {
      nodeId: this.id,
      status: 'passed',
      sourceDigest: execution.sourceDigest,
      toolchainVersion: leanGate.toolchainVersion,
      environmentDigest: leanGate.environmentDigest,
      dependencyReceiptDigests,
      axioms: execution.axioms || [],
      checkedAt: new Date().toISOString(),
    };
    this._leanReceipt.receiptDigest = require('../epistemicScheduler/leanIncrementalGate').receiptDigest(this._leanReceipt);

    this.receipt = {
      resultId: this._formalResult.resultId,
      semanticFingerprint: this._formalResult.semanticFingerprint,
      status: 'verified',
      evidence: this._formalResult.evidence,
      provenance: this._formalResult.provenance,
      leanReceipt: this._leanReceipt,
    };
    this.status = 'verified';
    this.verifiedBy = leanGate.toolchainVersion;
    return true;
  }

  /**
   * Check if artifact is genuinely verified.
   * Requires: verified status, real FormalResult, real Lean receipt with valid SHA-256 digests.
   */
  isVerified() {
    return this.status === 'verified'
      && this._formalResult !== null
      && this._leanReceipt !== null
      && this._leanReceipt.status === 'passed'
      && SHA256.test(this._leanReceipt.sourceDigest || '')
      && SHA256.test(this._leanReceipt.receiptDigest || '')
      && SHA256.test(this._leanReceipt.environmentDigest || '')
      && this._formalResult.status === 'verified'
      && this._formalResult.evidence?.kind === 'proof';
  }

  summary() {
    return {
      id: this.id,
      type: this.type,
      statement: this.statement.substring(0, 80),
      status: this.status,
      verified: this.isVerified(),
      producedBy: this.producedBy,
      hasFormalResult: this._formalResult !== null,
      hasLeanReceipt: this._leanReceipt !== null,
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
