'use strict';

const { createHash } = require('node:crypto');
const { pack } = require('msgpackr');

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const PLACEHOLDER_PROOF = /\b(?:sorry|admit)\b/u;

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function validateConfiguration(options) {
  if (!options.graph) throw new Error('graph is required.');
  if (typeof options.executor !== 'function') throw new Error('A Lean executor is required.');
  if (!String(options.toolchainVersion || '').trim()) throw new Error('toolchainVersion is required.');
  if (!SHA256.test(String(options.environmentDigest || ''))) throw new Error('environmentDigest must be a SHA-256 fingerprint.');
}

function receiptDigest(receipt) {
  return digest(pack([
    receipt.nodeId, receipt.sourceDigest, receipt.toolchainVersion,
    receipt.environmentDigest, receipt.dependencyReceiptDigests,
    receipt.status, receipt.axioms, receipt.checkedAt,
  ]));
}

class LeanIncrementalGate {
  constructor(options = {}) {
    validateConfiguration(options);
    this.graph = options.graph;
    this.executor = options.executor;
    this.toolchainVersion = options.toolchainVersion;
    this.environmentDigest = options.environmentDigest;
    this.allowedAxioms = new Set(options.allowedAxioms || []);
    this.clock = options.clock || (() => new Date().toISOString());
    this.publish = options.publish || (() => {});
    this.receipts = new Map();
  }

  prerequisiteIds(nodeId) {
    return this.graph.incoming(nodeId, true).map((edge) => edge.from).sort();
  }

  dependencyReceipts(nodeId) {
    return this.prerequisiteIds(nodeId).map((id) => this.receipts.get(id)).filter(Boolean);
  }

  prerequisitesVerified(nodeId) {
    const ids = this.prerequisiteIds(nodeId);
    const receipts = this.dependencyReceipts(nodeId);
    return receipts.length === ids.length && receipts.every((receipt) => receipt.status === 'passed');
  }

  pendingVerifications() {
    return this.graph.exportGraph().nodes
      .filter((node) => ['lemma', 'theorem'].includes(node.type) && node.status === 'formalized')
      .filter((node) => this.prerequisitesVerified(node.nodeId))
      .map((node) => node.nodeId);
  }

  rejectedReceipt(nodeId, reason, source = '') {
    const receipt = {
      nodeId, status: 'failed', reason,
      sourceDigest: digest(Buffer.from(source)),
      toolchainVersion: this.toolchainVersion,
      environmentDigest: this.environmentDigest,
      dependencyReceiptDigests: this.dependencyReceipts(nodeId).map((item) => item.receiptDigest),
      axioms: [], checkedAt: this.clock(),
    };
    receipt.receiptDigest = receiptDigest(receipt);
    this.receipts.set(nodeId, receipt);
    this.graph.updateStatus(nodeId, 'blocked');
    this.publish(receipt);
    return receipt;
  }

  validateRequest(input) {
    const node = this.graph.getNode(input.nodeId);
    if (!node || !['lemma', 'theorem'].includes(node.type)) return 'Node must be a lemma or theorem.';
    if (node.status !== 'formalized') return 'Node must be formalized before Lean verification.';
    if (!this.prerequisitesVerified(input.nodeId)) return 'All prerequisite lemmas require passing Lean receipts.';
    if (typeof input.source !== 'string' || !input.source.trim()) return 'Lean source is required.';
    if (PLACEHOLDER_PROOF.test(input.source)) return 'Lean placeholders sorry/admit are forbidden.';
    return null;
  }

  forbiddenAxioms(axioms = []) {
    return axioms.filter((axiom) => !this.allowedAxioms.has(axiom));
  }

  async verifyNode(input = {}) {
    const rejection = this.validateRequest(input);
    if (rejection) return this.rejectedReceipt(input.nodeId, rejection, input.source);
    const dependencyReceiptDigests = this.dependencyReceipts(input.nodeId).map((item) => item.receiptDigest);
    const execution = await this.executor({
      nodeId: input.nodeId, source: input.source, timeoutMs: input.timeoutMs,
      leanExecutable: input.leanExecutable, toolchainVersion: this.toolchainVersion,
      environmentDigest: this.environmentDigest, dependencyReceiptDigests,
    });
    const forbidden = this.forbiddenAxioms(execution.axioms);
    const passed = execution.exitCode === 0 && execution.toolchainVersion === this.toolchainVersion && forbidden.length === 0;
    const receipt = {
      nodeId: input.nodeId, status: passed ? 'passed' : 'failed',
      reason: passed ? null : (forbidden.length ? 'forbidden_axioms' : 'lean_execution_failed'),
      sourceDigest: digest(Buffer.from(input.source)), toolchainVersion: this.toolchainVersion,
      environmentDigest: this.environmentDigest, dependencyReceiptDigests,
      axioms: execution.axioms || [], checkedAt: this.clock(),
    };
    receipt.receiptDigest = receiptDigest(receipt);
    this.receipts.set(input.nodeId, receipt);
    this.graph.updateStatus(input.nodeId, passed ? 'verified' : 'blocked');
    this.publish(receipt);
    return receipt;
  }

  verificationReceipt(nodeId) {
    const receipt = this.receipts.get(nodeId);
    return receipt ? { ...receipt } : null;
  }
}

module.exports = { PLACEHOLDER_PROOF, LeanIncrementalGate, receiptDigest };
