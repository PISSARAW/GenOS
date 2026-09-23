'use strict';

/**
 * GenOS Storage Kernel
 *
 * Provides unified access to polyglot stores:
 *   - storage.operational  -> SQLite (OLTP, source of truth)
 *   - storage.graph        -> LadybugDB (graph traversal)
 *   - storage.analytics    -> DuckDB (OLAP)
 *   - storage.search       -> FTS5 + sqlite-vec (hybrid retrieval)
 *   - storage.objects      -> filesystem/CAS (snapshots, artefacts)
 */

class StorageKernel {
  constructor() {
    this._operational = null;
    this._graph = null;
    this._analytics = null;
    this._initialized = false;
  }

  async init() {
    if (this._initialized) return this;
    const { SQLiteStore } = require('./operational/sqliteStore');
    this._operational = new SQLiteStore();
    await this._operational.init();

    try {
      const { createGraphRepository } = require('./graph/graphRepository');
      this._graph = await createGraphRepository(this._operational.db);
    } catch (err) {
      console.warn('[StorageKernel] Ladybug unavailable:', err.message);
      this._graph = null;
    }

    try {
      const { DuckDBStore } = require('./analytics/duckdbStore');
      this._analytics = new DuckDBStore();
      await this._analytics.init();
    } catch (err) {
      console.warn('[StorageKernel] DuckDB unavailable:', err.message);
      this._analytics = null;
    }
    this._initialized = true;
    return this;
  }

  get operational() {
    if (!this._operational) throw new Error('StorageKernel not initialized');
    return this._operational;
  }

  get graph() {
    if (!this._graph) throw new Error('Graph store unavailable');
    return this._graph;
  }

  get analytics() {
    if (!this._analytics) throw new Error('Analytics store unavailable');
    return this._analytics;
  }

  get search() {
    if (!this._operational) throw new Error('StorageKernel not initialized');
    return this._operational;
  }

  get objects() {
    const { PATHS, ensureDirs } = require('./storagePaths');
    ensureDirs();
    return { root: PATHS.objects };
  }

  get vectorPromotion() {
    return { current: 'sqlite-vec', candidate: 'lancedb', promoted: false };
  }

  get capabilities() {
    return {
      operational: !!this._operational,
      graph: !!this._graph,
      analytics: !!this._analytics,
      graphProvider: this._graph ? this._graph.constructor.name : null,
      search: !!this._operational,
      objects: true,
    };
  }

  async close() {
    if (this._graph && this._graph.constructor.name !== 'SQLiteGraphRepository') {
      await this._graph.close();
    }
    this._graph = null;
    if (this._analytics) await this._analytics.close();
    this._analytics = null;
    this._operational = null;
    this._initialized = false;
  }
}

let instance = null;

function getStorageKernel() {
  if (!instance) instance = new StorageKernel();
  return instance;
}

module.exports = { StorageKernel, getStorageKernel };
