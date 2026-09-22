/**
 * Search Persistence — Persistance SQLite du Ledger et de la Search Pressure.
 * Utilise le module sqlite3 async (déjà utilisé par le backend).
 */

class SearchPersistence {
  constructor(db) {
    this.db = db;
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
    `);
  }

  async saveHypothesis(h) {
    await this.db.run(`
      INSERT OR REPLACE INTO search_hypotheses
      (id, agent_id, parent_hypothesis_id, branch_id, statement, prediction,
       falsification_condition, confidence, uncertainty, status,
       created_at, last_tested_at, last_progress_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), ?, ?)
    `, [h.id, h.agentId, h.parentHypothesisId, h.branchId, h.statement, h.prediction,
        h.falsificationCondition, h.confidence, h.uncertainty, h.status,
        h.createdAt, h.lastTestedAt, h.lastProgressAt]);
  }

  async saveProof(p) {
    await this.db.run(`
      INSERT OR REPLACE INTO search_proofs
      (id, hypothesis_id, direction, strength, provenance, reliability,
       independent, evidence_ref, receipt_ref, source_agent, source_tool, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
    `, [p.id, p.hypothesisId, p.direction, p.strength, p.provenance,
        p.reliability, p.independent ? 1 : 0, p.evidenceRef, p.receiptRef,
        p.sourceAgent, p.sourceTool, p.createdAt]);
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

  async loadHypothesesForAgent(agentId) {
    return this.db.all('SELECT * FROM search_hypotheses WHERE agent_id = ? ORDER BY created_at', agentId);
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
