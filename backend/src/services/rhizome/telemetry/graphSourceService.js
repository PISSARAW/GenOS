'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

function databasePath(input) {
  const root = fs.realpathSync(input.workspace || process.cwd());
  const filename = fs.realpathSync(path.resolve(root, input.database));
  const relative = path.relative(root, filename);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.statSync(filename).isFile()) {
    throw Object.assign(new Error('Telemetry database must be a workspace file.'), { code: 'RHIZOME_TELEMETRY_PATH_INVALID' });
  }
  return filename;
}

async function read(input) {
  if (!input.sessionId || !input.database) throw new Error('sessionId and database are required for live telemetry.');
  const db = await open({ filename: databasePath(input), driver: sqlite3.Database, mode: sqlite3.OPEN_READONLY });
  try {
    await db.exec('BEGIN');
    const record = await db.get('SELECT state_json, revision FROM topology_sessions WHERE id = ? AND topology = ?', input.sessionId, 'rhizome');
    if (!record) throw Object.assign(new Error('Unknown live Rhizome session.'), { code: 'RHIZOME_SESSION_UNKNOWN' });
    const state = JSON.parse(record.state_json);
    const nodes = await db.all('SELECT node_json FROM rhizome_nodes WHERE session_id = ? ORDER BY node_id', input.sessionId);
    const edges = await db.all('SELECT edge_json FROM rhizome_edges WHERE session_id = ? ORDER BY edge_id', input.sessionId);
    await db.exec('COMMIT');
    return { contract: 'RhizomeLiveTelemetry/v1', source: 'backend', sessionId: input.sessionId,
      revision: record.revision, graphVersion: state.graphVersion,
      status: state.status, variant: state.variant, budgets: state.budgets,
      nodes: nodes.map(row => JSON.parse(row.node_json)), edges: edges.map(row => JSON.parse(row.edge_json)),
      activeNeeds: state.activeNeeds || [], coordinationLoci: state.coordinationLoci || [],
      routeResultCount: (state.routeResults || []).length };
  } finally { await db.close(); }
}

module.exports = { read, databasePath };
