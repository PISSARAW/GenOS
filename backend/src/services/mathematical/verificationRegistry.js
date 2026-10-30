'use strict';

/**
 * @file verificationRegistry.js
 * @description VerificationRegistry — single source of truth for verified receipts.
 *
 * Architectural rule: an agent must NEVER fabricate its own epistemic authority.
 * The culture asks "Is this receipt digest valid?" to this registry, not
 * "Does this object say it is verified?" to the ProofArtifact itself.
 *
 * Registration requires an immutable receipt issued by a gate in this process.
 * Injected gate executors remain trusted configuration, never caller evidence.
 */

class VerificationRegistry {
  #verifiedReceipts = new Map();
  /**
   * Register a verified receipt. Called by LeanIncrementalGate.publish().
   * @param {object} receipt — the receipt produced by verifyNode()
   */
  registerVerified(receipt) {
    const { isGateReceipt } = require('../epistemicScheduler/leanIncrementalGate');
    if (!receipt || receipt.status !== 'passed' || !isGateReceipt(receipt)) return false;
    if (!receipt.receiptDigest || !/^sha256:[a-f0-9]{64}$/.test(receipt.receiptDigest)) return false;
    this.#verifiedReceipts.set(receipt.receiptDigest, receipt);
    return true;
  }

  /**
   * Check if a receipt digest is genuinely verified by the Lean kernel.
   * @param {string} receiptDigest — SHA-256 digest to check
   * @returns {boolean}
   */
  isReceiptValid(receiptDigest) {
    if (!receiptDigest || !/^sha256:[a-f0-9]{64}$/.test(receiptDigest)) return false;
    return this.#verifiedReceipts.has(receiptDigest);
  }

  /**
   * Check if a Lean receipt object is valid (has passed + registered digest).
   * @param {object} receipt — Lean receipt object
   * @returns {boolean}
   */
  isLeanReceiptValid(receipt) {
    if (!receipt || receipt.status !== 'passed') return false;
    const { receiptDigest } = require('../epistemicScheduler/leanIncrementalGate');
    try {
      return this.isReceiptValid(receipt.receiptDigest || '') && receiptDigest(receipt) === receipt.receiptDigest;
    } catch (_) { return false; }
  }

  revokeNode(nodeId) {
    for (const [digest, receipt] of this.#verifiedReceipts) {
      if (receipt.nodeId === nodeId) this.#verifiedReceipts.delete(digest);
    }
  }

  /**
   * Get verification metadata for a receipt digest.
   * @param {string} receiptDigest
   * @returns {object|null}
   */
  getVerification(receiptDigest) {
    const receipt = this.#verifiedReceipts.get(receiptDigest);
    return receipt ? { nodeId: receipt.nodeId, toolchainVersion: receipt.toolchainVersion, checkedAt: receipt.checkedAt } : null;
  }

  size() {
    return this.#verifiedReceipts.size;
  }

  clear() {
    this.#verifiedReceipts.clear();
  }
}

// Singleton instance — shared across the process
const globalRegistry = new VerificationRegistry();

module.exports = { VerificationRegistry, globalRegistry };
