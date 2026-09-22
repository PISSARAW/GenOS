'use strict';

/**
 * @file testSchema.js
 * @description Database schema and tables verification
 */

const tables = [
  'access_keys', 'sessions', 'workspaces', 'workspace_snapshots', 'agents',
  'trajectories', 'lineage_nodes', 'lineage_edges', 'experiments', 'experiment_waves',
  'experiment_thoughts', 'coevolution_arenas', 'swarm_proposals', 'swarm_votes',
  'mcp_tools', 'telemetry_events', 'genome_decisions', 'trace_spans', 'global_alerts'
];

async function runSchemaTests(options = {}) {
  const { db, assert } = options;
  console.log('\n--- 2. Database Schema & Tables Verification ---');
  for (const t of tables) {
    const row = await db.get(`SELECT COUNT(*) as count FROM ${t}`);
    assert(row !== undefined, `Table '${t}' is queryable (rows: ${row.count})`);
  }
}

module.exports = { runSchemaTests };