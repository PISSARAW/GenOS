'use strict';

const { harness, telemetryDatabase, SCOPE } = require('./helpers');
const { RuntimeBridge } = require('../../src/services/nervous/runtimeBridge');

async function setup(t) {
  const h = await harness();
  const db = await telemetryDatabase();
  await prepare(db);
  const bridge = new RuntimeBridge({ enabled: () => process.env.GENOS_NERVOUS_ENABLED === '1',
    openRuntime: async () => h.runtime });
  t.after(async () => { await bridge.shutdown(); await db.close(); });
  return { ...h, source: db, bridge, scope: SCOPE };
}

async function prepare(db) {
  await db.exec(`CREATE TABLE workspaces(id TEXT PRIMARY KEY,organization_id TEXT,project_id TEXT);
    CREATE TABLE agents(id TEXT PRIMARY KEY,parent_agent_id TEXT,workspace_id TEXT,metadata_json TEXT DEFAULT '{}');
    CREATE TABLE missions(mission_id TEXT PRIMARY KEY);
    CREATE TABLE mission_agents(mission_id TEXT,agent_id TEXT);
    CREATE TABLE agent_relations(id TEXT PRIMARY KEY,source_agent_id TEXT,target_agent_id TEXT,
      relation_type TEXT,organization_id TEXT,project_id TEXT,metadata_json TEXT DEFAULT '{}');
    INSERT INTO workspaces VALUES('w','org-a','project-a'),('foreign','org-a','other');
    INSERT INTO agents(id,workspace_id) VALUES('parent','w'),('worker-a','w'),('worker-b','w'),
      ('worker-c','w'),('foreign','foreign');
    INSERT INTO missions VALUES('mission-a'),('mission-b');
    INSERT INTO mission_agents VALUES('mission-a','parent'),('mission-a','worker-a'),
      ('mission-a','worker-b'),('mission-b','worker-c');
    UPDATE agents SET parent_agent_id='parent' WHERE id IN ('worker-a','worker-b');`);
}

async function relation(db, record) {
  return db.run(`INSERT INTO agent_relations VALUES(?,?,?,?,?,?,?)`, record.id,
    record.from || 'worker-a', record.to || 'worker-b', record.type || 'collaborator',
    'org-a', record.project || 'project-a', JSON.stringify(record.metadata || {}));
}

module.exports = { setup, prepare, relation };
