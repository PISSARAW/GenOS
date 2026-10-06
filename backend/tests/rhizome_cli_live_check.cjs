'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const rhizome = require('../src/services/rhizomeCoordinationService');
const runtime = require('../src/services/rhizome/runtime/rhizomeRuntime');
const fx = require('./helpers/rhizomeExecutionFixtures');

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'rhizome-cli-live-test';
const binary = process.env.GENOS_RHIZOME_CLI;
if (!binary) throw new Error('GENOS_RHIZOME_CLI must identify the freshly compiled CLI.');

function cli(args) {
  return spawnSync(binary, ['rhizome', ...args], { encoding: 'utf8', timeout: 15000, windowsHide: true });
}

async function freePort() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}

async function ready(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Live CLI startup timed out.')), 15000);
    child.once('error', reject);
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Live CLI exited: ' + code)); });
    child.stdout.on('data', chunk => {
      if (chunk.toString().includes('rhizome_live_telemetry')) { clearTimeout(timer); resolve(); }
    });
  });
}

async function verifyHttp(session, database) {
  const port = await freePort();
  const child = spawn(binary, ['rhizome', 'serve', '--session-id', session.sessionId, '--database', database,
    '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  try {
    await ready(child);
    const response = await fetch('http://127.0.0.1:' + port + '/api/graph');
    assert.equal(response.status, 200);
    const graph = await response.json();
    assert.equal(graph.source, 'backend');
    assert.equal(graph.sessionId, session.sessionId);
    assert.equal(graph.routeResultCount, 1);
    const socket = new WebSocket('ws://127.0.0.1:' + port + '/ws');
    const event = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Live websocket timed out.')), 15000);
      socket.onmessage = message => { clearTimeout(timer); resolve(JSON.parse(message.data)); };
      socket.onerror = reject;
    });
    socket.close();
    assert.equal(event.type, 'Snapshot');
    assert.equal(event.snapshot.source, 'backend');
    assert.equal(event.snapshot.nodes.length, 2);
    assert.equal(event.snapshot.evidence_score, 0);
  } finally {
    if (child.exitCode === null) { const ended = once(child, 'exit'); child.kill(); await ended; }
  }
}

async function run() {
  const id = crypto.randomUUID();
  const directory = path.resolve('.genos-agent-worlds/rhizome-verification');
  await fs.mkdir(directory, { recursive: true });
  await fs.mkdir('artifacts', { recursive: true });
  const database = path.join(directory, id + '.db');
  const output = 'artifacts/rhizome-live-' + id + '.json';
  const simulated = 'artifacts/rhizome-simulation-' + id + '.json';
  const db = await open({ filename: database, driver: sqlite3.Database });
  try {
    const session = await rhizome.composeRhizome('Verify real CLI telemetry.', { db, variant: 'persistent',
      nodes: [fx.node('source'), fx.node('tool', ['answer'])], edges: [fx.edge('bridge', 'source', 'tool')] });
    const result = await runtime.run({ sessionId: session.sessionId, options: { db },
      needs: [{ needId: 'cli-answer', capability: 'answer' }], execute: async () => ({ answer: 42 }),
      verify: fx.makeReceipt, trustedVerifierDigests: [fx.DIGEST] });
    assert.equal(result.status, 'VERIFIED');
    const exported = cli(['export', '--session-id', session.sessionId, '--database', database, '--output', output]);
    assert.equal(exported.status, 0, exported.stderr);
    const graph = JSON.parse(await fs.readFile(output, 'utf8'));
    assert.equal(graph.source, 'backend');
    assert.equal(graph.sessionId, session.sessionId);
    assert.equal(graph.edges[0].edgeId, 'bridge');
    assert.notEqual(cli(['export', '--session-id', session.sessionId, '--output', output]).status, 0);
    const simulation = cli(['export', '--simulate', '--output', simulated]);
    assert.equal(simulation.status, 0, simulation.stderr);
    assert.equal(JSON.parse(await fs.readFile(simulated, 'utf8')).source, 'simulation');
    await verifyHttp(session, database);
    await rhizome.closeSession(session.sessionId, { db });
    assert.notEqual(cli(['export', '--session-id', session.sessionId, '--database', database, '--output', output, '--force']).status, 0);
    await fs.writeFile(path.join(directory, 'cli-live.json'), JSON.stringify({ passed: true,
      binary, verified: ['real persisted export', 'paired source arguments', 'explicit simulation', 'HTTP live graph',
        'WebSocket backend snapshot', 'closed session rejected'], completedAt: new Date().toISOString() }, null, 2));
  } finally {
    await db.close();
    await Promise.all([database, output, simulated].map(file => fs.rm(file, { force: true })));
  }
}
run().then(() => console.log('Rhizome CLI real export, HTTP, WebSocket, source guards and explicit simulation: PASS'))
  .catch(error => { console.error(error); process.exitCode = 1; });
