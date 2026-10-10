'use strict';

const { createHash } = require('node:crypto');
const { pack } = require('msgpackr');
const { globalRegistry } = require('../mathematical/verificationRegistry');
const { FormalizationArtifact, FormalizationRegistry, naturalStatementFingerprint, formalStatementFingerprint } = require('../mathematical/formalizationArtifact');

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
    receipt.nodeId, receipt.canonicalStatementDigest, receipt.formalStatementDigest,
    receipt.sourceDigest, receipt.toolchainVersion,
    receipt.environmentDigest, receipt.dependencyReceiptDigests,
    receipt.status, receipt.axioms, receipt.checkedAt,
  ]));
}

function formalizationError(node, formalization, registry) {
  if (!formalization || Object.getPrototypeOf(formalization) !== FormalizationArtifact.prototype || !Object.isFrozen(formalization)) {
    return 'A frozen FormalizationArtifact is required for formal binding.';
  }
  if (naturalStatementFingerprint(formalization.naturalStatement) !== formalization.naturalStatementFingerprint ||
      formalStatementFingerprint(formalization.formalStatement) !== formalization.formalStatementFingerprint) {
    return 'Formalization fingerprints are invalid.';
  }
  if (node.canonicalStatement !== formalization.naturalStatement &&
      node.canonicalStatement !== formalization.formalStatement) {
    return 'Formalization does not match the canonical statement.';
  }
  // A natural-language mapping requires the gate's registered authority.
  // Registry membership does not itself prove semantic equivalence.
  if (node.canonicalStatement !== formalization.formalStatement &&
      registry?.getByCanonical(node.canonicalStatement) !== formalization) {
    return 'Formalization is not registered for the canonical statement.';
  }
  return null;
}

function sourceBindingError(node, input, registry) {
  const formalization = input.formalization;
  if (formalization !== undefined) {
    const error = formalizationError(node, formalization, registry);
    if (error) return error;
  }
  const authority = formalization || new FormalizationArtifact({
    naturalStatement: node.canonicalStatement, formalStatement: node.canonicalStatement,
  });
  const binding = FormalizationArtifact.prototype.checkSourceBinding.call(authority, input.source);
  return binding.matched ? null : `Lean source statement mismatch: ${binding.error}`;
}

function statementDigests(node, input) {
  return {
    canonicalStatementDigest: naturalStatementFingerprint(node.canonicalStatement),
    formalStatementDigest: input.formalization?.formalStatementFingerprint ||
      formalStatementFingerprint(node.canonicalStatement),
  };
}

class LeanIncrementalGate {
  constructor(options = {}) {
    validateConfiguration(options);
    this.graph = options.graph;
    this.executor = options.executor;
    this.toolchainVersion = options.toolchainVersion;
    this.environmentDigest = options.environmentDigest;
    this.allowedAxioms = new Set(options.allowedAxioms || []);
    this.setFormalizationRegistry(options.formalizationRegistry || null);
    this.clock = options.clock || (() => new Date().toISOString());
    // Default publish: register verified receipts in the global registry if no
    // explicit registry is provided, so the VerificationRegistry becomes the
    // single source of truth across the whole process.
    const explicitRegistry = options.registry || null;
    const registry = explicitRegistry || globalRegistry;
    const userPublish = options.publish || null;
    this.publish = (receipt) => {
      registry.registerVerified(receipt);
      if (userPublish) userPublish(receipt);
    };
    this.receipts = new Map();
  }

  setFormalizationRegistry(registry) {
    if (registry !== null && !(registry instanceof FormalizationRegistry)) {
      throw new Error('A FormalizationRegistry is required for formal binding.');
    }
    this.formalizationRegistry = registry;
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
    const node = this.graph.getNode(nodeId);
    const receipt = {
      nodeId, status: 'failed', reason,
      canonicalStatementDigest: node ? naturalStatementFingerprint(node.canonicalStatement) : null,
      formalStatementDigest: null,
      sourceDigest: digest(Buffer.from(typeof source === 'string' ? source : '')),
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
    return sourceBindingError(node, input, this.formalizationRegistry);
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
      ...statementDigests(this.graph.getNode(input.nodeId), input),
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
