const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const rhizome = require('../src/services/rhizomeCoordinationService');
const store = require('../src/services/topologySessionStore');

async function run() {
  const filename = path.join(os.tmpdir(), `rhizome-${crypto.randomUUID()}.db`);
  const primaryDb = await open({ filename, driver: sqlite3.Database });
  const workerDb = await open({ filename, driver: sqlite3.Database });
  try {
    await primaryDb.exec('PRAGMA busy_timeout = 5000');
    await workerDb.exec('PRAGMA busy_timeout = 5000');
    const session = await rhizome.composeRhizome('Preserve concurrent session changes.', {
      db: primaryDb,
      nodes: [
        { nodeId: 'origin', kind: 'AGENT', capabilities: ['investigate'] },
        { nodeId: 'review', kind: 'TOOL', capabilities: ['verify'] }
      ],
      edges: [{ edgeId: 'local-bridge', from: 'origin', to: 'review', relation: 'VERIFIES' }]
    });
    const deposits = Array.from({ length: 20 }, (_, index) => {
      const db = index % 2 ? primaryDb : workerDb;
      return rhizome.depositTrail(session.sessionId, `edge:${index}`, { amount: index + 1, db });
    });
    await Promise.all(deposits);
    await rhizome.addCapabilityNode(session.sessionId, { nodeId: 'follow-up', kind: 'AGENT', capabilities: ['deploy'] }, { db: workerDb });

    const record = await store.load(primaryDb, session.sessionId);
    const graph = await store.loadRhizomeGraph(primaryDb, session.sessionId);
    const events = await store.events(primaryDb, session.sessionId);
    assert.equal(record.state.trails.length, deposits.length);
    assert.equal(record.state.nodes, undefined);
    assert.equal(record.state.edges, undefined);
    assert.equal(graph.nodes.length, 3);
    assert.ok(graph.nodes.some((node) => node.nodeId === 'follow-up'));
    assert.equal(graph.edges[0].edgeId, 'local-bridge');
    assert.equal(graph.graphVersion, 1);
    assert.equal(record.revision, deposits.length + 2);
    assert.equal(events.length, deposits.length + 2);
    assert.deepEqual(events.map((event) => event.revision), Array.from({ length: events.length }, (_, index) => index + 1));
    assert.ok(record.state.trails.some(([marker]) => marker === 'edge:0'));
    assert.ok(record.state.trails.some(([marker]) => marker === 'edge:19'));
    await rhizome.closeSession(session.sessionId, { db: primaryDb });
    assert.equal((await store.events(primaryDb, session.sessionId)).at(-1).type, 'SESSION_CLOSED');
    assert.equal(await store.load(primaryDb, session.sessionId), null);
    assert.equal((await store.loadRhizomeGraph(primaryDb, session.sessionId)).nodes.length, 0);
  } finally {
    await primaryDb.close();
    await workerDb.close();
    await fs.rm(filename, { force: true });
  }
}

run().then(() => console.log('Rhizome concurrent persistence checks: PASS')).catch((error) => {
  console.error('Rhizome concurrent persistence test failed:', error);
  process.exit(1);
});
