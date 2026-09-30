'use strict';

async function migrateMissionIdentities(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS missions (
    mission_id TEXT PRIMARY KEY, objective TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', orchestrator_agent_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (status IN ('active', 'dormant', 'completed', 'failed', 'cancelled'))
  );
  CREATE TABLE IF NOT EXISTS mission_agents (
    mission_id TEXT NOT NULL, agent_id TEXT NOT NULL, role TEXT,
    attached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (mission_id, agent_id),
    FOREIGN KEY (mission_id) REFERENCES missions(mission_id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_mission_agents_agent ON mission_agents(agent_id);
  `);

  await db.run(`INSERT OR IGNORE INTO missions (mission_id, objective, orchestrator_agent_id)
    SELECT id, COALESCE(current_task, name, id), id FROM agents
    WHERE execution_mode = 'orchestrator'`);
  await db.run(`INSERT OR IGNORE INTO mission_agents (mission_id, agent_id, role)
    SELECT a.id, a.id, 'orchestrator' FROM agents a
    WHERE a.execution_mode = 'orchestrator'
      AND EXISTS (SELECT 1 FROM missions m WHERE m.mission_id = a.id)`);
  await db.run(`INSERT OR IGNORE INTO mission_agents (mission_id, agent_id, role)
    SELECT parent.id, child.id, child.role FROM agents child
    JOIN agents parent ON parent.id = child.parent_agent_id
    WHERE parent.execution_mode = 'orchestrator'
      AND EXISTS (SELECT 1 FROM missions m WHERE m.mission_id = parent.id)`);
}

module.exports = { migrateMissionIdentities };
