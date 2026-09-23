'use strict';

/**
 * Storage Query Planner — routes queries to the appropriate engine.
 *
 * The orchestrator does NOT know engine names. It expresses intent:
 *   storage.query({ intent: 'find_causal_chain', ... })
 *
 * The planner selects:
 *   exact object lookup       → SQLite
 *   text retrieval            → FTS5
 *   semantic similarity       → sqlite-vec / LanceDB
 *   relationship traversal    → LadybugDB
 *   large aggregation         → DuckDB
 *   mixed cognitive retrieval  → parallel fan-out + fusion
 */

const { StorageCapabilityRegistry } = require('../capabilityRegistry');

class StorageQueryPlanner {
  constructor() {
    this._registry = new StorageCapabilityRegistry();
  }

  async init() {
    await this._registry.registerAll();
    return this;
  }

  get registry() {
    return this._registry;
  }

  async query(request) {
    const { intent, ...params } = request;
    switch (intent) {
      case 'exact':
        return this._exactQuery(params);
      case 'text':
        return this._textQuery(params);
      case 'semantic':
        return this._semanticQuery(params);
      case 'graph':
        return this._graphQuery(params);
      case 'analytics':
        return this._analyticsQuery(params);
      case 'mixed':
        return this._mixedQuery(params);
      default:
        throw new Error(`Unknown query intent: ${intent}`);
    }
  }

  async _exactQuery(params) {
    const { getDatabase } = require('../../db');
    const db = await getDatabase();
    const { sql, args } = params;
    const result = await db.all(sql, args || []);
    return { engine: 'sqlite', results: result };
  }

  async _textQuery(params) {
    const { getDatabase } = require('../../db');
    const db = await getDatabase();
    const { sql, args } = params;
    const result = await db.all(sql, args || []);
    return { engine: 'fts5', results: result };
  }

  async _semanticQuery(params) {
    // Policy: sqlite-vec is primary. LanceDB is used only when the
    // capability registry reports a completed promotion benchmark.
    const vectorCap = this._registry.get('vector');
    const promoted = !!(vectorCap && vectorCap.promotionPolicy && vectorCap.promotionPolicy.promoted);
    if (promoted && this._registry.isAvailable('vector')) {
      const { LanceVectorRepository } = require('../vector/lanceVectorRepository');
      const { FILES } = require('../storagePaths');
      const repo = new LanceVectorRepository(FILES.lancedb);
      await repo.init();
      const results = await repo.search(params.table, params.vector, params.limit || 10);
      return { engine: 'lancedb', results };
    }
    const { getDatabase } = require('../../db');
    const db = await getDatabase();
    // NOTE: never close the shared singleton — we did not create it.
    const result = await db.all(params.sql, params.args || []);
    return { engine: 'sqlite-vec', results: result };
  }

  async _graphQuery(params) {
    if (this._registry.isAvailable('graph')) {
      const { createGraphRepository } = require('../graph/graphRepository');
      const { getDatabase } = require('../../db');
      const db = await getDatabase();
      // NOTE: never close the shared singleton — we did not create it.
      const store = await createGraphRepository(db);
      try {
        const results = await store.traverse(params);
        return { engine: store.constructor.name === 'SQLiteGraphRepository' ? 'sqlite-cte' : 'ladybug', results };
      } finally {
        if (store.constructor.name !== 'SQLiteGraphRepository' && typeof store.close === 'function') {
          await store.close();
        }
      }
    }
    const { SQLiteGraphRepository } = require('../graph/graphRepository');
    const { getDatabase } = require('../../db');
    const db = await getDatabase();
    const repo = new SQLiteGraphRepository(db);
    const results = await repo.traverse(params);
    return { engine: 'sqlite-cte', results };
  }

  async _analyticsQuery(params) {
    if (this._registry.isAvailable('analytics')) {
      const { DuckDBStore } = require('../analytics/duckdbStore');
      const store = new DuckDBStore();
      await store.init();
      if (params.sqlitePath) {
        await store.attachSqlite(params.sqlitePath, 'operational');
      }
      const results = await store.query(params.sql);
      await store.close();
      return { engine: 'duckdb', results };
    }
    const { getDatabase } = require('../../db');
    const db = await getDatabase();
    const result = await db.all(params.sql, params.args || []);
    return { engine: 'sqlite', results: result };
  }

  async _mixedQuery(params) {
    const tasks = [];
    if (params.exact) tasks.push({ intent: 'exact', promise: this._exactQuery(params.exact) });
    if (params.text) tasks.push({ intent: 'text', promise: this._textQuery(params.text) });
    if (params.semantic) tasks.push({ intent: 'semantic', promise: this._semanticQuery(params.semantic) });
    if (params.graph) tasks.push({ intent: 'graph', promise: this._graphQuery(params.graph) });
    const results = await Promise.allSettled(tasks.map((t) => t.promise));
    return {
      engine: 'mixed',
      results: results.map((r, i) => ({
        intent: tasks[i].intent,
        status: r.status,
        value: r.status === 'fulfilled' ? r.value : null,
        reason: r.status === 'rejected' ? r.reason.message : null,
      })),
    };
  }
}

module.exports = { StorageQueryPlanner };
