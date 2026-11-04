'use strict';

const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const options = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  delete process.env.GENOS_AGENT_ID;
  delete process.env.GENOS_ORCHESTRATOR_AGENT_ID;
  Object.assign(process.env, options.env);
  const database = require('../../backend/src/db');
  const db = await database.getDatabase();
  try {
    const identity = await require('../../mcp/callerIdentity.cjs').ensureCallerIdentity(db,
      { workspaceRoot: options.workspace });
    const workspace = await db.get('SELECT w.* FROM workspaces w JOIN agents a ON a.workspace_id=w.id WHERE a.id=?', identity.agentId);
    if (path.resolve(workspace.path) !== path.resolve(options.workspace)) throw Error('STUDY_CALLER_WORKSPACE_MISMATCH');
    fs.writeFileSync(options.directory + '/identity.json', JSON.stringify({ ...identity, workspace }, null, 2));
  } finally { await database.closeDatabase(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
