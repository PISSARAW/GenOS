'use strict';

const { Repository } = require('./Repository');

/**
 * Agent repository — canonical queries for agents table.
 * Replaces scattered db.all("SELECT * FROM agents ...") calls.
 */
class AgentRepository extends Repository {
  constructor() {
    super('agents');
  }

  async findById(id) {
    return this.get('SELECT * FROM agents WHERE id = ?', [id]);
  }

  async findByParent(parentAgentId) {
    return this.all('SELECT * FROM agents WHERE parent_agent_id = ? ORDER BY created_at', [parentAgentId]);
  }

  async findByStatus(status) {
    return this.all('SELECT * FROM agents WHERE status = ? ORDER BY updated_at DESC', [status]);
  }

  async findByWorkspace(workspaceId) {
    return this.all('SELECT * FROM agents WHERE workspace_id = ? ORDER BY created_at', [workspaceId]);
  }

  async findByExecutionMode(mode) {
    return this.all('SELECT * FROM agents WHERE execution_mode = ? ORDER BY updated_at DESC', [mode]);
  }

  async findActiveOrchestrators() {
    return this.all(
      "SELECT * FROM agents WHERE execution_mode = 'orchestrator' AND status NOT IN ('completed', 'terminated', 'apoptosis', 'error', 'failed', 'unverified', 'quarantined') AND (is_apoptotic = 0 OR is_apoptotic IS NULL) ORDER BY updated_at DESC"
    );
  }

  async findIdleWorkers() {
    return this.all(
      "SELECT * FROM agents WHERE execution_mode = 'worker' AND status = 'idle' ORDER BY updated_at DESC"
    );
  }

  async updateStatus(id, status, currentTask) {
    return this.run(
      "UPDATE agents SET status = ?, current_task = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [status, currentTask || null, id]
    );
  }

  async updateCognitiveBudget(id, budget) {
    return this.run(
      "UPDATE agents SET cognitive_budget = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [budget, id]
    );
  }

  async countByStatus() {
    return this.all('SELECT status, COUNT(*) AS count FROM agents GROUP BY status');
  }

  async countByExecutionMode() {
    return this.all('SELECT execution_mode, COUNT(*) AS count FROM agents GROUP BY execution_mode');
  }
}

module.exports = { AgentRepository };
