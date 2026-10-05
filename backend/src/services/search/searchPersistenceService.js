/**
 * Search Persistence — Persistance SQLite du Ledger et de la Search Pressure.
 * Utilise le module sqlite3 async (déjà utilisé par le backend).
 */

class SearchPersistence {
  constructor(db) {
    this.db = db;
    this.checkpointVersions = new Map();
  }

  async run(sql, params = []) {
    return this.db.run(sql, params);
  }

  async get(sql, params = []) {
    return this.db.get(sql, params);
  }

  async all(sql, params = []) {
    return this.db.all(sql, params);
  }

  async initTables() {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS search_hypotheses (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        parent_hypothesis_id TEXT,
        branch_id TEXT,
        statement TEXT NOT NULL,
        prediction TEXT,
        falsification_condition TEXT,
        confidence REAL NOT NULL DEFAULT 0.5,
        uncertainty REAL NOT NULL DEFAULT 1.0,
        status TEXT NOT NULL DEFAULT 'proposed',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_tested_at DATETIME,
        last_progress_at DATETIME,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_search_hypotheses_agent ON search_hypotheses(agent_id);
      CREATE INDEX IF NOT EXISTS idx_search_hypotheses_status ON search_hypotheses(status);
      CREATE TABLE IF NOT EXISTS search_proofs (
        id TEXT PRIMARY KEY,
        hypothesis_id TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('for', 'against')),
        strength REAL NOT NULL DEFAULT 1.0,
        provenance TEXT NOT NULL DEFAULT 'observed',
        reliability REAL NOT NULL DEFAULT 0.5,
        independent INTEGER NOT NULL DEFAULT 1,
        evidence_ref TEXT,
        receipt_ref TEXT,
        source_agent TEXT,
        source_tool TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (hypothesis_id) REFERENCES search_hypotheses(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_search_proofs_hypothesis ON search_proofs(hypothesis_id);
      CREATE TABLE IF NOT EXISTS search_pressure_state (
        agent_id TEXT PRIMARY KEY,
        pressure REAL NOT NULL DEFAULT 0.0,
        confidence REAL NOT NULL DEFAULT 0.0,
        causes TEXT NOT NULL DEFAULT '[]',
        recommended_radius TEXT NOT NULL DEFAULT 'local',
        step_count INTEGER NOT NULL DEFAULT 0,
        last_progress_step INTEGER NOT NULL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS search_decisions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        process TEXT NOT NULL,
        classification TEXT,
        pressure REAL NOT NULL,
        search_yield REAL,
        steps_since_progress INTEGER,
        falsified_hypotheses INTEGER,
        diagnostics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_search_decisions_agent ON search_decisions(agent_id);
      CREATE TABLE IF NOT EXISTS search_patch_visits (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        patch_id TEXT NOT NULL,
        info_gain REAL NOT NULL DEFAULT 0.0,
        departed INTEGER NOT NULL DEFAULT 0,
        visited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS search_genome_snapshots (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        process TEXT NOT NULL,
        genome_json TEXT NOT NULL,
        mutations_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS search_replay_log (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        restore_point TEXT NOT NULL,
        state_restored INTEGER NOT NULL DEFAULT 0,
        snapshot_id TEXT,
        replayed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS search_module_state (
        agent_id TEXT NOT NULL,
        module TEXT NOT NULL,
        state_json TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (agent_id, module),
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS search_runtime_checkpoint (
        agent_id TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
        state_json TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS search_niches (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        focus TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const checkpointColumns = await this.db.all('PRAGMA table_info(search_runtime_checkpoint)');
    if (!checkpointColumns.some(column => column.name === 'revision')) {
      await this.db.exec('ALTER TABLE search_runtime_checkpoint ADD COLUMN revision INTEGER NOT NULL DEFAULT 0');
    }
  }

  async saveHypothesis(h) {
    const result = await this.db.run(`
      INSERT INTO search_hypotheses
      (id, agent_id, parent_hypothesis_id, branch_id, statement, prediction,
       falsification_condition, confidence, uncertainty, status,
       created_at, last_tested_at, last_progress_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), ?, ?)
      ON CONFLICT(id) DO UPDATE SET statement=excluded.statement, prediction=excluded.prediction,
      falsification_condition=excluded.falsification_condition, confidence=excluded.confidence,
      uncertainty=excluded.uncertainty, status=excluded.status,
      last_tested_at=excluded.last_tested_at, last_progress_at=excluded.last_progress_at
      WHERE search_hypotheses.agent_id=excluded.agent_id
    `, [h.id, h.agentId, h.parentHypothesisId, h.branchId, h.statement, h.prediction,
        h.falsificationCondition, h.confidence, h.uncertainty, h.status,
        h.createdAt, h.lastTestedAt, h.lastProgressAt]);
    if (result.changes !== 1) throw new Error('Hypothesis ID belongs to another agent');
  }

  async saveProof(p) {
    const result = await this.db.run(`
      INSERT INTO search_proofs
      (id, hypothesis_id, direction, strength, provenance, reliability,
       independent, evidence_ref, receipt_ref, source_agent, source_tool, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
      ON CONFLICT(id) DO UPDATE SET direction=excluded.direction, strength=excluded.strength,
      provenance=excluded.provenance, reliability=excluded.reliability, independent=excluded.independent,
      evidence_ref=excluded.evidence_ref, receipt_ref=excluded.receipt_ref,
      source_agent=excluded.source_agent, source_tool=excluded.source_tool
      WHERE search_proofs.hypothesis_id=excluded.hypothesis_id
    `, [p.id, p.hypothesisId, p.direction, p.strength, p.provenance,
        p.reliability, p.independent ? 1 : 0, p.evidenceRef, p.receiptRef,
        p.sourceAgent, p.sourceTool, p.createdAt]);
    if (result.changes !== 1) throw new Error('Proof ID belongs to another hypothesis');
  }

  async savePressureState(agentId, s) {
    await this.db.run(`
      INSERT OR REPLACE INTO search_pressure_state
      (agent_id, pressure, confidence, causes, recommended_radius, step_count,
       last_progress_step, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [agentId, s.pressure, s.confidence, JSON.stringify(s.causes || []),
        s.recommendedRadius || 'local', s.stepCount || 0, s.lastProgressStep || 0]);
  }

  async saveDecision(agentId, selection) {
    const id = `dec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await this.db.run(`
      INSERT INTO search_decisions
      (id, agent_id, process, classification, pressure, search_yield,
       steps_since_progress, falsified_hypotheses, diagnostics)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, agentId, selection.process, selection.classification,
        selection.pressure, selection.searchYield,
        selection.stepsSinceProgress, selection.falsifiedHypotheses || 0,
        JSON.stringify(selection.diagnostics || {})]);
    return id;
  }

  async savePatchVisit(agentId, patchId, infoGain, departed) {
    await this.db.run(`
      INSERT INTO search_patch_visits (id, agent_id, patch_id, info_gain, departed, visited_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `, [`pv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        agentId, patchId, infoGain || 0, departed ? 1 : 0]);
  }

  async saveGenomeSnapshot(agentId, process, genome, mutations) {
    await this.db.run(`
      INSERT INTO search_genome_snapshots (id, agent_id, process, genome_json, mutations_json, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `, [`gs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        agentId, process, JSON.stringify(genome), JSON.stringify(mutations || null)]);
  }

  async saveReplayLog(agentId, restorePoint, stateRestored, snapshotId) {
    await this.db.run(`
      INSERT INTO search_replay_log (id, agent_id, restore_point, state_restored, snapshot_id, replayed_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `, [`rl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        agentId, restorePoint, stateRestored ? 1 : 0, snapshotId || null]);
  }

  async loadHypothesesForAgent(agentId) {
    return this.db.all('SELECT * FROM search_hypotheses WHERE agent_id = ? ORDER BY created_at', agentId);
  }

  async saveModuleState(agentId, module, state) {
    await this.db.run(`INSERT INTO search_module_state (agent_id, module, state_json, updated_at)
      VALUES (?, ?, ?, datetime('now')) ON CONFLICT(agent_id, module) DO UPDATE SET
      state_json = excluded.state_json, updated_at = excluded.updated_at`,
    [agentId, module, JSON.stringify({ version: 1, payload: state })]);
  }

  async loadModuleState(agentId, module) {
    const row = await this.db.get('SELECT state_json FROM search_module_state WHERE agent_id = ? AND module = ?', [agentId, module]);
    if (!row) return null;
    return require('./searchStateCodec').decodeState(row.state_json, module);
  }

  async saveModuleStates(agentId, states) {
    const entries = Object.entries(states);
    const values = entries.map(() => "(?,?,?,datetime('now'))").join(',');
    const params = entries.flatMap(([module, payload]) => [agentId, module, JSON.stringify({ version: 1, payload })]);
    await this.db.run(`INSERT INTO search_module_state (agent_id,module,state_json,updated_at)
      VALUES ${values} ON CONFLICT(agent_id,module) DO UPDATE SET
      state_json=excluded.state_json, updated_at=excluded.updated_at`, params);
  }

  async saveRuntimeCheckpoint(agentId, state) {
    const expected = this.checkpointVersions.get(agentId) || 0;
    const result = await this.db.run(`INSERT INTO search_runtime_checkpoint (agent_id,state_json,revision) VALUES (?,?,1)
      ON CONFLICT(agent_id) DO UPDATE SET state_json=excluded.state_json, updated_at=datetime('now'),
      revision=search_runtime_checkpoint.revision+1 WHERE search_runtime_checkpoint.revision=?`,
    [agentId, JSON.stringify({ version: 1, payload: state }), expected]);
    if (result.changes !== 1) throw new Error('Concurrent Natural Search checkpoint writer');
    this.checkpointVersions.set(agentId, expected + 1);
  }

  async loadRuntimeCheckpoint(agentId) {
    const row = await this.db.get('SELECT state_json,revision FROM search_runtime_checkpoint WHERE agent_id=?', agentId);
    if (!row) return null;
    const saved = require('./searchStateCodec').decodeState(row.state_json, 'checkpoint');
    if (saved.agentId !== agentId) throw new Error('Natural Search checkpoint agent mismatch');
    this.checkpointVersions.set(agentId, row.revision);
    return saved;
  }

  async loadIncomingCulture(agentId) {
    const target = await this.db.get('SELECT * FROM agents WHERE id=?', agentId);
    const rows = await this.db.all(`SELECT c.agent_id,c.state_json,a.* FROM search_runtime_checkpoint c
      JOIN agents a ON a.id=c.agent_id WHERE c.agent_id<>?`, agentId);
    return rows.filter(row => row.organization_id === target.organization_id && row.project_id === target.project_id).flatMap(row => {
      const saved = require('./searchStateCodec').decodeState(row.state_json, 'checkpoint');
      const culture = saved.modules.culture;
      const plasmids = new Map(culture.plasmids);
      return culture.transmissions.filter(tx => tx.targetAgentId === agentId)
        .map(tx => ({ sourceAgentId: row.agent_id, organizationId: row.organization_id, projectId: row.project_id,
          transmission: tx, plasmid: plasmids.get(tx.plasmidId) }));
    });
  }

  async canTransmitCulture(agentId, targetId) {
    const source = await this.db.get('SELECT * FROM agents WHERE id=?', agentId);
    const target = await this.db.get('SELECT * FROM agents WHERE id=?', targetId);
    if (!source || !target || agentId === targetId) return false;
    return source.organization_id === target.organization_id && source.project_id === target.project_id;
  }

  async getAgentScope(agentId) {
    return this.db.get('SELECT * FROM agents WHERE id=?', agentId);
  }

  async loadProofsForAgent(agentId) {
    return this.db.all(`SELECT p.* FROM search_proofs p
      JOIN search_hypotheses h ON h.id = p.hypothesis_id
      WHERE h.agent_id = ? ORDER BY p.created_at`, agentId);
  }

  async loadProofsForHypothesis(hypothesisId) {
    return this.db.all('SELECT * FROM search_proofs WHERE hypothesis_id = ? ORDER BY created_at', hypothesisId);
  }

  async loadPressureState(agentId) {
    return this.db.get('SELECT * FROM search_pressure_state WHERE agent_id = ?', agentId);
  }

  async loadRecentDecisions(agentId, limit) {
    return this.db.all('SELECT * FROM search_decisions WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?', [agentId, limit || 20]);
  }
}

module.exports = { SearchPersistence };
