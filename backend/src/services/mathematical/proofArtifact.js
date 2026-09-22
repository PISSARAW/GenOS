'use strict';

/**
 * @file proofArtifact.js
 * @description ProofArtifact — a mathematical result with verification receipt.
 * No theorem/lemma exists without a kernel certificate.
 *
 * ProofArtifact is a VIEW over FormalResult + LeanIncrementalGate receipt.
 * Direct receipt attachment is FORBIDDEN — verification MUST pass through Lean gate.
 * No fake receipts, no sorry/admit, no bypass.
 *
 * CRITICAL: The Lean source MUST prove EXACTLY the canonicalStatement,
 * not a trivial substitute like `True`. The Lean 4 kernel is the physics
 * of this world — no statement passes without a valid proof of itself.
 */

const { createFormalResult, decodeFormalResult } = require('../formalResultService');
const { LeanIncrementalGate, PLACEHOLDER_PROOF } = require('../epistemicScheduler/leanIncrementalGate');
const { createHash } = require('node:crypto');

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const ARTIFACT_TYPES = Object.freeze(['conjecture', 'lemma', 'theorem', 'counterexample', 'obligation']);

/**
 * Check if a Lean source is a trivial placeholder (e.g., proves `True`).
 * This prevents the classic epistemic bypass: proving something other than the claim.
 */
function isTrivialLeanSource(source) {
  if (!source || typeof source !== 'string') return true;
  const trimmed = source.trim();
  // Detect common trivial patterns
  const trivialPatterns = [
    /theorem\s+\w+\s*:\s*True\s*:=/,
    /theorem\s+\w+\s*:\s*False\s*→/,
    /:\s*True\s*:=\s*by\s+trivial/,
    /:\s*True\s*:=\s*by\s+tauto/,
    /exact\s+\(\s*by\s+trivial\s*\)/, 
  ];
  return trivialPatterns.some(p => p.test(trimmed));
}

/**
 * Compute statement fingerprint from canonical statement for binding.
 * The Lean proof must produce a sourceDigest that can be linked to this.
 */
function statementFingerprint(statement) {
  return `sha256:${createHash('sha256').update(statement).digest('hex')}`;
}

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
    this._statementFingerprint = options.statement ? statementFingerprint(options.statement) : null;
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
    // Bind statement fingerprint
    if (!formalResult.canonicalStatement) {
      throw new Error('FormalResult must have a canonicalStatement.');
    }
    const expectedFp = statementFingerprint(formalResult.canonicalStatement);
    // Store for later binding verification
    this._statementFingerprint = expectedFp;
    
    this._formalResult = formalResult;
    this.status = formalResult.status;
    this.verifiedBy = formalResult.producer?.model || null;
    return this;
  }

  /**
   * Verify this artifact through the LeanIncrementalGate.
   * This is the ONLY way to produce a verified artifact.
   * Uses leanGate.verifyNode() which enforces: prerequisites, validation, graph update, publish.
   * The Lean source MUST prove the canonicalStatement, not a trivial substitute.
   */
  async verifyThroughLean(leanGate, source) {
    if (!leanGate || typeof leanGate.verifyNode !== 'function') {
      throw new Error('ProofArtifact.verifyThroughLean requires a LeanIncrementalGate instance.');
    }
    if (!this._formalResult) {
      throw new Error('Cannot verify: no FormalResult attached. Call attachFormalResult first.');
    }
    if (!this._formalResult.canonicalStatement) {
      throw new Error('Cannot verify: FormalResult missing canonicalStatement.');
    }

    // CRITICAL: Reject trivial Lean sources that don't prove the actual statement
    if (isTrivialLeanSource(source)) {
      throw new Error('Lean source proves trivial True — must prove the canonicalStatement exactly.');
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

    // Use the gate's verifyNode — this enforces all guarantees:
    // - graph.getNode() type check
    // - status === 'formalized' 
    // - prerequisitesVerified() with dependency receipts
    // - validateRequest() including sorry/admit check
    // - graph.updateStatus()
    // - publish()
    const nodeId = this._formalResult.resultId.replace('sha256:', '').slice(0, 64); // derive nodeId
    const leanNodeId = `node-${nodeId}`; // adapter for gate
    
    // Ensure the gate has this node registered with the right statement
    const graph = leanGate.graph;
    const existingNode = graph.getNode(leanNodeId);
    if (!existingNode) {
      // Register the node with the canonical statement
      graph.addNode({
        nodeId: leanNodeId,
        type: this.type === 'theorem' ? 'theorem' : 'lemma',
        canonicalStatement: this._formalResult.canonicalStatement,
        status: 'formalized',
      });
    } else if (existingNode.canonicalStatement !== this._formalResult.canonicalStatement) {
      throw new Error('Gate node statement mismatch with FormalResult canonicalStatement.');
    }

    // Call the gate's verifyNode — this is the ONLY path to verification
    const receipt = await leanGate.verifyNode({
      nodeId: leanNodeId,
      source,
      timeoutMs: 300000,
      leanExecutable: 'lean',
    });

    if (receipt.status !== 'passed') {
      this.status = 'failed';
      this._leanReceipt = receipt;
      return false;
    }

    // CRITICAL: Atomic transition — create NEW FormalResult with status=verified
    // This replaces the old formalResult entirely, no partial state
    const verifiedFormalResult = createFormalResult({
      canonicalStatement: this._formalResult.canonicalStatement,
      status: 'verified',
      evidence: {
        kind: 'proof',
        content: this._formalResult.evidence?.content || source,
        reproduction: { command: 'lean', environment: leanGate.toolchainVersion },
      },
      assumptions: this._formalResult.assumptions,
      validityDomain: this._formalResult.validityDomain,
      dependencies: this._formalResult.dependencies,
      provenance: {
        ...this._formalResult.provenance,
        transformations: [
          ...(this._formalResult.provenance?.transformations || []),
          `lean_verification:${receipt.receiptDigest}`,
        ],
      },
      producer: {
        model: leanGate.toolchainVersion,
        version: '1.0',
      },
    });

    // Verify integrity of the new result
    if (verifiedFormalResult.status !== 'verified') {
      throw new Error('Verified FormalResult creation failed integrity check.');
    }

    this._formalResult = verifiedFormalResult;
    this._leanReceipt = receipt;
    this.receipt = {
      resultId: this._formalResult.resultId,
      semanticFingerprint: this._formalResult.semanticFingerprint,
      status: 'verified',
      evidence: this._formalResult.evidence,
      provenance: this._formalResult.provenance,
      leanReceipt: receipt,
    };
    this.status = 'verified';
    this.verifiedBy = leanGate.toolchainVersion;
    return true;
  }

  /**
   * Check if artifact is genuinely verified.
   * Requires: verified status, real FormalResult(status=verified), real Lean receipt with valid SHA-256 digests.
   */
  isVerified() {
    return this.status === 'verified'
      && this._formalResult !== null
      && this._formalResult.status === 'verified'
      && this._formalResult.evidence?.kind === 'proof'
      && this._leanReceipt !== null
      && this._leanReceipt.status === 'passed'
      && SHA256.test(this._leanReceipt.sourceDigest || '')
      && SHA256.test(this._leanReceipt.receiptDigest || '')
      && SHA256.test(this._leanReceipt.environmentDigest || '');
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
      formalResultStatus: this._formalResult?.status,
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
  isTrivialLeanSource,
  statementFingerprint,
};
