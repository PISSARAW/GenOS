'use strict';

const { observation, digest, scopeKey, scopeOf } = require('./contract');
const physiology = require('./physiology');
const { compileGraph, propagation } = require('./propagation');

function effect(signal, action, details) {
  return Object.freeze({ id: digest([signal.id, action, details.target]), signalId: signal.id,
    scope: signal.scope, action, ...details, evidenceStatus: 'UNVERIFIED',
    sourceEventId: signal.eventId, expiresAt: Math.min(signal.observedAt + physiology.FRESH_MS, details.wave?.expiresAt ?? Infinity) });
}

function decisions(signal, result, context) {
  const local = result.actions.map(action => effect(signal, action,
    { target: signal.agentId, pathway: 'LOCAL_REFLEX', priority: result.urgent ? 100 : 30 }));
  if (!result.urgent) return local;
  const propagated = propagation(context.graph, signal, context.now).map(wave => effect(signal, 'INCREASE_MONITORING',
    { target: wave.nodeId, pathway: 'SYSTEMIC_WAVE', priority: 60, wave }));
  return [...local, ...propagated];
}

class NervousRuntime {
  constructor(store, options = {}) {
    this.store = store;
    this.clock = options.clock || Date.now;
    this.graphs = new Map();
    this.stats = { accepted: 0, duplicates: 0, rejected: 0, processed: 0 };
  }

  configureGraph(scope, graph) {
    const key = scopeKey(scope);
    if (!this.graphs.has(key) && this.graphs.size >= 256) throw new Error('GRAPH_SCOPE_CAPACITY');
    this.graphs.set(key, compileGraph(graph, scope));
  }

  async ingest(event, scope, options = {}) {
    try {
      const observed = observation(event, { scope, now: this.clock() });
      if (!observed) return { accepted: false, reason: 'UNSUPPORTED_EVENT' };
      const signal = { ...observed, propagationGraph: this.sealGraph(scope, options.graph) };
      const inserted = await this.store.append(signal);
      if (inserted) this.stats.accepted += 1;
      else this.stats.duplicates += 1;
      await this.drain();
      const row = await this.store.receipt(signal.id, signal.scope);
      return { accepted: true, duplicate: !inserted, signalId: signal.id,
        receipt: row ? JSON.parse(row.body) : null };
    } catch (error) { this.stats.rejected += 1; throw error; }
  }

  sealGraph(scope, input) {
    const graph = input === undefined ? this.graphs.get(scopeKey(scope)) || new Map() : compileGraph(input, scope);
    return { nodes: [...graph.keys()].map(id => ({ id, scope: scopeOf(scope) })),
      edges: [...graph].flatMap(([from, neighbors]) => [...neighbors].map(to => ({ from, to }))) };
  }

  reduce(signal, previous) {
    const now = this.clock();
    const result = physiology.advance(previous, signal, now);
    const graph = signal.propagationGraph ? compileGraph(signal.propagationGraph, signal.scope)
      : this.graphs.get(scopeKey(signal.scope)) || new Map();
    const effects = decisions(signal, result, { graph, now });
    const receipt = { schemaVersion: 1, signalId: signal.id, disposition: result.disposition,
      decisionTime: now, effects: effects.map(item => item.id), stateHash: digest(result.state),
      policyVersion: 'gns-1', graphHash: digest([...graph].map(([id, neighbors]) => [id, [...neighbors].sort()])),
      evidenceStatus: 'UNVERIFIED', correlation: signal.correlation };
    return { state: result.state, effects, receipt };
  }

  async drain(limit = 100) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new TypeError('Invalid drain limit');
    let count = 0;
    while (count < limit) {
      const result = await this.store.next((signal, state) => this.reduce(signal, state));
      if (!result) break;
      count += 1;
    }
    this.stats.processed += count;
    return count;
  }

  async snapshot(scope, options) {
    const checked = scopeOf(scope);
    const rows = await this.store.states(checked, options);
    return { scope: checked, agents: rows.map(row => ({ agentId: row.agent_id,
      ...physiology.view(JSON.parse(row.body), this.clock()) })),
    emptyMeans: 'UNKNOWN', evidenceStatus: 'UNVERIFIED' };
  }
}

module.exports = { NervousRuntime, decisions };
