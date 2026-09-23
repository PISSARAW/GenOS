'use strict';

/**
 * Storage Kernel — the single entry point for all GenOS storage needs.
 *
 * The kernel exposes typed namespaces:
 *   storage.operational    — SQLite: agents, jobs, missions, claims, evidence, genomes
 *   storage.graph          — LadybugDB (or SQLite CTE fallback): lineage, relations, provenance
 *   storage.analytics      — DuckDB: benchmarks, uplift, telemetry aggregation
 *   storage.search         — FTS5 + sqlite-vec: lexical and semantic retrieval
 *   storage.objects        — CAS/filesystem: snapshots, blobs, artefacts
 *
 * Authority rule: SQLite is the canonical source of truth. All other stores
 * are rebuildable projections. A projection failure never blocks an operational write.
 */

const { createStorageBackend } = require('./services/storageBackend');

const AGGREGATE_TYPES = new Set([
  'agent', 'genome', 'mission', 'claim', 'evidence', 'finding', 'daemon',
  'territory', 'commit', 'snapshot', 'phenotype', 'capability', 'memory',
  'concept', 'experiment', 'tool',
]);

const EVENT_TYPES = new Set([
  'AGENT_STATUS', 'AGENT_CREATED', 'AGENT_REMOVED', 'AGENT_UPDATED',
  'GENOME_UPDATED', 'MISSION_STARTED', 'MISSION_COMPLETED',
  'CLAIM_ADDED', 'EVIDENCE_ADDED', 'EVIDENCE_CONTRADICTED',
  'FINDING_ADDED', 'FINDING_REFUTED', 'FINDING_VALIDATED',
  'RELATION_ADDED', 'RELATION_REMOVED',
  'SNAPSHOT_CREATED', 'SNAPSHOT_ROLLED_BACK',
]);

/**
 * StorageKernel — routes storage requests to the appropriate backend.
 * No false universal API: callers express intent, kernel selects engine.
 */
class StorageKernel {
  constructor() {
    this._backend = null;
  }

  async init(config) {
    this._backend = createStorageBackend(config);
    await this._backend.open(config);
    return this;
  }

  async destroy() {
    if (this._backend) {
      await this._backend.close();
      this._backend = null;
    }
  }

  get operational() {
    return this._backend;
  }

  get graph() {
    return this._backend;
  }

  get analytics() {
    return this._backend;
  }

  get search() {
    return this._backend;
  }

  get objects() {
    return this._backend;
  }

  // Projection outbox — transactional write to SQLite + append event
  async writeProjectionEvent(event) {
    const {
      aggregate_type, aggregate_id, event_type, payload_json,
      organization_id, project_id, created_at,
    } = event;
    if (!AGGREGATE_TYPES.has(aggregate_type)) {
      throw new Error(`Unknown aggregate_type: ${aggregate_type}`);
    }
    if (!EVENT_TYPES.has(event_type)) {
      throw new Error(`Unknown event_type: ${event_type}`);
    }
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const payload = JSON.stringify(payload_json || {});
    const now = created_at || new Date().toISOString();
    await this._backend.run(
      `INSERT INTO projection_events (event_id, aggregate_type, aggregate_id, event_type, payload_json, organization_id, project_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [eventId, aggregate_type, aggregate_id, event_type, payload, organization_id || null, project_id || null, now]
    );
    return eventId;
  }

  async getProjectionEvents(sinceSequence, limit = 100) {
    return this._backend.all(
      `SELECT * FROM projection_events WHERE sequence > ? ORDER BY sequence ASC LIMIT ?`,
      [sinceSequence || 0, limit]
    );
  }

  async getProjectionState() {
    const row = await this._backend.get(
      `SELECT COALESCE(MAX(sequence), 0) AS last_sequence FROM projection_events`
    );
    return { lastSequence: row ? row.last_sequence : 0 };
  }

  async markProjected(eventId, target) {
    const column = `${target}_projected_at`;
    return this._backend.run(
      `UPDATE projection_events SET ${column} = ? WHERE event_id = ?`,
      [new Date().toISOString(), eventId]
    );
  }
}

module.exports = { StorageKernel };
