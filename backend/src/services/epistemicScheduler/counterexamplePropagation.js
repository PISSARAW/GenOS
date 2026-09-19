'use strict';

function domainRelation(node, counterexample) {
  if (node.domainFingerprint === counterexample.domainFingerprint) return 'overlap';
  const disjoint = new Set(node.disjointDomainFingerprints || []);
  return disjoint.has(counterexample.domainFingerprint) ? 'disjoint' : 'unknown';
}

function descendantAction(relation) {
  return relation === 'overlap' ? 'invalidated' : 'suspended';
}

class CounterexamplePropagator {
  constructor(options = {}) {
    if (!options.graph) throw new Error('graph is required.');
    this.graph = options.graph;
    this.publish = options.publish || (() => {});
    this.clock = options.clock || (() => new Date().toISOString());
  }

  emit(event) {
    const enriched = { occurredAt: this.clock(), ...event };
    this.publish(enriched);
    return enriched;
  }

  propagate(counterexample = {}) {
    const targetId = String(counterexample.targetId || '').trim();
    const resultId = String(counterexample.counterexampleResultId || '').trim();
    if (!targetId || !resultId || !counterexample.domainFingerprint) {
      throw new Error('targetId, counterexampleResultId and domainFingerprint are required.');
    }
    this.graph.updateStatus(targetId, 'refuted');
    const events = [this.emit({
      type: 'counterexample_validated', nodeId: targetId, counterexampleResultId: resultId,
    })];
    for (const nodeId of this.graph.descendants(targetId)) {
      const node = this.graph.getNode(nodeId);
      const relation = domainRelation(node, counterexample);
      if (relation === 'disjoint') continue;
      const action = descendantAction(relation);
      this.graph.updateStatus(nodeId, action);
      events.push(this.emit({
        type: `descendant_${action}`, nodeId, sourceNodeId: targetId,
        counterexampleResultId: resultId, domainRelation: relation,
      }));
    }
    return { targetId, counterexampleResultId: resultId, events };
  }
}

module.exports = { domainRelation, CounterexamplePropagator };
