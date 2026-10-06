'use strict';

const policy = require('./variants/variantPolicyService');
const store = require('./biomeSessionStore');
const persistence = require('./biomeSessionPersistence');
const { positiveLimit, stopReason } = require('./runtime/runtimePolicy');

const STOP_CONDITIONS = Object.freeze(['budget_exhausted', 'convergence_reached',
  'max_ticks_reached', 'extinction_event', 'goal_achieved', 'sterility_limit',
  'cancelled', 'deadline_reached']);

function coordination() { return require('../biomeCoordinationService'); }

class BiomeRuntime {
  constructor(session, options = {}) {
    this.sessionId = session.sessionId;
    this.variant = session.variant;
    this.ecology = structuredClone(session.ecology);
    this.state = structuredClone(session.ecology.ecologicalState.runtime || {});
    this.tick = this.state.tick || 0;
    this.history = this.state.history || [];
    this.stopCondition = this.state.stopCondition || null;
    this.options = { ...options };
    this.maxTicks = positiveLimit(options.maxTicks ?? this.state.maxTicks ?? 100);
    this.running = false;
  }

  static async create(mission, options = {}) {
    positiveLimit(options.maxTicks ?? 100);
    policy.select(mission, options);
    return new BiomeRuntime(await coordination().composeBiome(mission, options), options);
  }

  static async restore(sessionId, variant, db) {
    const record = await store.load(db, sessionId);
    if (!record) throw Object.assign(new Error(`Unknown Biome session '${sessionId}'.`), {
      code: 'BIOME_SESSION_NOT_FOUND'
    });
    const session = persistence.rehydrate(record);
    if (variant && policy.resolve(variant).variant !== session.variant) {
      throw Object.assign(new Error('The stored Biome variant cannot be changed on restore.'), {
        code: 'BIOME_VARIANT_MISMATCH'
      });
    }
    return new BiomeRuntime(session, { db });
  }

  async step(input = {}) {
    if (this.running) throw Object.assign(new Error('A Biome tick is already running.'), {
      code: 'BIOME_RUNTIME_BUSY'
    });
    this.running = true;
    try { return await this.advance(input); } finally { this.running = false; }
  }

  async advance(input) {
    const before = await coordination().sessionSnapshot(this.sessionId, this.options);
    this.refresh(before);
    if (this.options.expectedRevision !== undefined && this.options.expectedRevision !== before.revision) {
      throw Object.assign(new Error('Biome session changed since observation.'), { code: 'BIOME_SESSION_CONFLICT' });
    }
    const reason = stopReason(this, this.options);
    if (reason) return this.result({ shouldStop: true, stopCondition: reason });
    const output = await coordination().advanceSessionCycle(this.sessionId, input, {
      ...this.options, expectedRevision: before.revision, maxTicks: this.maxTicks
    });
    delete this.options.expectedRevision;
    const prepared = await coordination().sessionSnapshot(this.sessionId, this.options);
    this.refresh(prepared);
    const executions = await this.executeWork(input, output);
    const after = executions.length ? await coordination().sessionSnapshot(this.sessionId, this.options) : prepared;
    this.refresh(after);
    return this.result({ ...output, cycleRevision: output.revision, revision: after.revision, executions, stopCondition: this.stopCondition,
      shouldStop: Boolean(this.stopCondition), measurements: require('./runtime/ecosystemObserver').measure(this.ecology) });
  }

  async executeWork(input, output) {
    if (['goal_achieved', 'budget_exhausted'].includes(output.stopCondition)) return [];
    const requests = require('./runtime/executionRequests').requests(input, output, this.ecology);
    if (!Array.isArray(requests) || requests.length > 101) throw Object.assign(new Error('At most 100 supplied execution requests plus one ecological action are allowed.'), { code: 'BIOME_INPUT_INVALID' });
    const results = [];
    for (const request of requests) results.push(await coordination().executeSessionWork(this.sessionId, request, this.options));
    return results;
  }

  async run(input = {}, maxTicks = this.maxTicks) {
    const limit = positiveLimit(maxTicks);
    const results = [];
    for (let i = 0; i < limit; i += 1) {
      const reason = stopReason(this, this.options);
      if (reason) break;
      const next = typeof input === 'function' ? await input(this.getState()) : input;
      const result = await this.step(next);
      results.push(result);
      if (result.shouldStop) break;
    }
    return results;
  }

  refresh(snapshot) {
    this.ecology = { ...this.ecology, environment: snapshot.environment,
      niches: snapshot.niches, populations: snapshot.populations,
      resourcePool: snapshot.resourcePool, ecologicalState: snapshot.ecologicalState,
      opportunityMap: snapshot.opportunities, environmentConstraints: snapshot.environmentConstraints,
      interactionGraph: snapshot.interactionGraph, archive: snapshot.archive };
    this.state = structuredClone(snapshot.ecologicalState.runtime || {});
    this.tick = this.state.tick || 0;
    this.history = this.state.history || [];
    this.stopCondition = this.state.stopCondition || null;
  }

  result(data) {
    return { sessionId: this.sessionId, variant: this.variant, tick: this.tick,
      ...data, shouldStop: Boolean(data.shouldStop) };
  }

  getState() {
    return structuredClone({ sessionId: this.sessionId, variant: this.variant,
      tick: this.tick, ecology: this.ecology, state: this.state,
      history: this.history, stopCondition: this.stopCondition });
  }
}

module.exports = { BiomeRuntime, STOP_CONDITIONS };
