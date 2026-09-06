const BaseRepository = require('./base.repository');

class AgentRepository extends BaseRepository {
  constructor(db) {
    super(db, 'agents');
  }

  async findByStatus(status) {
    return this.db.all(
      `SELECT * FROM agents WHERE status = ? ORDER BY created_at DESC`, status
    );
  }

  async findWithWorkspace(agentId) {
    return this.db.get(`
      SELECT a.*, w.path as workspaceRoot, w.isolation_mode
      FROM agents a
      LEFT JOIN workspaces w ON a.workspace_id = w.id
      WHERE a.id = ?
    `, agentId);
  }
  
  async listWithDetails(scopeClause, scopeParams) {
    return this.db.all(`
      SELECT a.id, a.name, a.role, a.status, a.agent_type as agentType, a.execution_mode as executionMode,
      a.model_tier as modelTier, a.language, a.isolation_mode as isolationMode,
      a.current_task as currentTask, a.workspace_id as workspaceId, a.fleet_id as fleetId,
      w.name as workspaceName,
      a.parent_agent_id as parentAgentId, p.name as parentAgentName,
      a.lineage_relation as lineageRelation, a.hallucination_monitoring as hallucinationMonitoring,
      a.hallucination_count as hallucinationCount,
      a.name_meaning as nameMeaning, a.dissonance_level as dissonanceLevel,
      a.eureka_count as eurekaCount, a.cognitive_budget as cognitiveBudget,
      a.cognitive_baseline_budget as cognitiveBaselineBudget,
      a.conscience_revision as conscienceRevision,
      a.is_apoptotic as isApoptotic,
      COALESCE(a.about, a.current_task, 'Autonomous GenOS agent.') as about,
      tw.id as trinityWorldId, tw.name as trinityWorldName, tw.strategy as trinityStrategy,
      tw.mission as trinityMission, sc.primary_strategy as strategyPrimary,
      sc.version as strategyVersion, sc.status as strategyStatus
      FROM agents a
      LEFT JOIN workspaces w ON w.id = a.workspace_id
      LEFT JOIN agents p ON p.id = a.parent_agent_id
      LEFT JOIN trinity_worlds tw ON tw.agent_id = a.id
      LEFT JOIN strategy_contracts sc ON sc.agent_id = a.id
        AND sc.version = (SELECT MAX(latest.version) FROM strategy_contracts latest WHERE latest.agent_id = a.id)
      WHERE a.status != 'terminated' AND ${scopeClause}
    `, ...scopeParams);
  }
}

module.exports = AgentRepository;
