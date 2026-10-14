'use strict';

const assert = require('node:assert/strict');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const syncytium = require('../src/services/syncytiumCoordinationService');
const tools = require('../src/services/topologySessionTools');

async function main() {
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE agents (id TEXT PRIMARY KEY, parent_agent_id TEXT, workspace_id TEXT,
    execution_mode TEXT, metadata_json TEXT);`);
  const session = await syncytium.createSession('MCP morphology handoff.', {
    db,
    nuclearDomains: [
      { domainId: 'north', members: ['north-agent'] },
      { domainId: 'south', members: ['south-agent'] }
    ]
  });
  await db.run('INSERT INTO agents VALUES (?, ?, ?, ?, ?)',
    'mcp-orchestrator', null, 'workspace', 'orchestrator', '{}');
  await db.run('INSERT INTO agents VALUES (?, ?, ?, ?, ?)', 'mcp-worker', 'mcp-orchestrator',
    'workspace', 'worker', JSON.stringify({ topologySessionId: session.sessionId }));
  try {
    const result = await tools.applyTopologyOperation(db, {
      session_id: session.sessionId,
      operation: 'morphogenesis',
      signals: { disagreementCentrality: 0.9 }
    }, { agentId: 'mcp-orchestrator' });
    assert.equal(result.targetTopology, 'biocenose');
    assert.equal(result.morphogenesisPlan.selectedTopology, 'biocenose');
    console.log('Syncytium MCP morphogenesis handoff checks: PASS');
  } finally {
    await syncytium.closeSession(session.sessionId, { db });
    await db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
