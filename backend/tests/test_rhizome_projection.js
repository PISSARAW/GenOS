'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const projector = require('../src/services/rhizome/graph/rhizomeGraphProjector');
const rhizomeStore = require('../src/services/rhizome/rhizomeStore');

function memoryGraph() {
  const nodes = new Map();
  const edges = new Map();
  return {
    nodes,
    edges,
    async upsertNode(node) { nodes.set(node.id, node); },
    async upsertEdge(edge) { edges.set(edge.id, edge); },
    async deleteNode(id) { nodes.delete(id); },
    async deleteEdge(id) { edges.delete(id); }
  };
}

async function run() {
  const filename = path.join(os.tmpdir(), `rhizome-projection-${crypto.randomUUID()}.db`);
  const db = await open({ filename, driver: sqlite3.Database });
  const graph = memoryGraph();
  try {
    await db.exec('PRAGMA busy_timeout = 5000');
    await db.run('CREATE TABLE topology_sessions (id TEXT PRIMARY KEY, topology TEXT, state_json TEXT, revision INTEGER, updated_at DATETIME)');
    await db.run("INSERT INTO topology_sessions (id, topology, state_json, revision) VALUES ('s1', 'rhizome', '{}', 1)");
    await rhizomeStore.replaceGraph(db, 's1', {
      graphVersion: 1,
      nodes: [{ nodeId: 'a', kind: 'AGENT', capabilities: ['search'] }, { nodeId: 'b', kind: 'TOOL', capabilities: ['verify'] }],
      edges: [{ edgeId: 'ab', from: 'a', to: 'b', relation: 'VERIFIES' }]
    });
    const first = await projector.project(db, graph, 's1');
    assert.deepEqual(first, { sessionId: 's1', graphVersion: 1, nodeCount: 2, edgeCount: 1 });
    assert.ok(graph.nodes.has('rhizome:s1:node:a'));
    assert.equal(graph.edges.get('rhizome:s1:edge:ab').source, 'rhizome:s1:node:a');

    await rhizomeStore.replaceGraph(db, 's1', { graphVersion: 2, nodes: [{ nodeId: 'a', kind: 'AGENT', capabilities: ['search'] }], edges: [] });
    const second = await projector.project(db, graph, 's1');
    assert.equal(second.graphVersion, 2);
    assert.equal(graph.nodes.size, 1);
    assert.equal(graph.edges.size, 0);
  } finally {
    await db.close();
    await fs.rm(filename, { force: true });
  }
}

run().then(() => console.log('Rhizome graph projection checks: PASS')).catch((error) => {
  console.error('Rhizome graph projection test failed:', error);
  process.exit(1);
});
