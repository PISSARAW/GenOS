'use strict';

const { inspectCapability } = require('../services/optionalDependencies');

/**
 * Storage Capability Registry — dynamic engine availability detection.
 *
 * Promotion policy for vector:
 *   primary = sqlite-vec (canonical)
 *   candidate = LanceDB (experimental → promoted only by benchmark receipt)
 *
 * The immune system can detect:
 *   Ladybug damaged → graph capability degraded → SQLite bounded fallback
 *   DuckDB damaged → analytics capability degraded → SQLite aggregation fallback
 */

class StorageCapabilityRegistry {
  constructor() {
    this._capabilities = new Map();
  }

  async register(name, provider, checkFn, options = {}) {
    let available = false;
    let degraded = false;
    let error = null;
    try {
      available = await checkFn();
      degraded = !available;
    } catch (caught) {
      available = false;
      degraded = true;
      error = { code: caught.code || 'CAPABILITY_CHECK_FAILED', message: caught.message };
    }
    const capability = { provider, available, degraded, fallback: null, error, ...options };
    this._capabilities.set(name, capability);
    return capability;
  }

  async registerGraph() {
    const status = inspectCapability('storage.graph');
    if (!status.available) return this._registerMissing('graph', 'ladybug', status);
    const { LadybugStore } = require('./graph/ladybugStore');
    return this.register('graph', 'ladybug', async () => {
      const store = new LadybugStore();
      await store.init();
      const available = store.available;
      await store.close();
      return available;
    });
  }

  async registerAnalytics() {
    const status = inspectCapability('storage.analytics');
    if (!status.available) return this._registerMissing('analytics', 'duckdb', status);
    const { DuckDBStore } = require('./analytics/duckdbStore');
    return this.register('analytics', 'duckdb', async () => {
      const store = new DuckDBStore();
      await store.init();
      const available = store.available !== false;
      await store.close();
      return available;
    });
  }

  async registerVector() {
    const candidate = inspectCapability('storage.vector-candidate');
    // sqlite-vec is always primary; LanceDB is candidate promoted only by benchmark
    return this.register('vector', 'sqlite-vec', async () => {
      try {
        const { getDatabase } = require('../db');
        const db = await getDatabase();
        const result = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='rag_chunks_vec'");
        return !!result;
      } catch (_) {
        return false;
      }
    }, {
      promotionPolicy: {
        current: 'sqlite-vec',
        candidate: 'lancedb',
        status: 'experimental',
        promoted: false,
        requiredGain: 0.25,
        requiredVectorCount: 1000000,
        benchmarkReceipt: null,
        candidateAvailable: candidate.available,
        candidateMissing: candidate.missing,
      },
    });
  }

  _registerMissing(name, provider, status) {
    const capability = { provider, available: false, degraded: true,
      fallback: status.fallback, error: { code: 'OPTIONAL_DEPENDENCY_MISSING',
        message: `Missing optional packages: ${status.missing.join(', ')}` } };
    this._capabilities.set(name, capability);
    return capability;
  }

  async registerSearch() {
    return this.register('search', 'sqlite-vec', async () => {
      try {
        const { getDatabase } = require('../db');
        const db = await getDatabase();
        const result = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='rag_chunks_vec'");
        return !!result;
      } catch (_) {
        return false;
      }
    });
  }

  async registerOperational() {
    return this.register('operational', 'sqlite', async () => {
      try {
        const { getDatabase } = require('../db');
        const db = await getDatabase();
        const result = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='agents'");
        return !!result;
      } catch (_) {
        return false;
      }
    });
  }

  async registerAll() {
    await Promise.all([
      this.registerOperational(),
      this.registerGraph(),
      this.registerAnalytics(),
      this.registerVector(),
      this.registerSearch(),
    ]);
  }

  /**
   * Evaluate whether to promote LanceDB based on benchmark receipt.
   * Promotion requires:
   *   - vector_count >= requiredVectorCount
   *   - improvement >= requiredGain (e.g. 25% better p95 latency)
   */
  async evaluateVectorPromotion(benchmarkReceipt) {
    const vectorCap = this._capabilities.get('vector');
    if (!vectorCap) return { promoted: false, reason: 'vector capability not registered' };
    const policy = vectorCap.promotionPolicy;
    if (policy.promoted) return { promoted: true, reason: 'already promoted' };
    if (!benchmarkReceipt) return { promoted: false, reason: 'no benchmark receipt provided' };
    const { vectorCount, improvement } = benchmarkReceipt;
    if (vectorCount < policy.requiredVectorCount) {
      return { promoted: false, reason: `vector count ${vectorCount} < required ${policy.requiredVectorCount}` };
    }
    if (improvement < policy.requiredGain) {
      return { promoted: false, reason: `improvement ${improvement} < required ${policy.requiredGain}` };
    }
    policy.promoted = true;
    policy.status = 'promoted';
    policy.benchmarkReceipt = benchmarkReceipt;
    return { promoted: true, reason: 'benchmark thresholds met' };
  }

  get(name) {
    return this._capabilities.get(name) || null;
  }

  getAll() {
    return Object.fromEntries(this._capabilities);
  }

  isAvailable(name) {
    const cap = this._capabilities.get(name);
    return cap ? cap.available : false;
  }

  isDegraded(name) {
    const cap = this._capabilities.get(name);
    return cap ? cap.degraded : false;
  }
}

module.exports = { StorageCapabilityRegistry };
