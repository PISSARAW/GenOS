'use strict';

const RECEIPT_DIGEST = /^sha256:[a-f0-9]{64}$/;

function domainRelation(node, counterexample) {
  if (node.domainFingerprint === counterexample.domainFingerprint) return 'overlap';
  const disjoint = new Set(node.disjointDomainFingerprints || []);
  return disjoint.has(counterexample.domainFingerprint) ? 'disjoint' : 'unknown';
}

function descendantAction(relation) {
  return relation === 'overlap' ? 'invalidated' : 'suspended';
}

function validVerification(verification, request) {
  return verification?.status === 'validated' &&
    verification.targetId === request.targetId &&
    verification.counterexampleResultId === request.counterexampleResultId &&
    verification.domainFingerprint === request.domainFingerprint &&
    RECEIPT_DIGEST.test(verification.receiptDigest || '');
}

class CounterexamplePropagator {
  constructor(options = {}) {
    if (!options.graph) throw new Error('graph is required.');
    if (typeof options.verifyCounterexample !== 'function') {
      throw new Error('An independent counterexample verifier is required.');
    }
    this.graph = options.graph;
    this.verifyCounterexample = options.verifyCounterexample;
    this.publish = options.publish || (() => {});
    this.clock = options.clock || (() => new Date().toISOString());
  }

  emit(event) {
    const enriched = { occurredAt: this.clock(), ...event };
    this.publish(enriched);
    return enriched;
  }

  async propagate(counterexample = {}) {
    const targetId = String(counterexample.targetId || '').trim();
    const resultId = String(counterexample.counterexampleResultId || '').trim();
    const domainFingerprint = String(counterexample.domainFingerprint || '').trim();
    if (!targetId || !resultId || !domainFingerprint) {
      throw new Error('targetId, counterexampleResultId and domainFingerprint are required.');
    }
    const target = this.graph.getNode(targetId);
    if (!target || target.domainFingerprint !== domainFingerprint) {
      throw new Error('Counterexample target or domain does not match the graph.');
    }
    const targetSnapshot = JSON.stringify(target);
    const request = { targetId, counterexampleResultId: resultId, domainFingerprint };
    // The verifier must consult evidence independently and return the bound receipt.
    const verification = await this.verifyCounterexample(Object.freeze({ ...request }));
    if (!validVerification(verification, request)) {
      throw new Error('Counterexample verification rejected the target, domain or receipt.');
    }
    const current = this.graph.getNode(targetId);
    if (JSON.stringify(current) !== targetSnapshot) {
      throw new Error('Counterexample target changed during verification.');
    }
    this.graph.updateStatus(targetId, 'refuted');
    const events = [this.emit({
      type: 'counterexample_validated', nodeId: targetId, counterexampleResultId: resultId,
      domainFingerprint, receiptDigest: verification.receiptDigest,
    })];
    for (const nodeId of this.graph.descendants(targetId)) {
      const node = this.graph.getNode(nodeId);
      const relation = domainRelation(node, request);
      if (relation === 'disjoint') continue;
      const action = descendantAction(relation);
      this.graph.updateStatus(nodeId, action);
      events.push(this.emit({
        type: `descendant_${action}`, nodeId, sourceNodeId: targetId,
        counterexampleResultId: resultId, domainRelation: relation,
        receiptDigest: verification.receiptDigest,
      }));
    }
    return { targetId, counterexampleResultId: resultId, receiptDigest: verification.receiptDigest, events };
  }
}

module.exports = { domainRelation, CounterexamplePropagator };
