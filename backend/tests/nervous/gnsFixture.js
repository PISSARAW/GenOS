'use strict';

const bridge = require('../../src/services/nervous/runtimeBridge');
const { harness } = require('./helpers');

async function fixture(t) {
  const previous = process.env.GENOS_NERVOUS_ENABLED;
  process.env.GENOS_NERVOUS_ENABLED = '1';
  const h = await harness();
  bridge.runtimes.set(h.db, Promise.resolve(h.runtime));
  t.after(async () => {
    bridge.runtimes.delete(h.db);
    await h.store.close();
    if (previous === undefined) delete process.env.GENOS_NERVOUS_ENABLED;
    else process.env.GENOS_NERVOUS_ENABLED = previous;
  });
  await h.db.exec(`CREATE TABLE workspaces(id TEXT PRIMARY KEY,organization_id TEXT,project_id TEXT);
    CREATE TABLE agents(id TEXT PRIMARY KEY,workspace_id TEXT,parent_agent_id TEXT);
    INSERT INTO workspaces VALUES('workspace-a','org-a','project-a');
    INSERT INTO agents VALUES('worker-a','workspace-a',NULL);
    CREATE TABLE adaptive_state(scope TEXT,key TEXT,payload_json TEXT,version INTEGER,
      updated_at TEXT,PRIMARY KEY(scope,key));
    CREATE TABLE adaptive_state_events(scope TEXT,key TEXT,event_type TEXT,event_payload TEXT,created_at TEXT);`);
  return h;
}

module.exports = { fixture };
