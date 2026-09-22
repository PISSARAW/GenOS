'use strict';

/**
 * @file verificationRegistry.js
 * @description VerificationRegistry — single source of truth for verified receipts.
 *
 * Architectural rule: an agent must NEVER fabricate its own epistemic authority.
 * The culture asks "Is this receipt digest valid?" to this registry, not
 * "Does this object say it is verified?" to the ProofArtifact itself.
 *
 * The registry is populated exclusively by LeanIncrementalGate.publish() when
 * a receipt with status === 'passed' is produced. No other path can register
 * a digest — self-declaration is impossible.
 */

class VerificationRegistry {
  constructor() {
    this._verifiedReceipts = new Map(); // receiptDigest → { nodeId, toolchainVersion, checkedAt }
  }

  /**
   * Register a verified receipt. Called by LeanIncrementalGate.publish().
   * @param {object} receipt — the receipt produced by verifyNode()
   */
  registerVerified(receipt) {
    if (!receipt || receipt.status !== 'passed') return false;
    if (!receipt.receiptDigest || !/^sha256:[a-f0-9]{64}$/.test(receipt.receiptDigest)) return false;
    this._verifiedReceipts.set(receipt.receiptDigest, {
      nodeId: receipt.nodeId || null,
      toolchainVersion: receipt.toolchainVersion || null,
      checkedAt: receipt.checkedAt || new Date().toISOString(),
    });
    return true;
  }

  /**
   * Check if a receipt digest is genuinely verified by the Lean kernel.
   * @param {string} receiptDigest — SHA-256 digest to check
   * @returns {boolean}
   */
  isReceiptValid(receiptDigest) {
    if (!receiptDigest || !/^sha256:[a-f0-9]{64}$/.test(receiptDigest)) return false;
    return this._verifiedReceipts.has(receiptDigest);
  }

  /**
   * Check if a Lean receipt object is valid (has passed + registered digest).
   * @param {object} receipt — Lean receipt object
   * @returns {boolean}
   */
  isLeanReceiptValid(receipt) {
    if (!receipt || receipt.status !== 'passed') return false;
    return this.isReceiptValid(receipt.receiptDigest || '');
  }

  /**
   * Get verification metadata for a receipt digest.
   * @param {string} receiptDigest
   * @returns {object|null}
   */
  getVerification(receiptDigest) {
    return this._verifiedReceipts.get(receiptDigest) || null;
  }

  size() {
    return this._verifiedReceipts.size;
  }

  clear() {
    this._verifiedReceipts.clear();
  }
}

// Singleton instance — shared across the process
const globalRegistry = new VerificationRegistry();

module.exports = { VerificationRegistry, globalRegistry };
