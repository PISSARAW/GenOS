'use strict';

/**
 * Storage Capability Registry — dynamic engine availability detection.
 *
 * The immune system can detect:
 *   Ladybug damaged → graph capability degraded → SQLite bounded fallback
 *   DuckDB damaged → analytics capability degraded → SQLite aggregation fallback
 *
 * Each capability reports: { provider, available, degraded, fallback }
 */

class StorageCapabilityRegistry {
  constructor() {
    this._capabilities = new Map();
  }

  async register(name, provider, checkFn) {
    let available = false;
    let degraded = false;
    try {
      available = await checkFn();
      degraded = !available;
    } catch (_) {
      available = false;
      degraded = true;
    }
    const capability = { provider, available, degraded, fallback: null };
    this._capabilities.set(name, capability);
    return capability;
  }

  async registerGraph() {
    const { LadybugGraphRepository } = require('./graph/ladybugStore');
    return this.register('graph', 'ladybug', async () => {
      const repo = new LadybugGraphRepository();
      await repo.init();
      const available = repo.available;
      await repo.close();
      return available;
    });
  }

  async registerAnalytics() {
    const { DuckDBAnalyticsStore } = require('./analytics/duckdbStore');
    return this.register('analytics', 'duckdb', async () => {
      const store = new DuckDBAnalyticsStore();
      await store.init();
      const available = store.available;
      await store.close();
      return available;
    });
  }

  async registerVector() {
    const { LanceVectorRepository } = require('./vector/lanceVectorRepository');
    return this.register('vector', 'lancedb', async () => {
      const repo = new LanceVectorRepository();
      await repo.init();
      const available = repo.available;
      return available;
    });
  }

  async registerSearch() {
    return this.register('search', 'sqlite-vec', async () => {
      try {
        const { getDatabase } = require('../db');
        const db = await getDatabase();
        const result = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='rag_chunks_vec'");
        await db.close();
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
        await db.close();
        return true;
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
