const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-agent-lifecycle-'));
process.env.NODE_ENV = 'test';
process.env.GENOS_DB_PATH = path.join(root, 'genos.db');
process.env.GENOS_ADMIN_TOKEN = 'genos-agent-lifecycle-admin';
process.env.GENOS_CAPSULE_ROOT = path.join(root, 'capsules');

const { createApp } = require('./src/app');
const { getDatabase, closeDatabase } = require('./src/db');
const runtime = require('./src/services/agentRuntimeAdapter');

function request(port, method, route, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, method, path: route,
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': 'agent-lifecycle',
        authorization: `Bearer ${process.env.GENOS_ADMIN_TOKEN}`
      }
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw || '{}') }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForCompletion(port, agentId) {
  const deadline = Date.now() + Number(process.env.GENOS_LIFECYCLE_TIMEOUT_MS || 300000);
  let dossier;
  while (Date.now() < deadline) {
    const response = await request(port, 'GET', `/api/agents/${agentId}/dossier`);
    assert.equal(response.status, 200);
    dossier = response.body;
    const rootFinished = dossier.events.some((event) => ['AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_RUNTIME_ERROR'].includes(event.eventType) && event.agentId === agentId);
    const descendantsFinished = dossier.descendants.every((agent) => agent.status !== 'running');
    if (rootFinished && descendantsFinished) return dossier;
    await wait(1000);
  }
  throw new Error(`Agent ${agentId} did not finish before the lifecycle timeout. Last state: ${JSON.stringify(dossier?.agent)}`);
}

async function run() {
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace, { recursive: true });
  const db = await getDatabase();
  await db.run("INSERT INTO workspaces (id, name, path, language) VALUES ('workspace-dp', 'Dynamic programming proof', ?, 'Python')", workspace);
  assert.equal(runtime.runtimeAvailability().available, true);
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  try {
    const deployment = await request(port, 'POST', '/api/deploy', {
      name: 'Dynamic Programming Verifier',
      role: 'Algorithm orchestrator',
      workspaceId: 'workspace-dp',
      language: 'Python',
      modelTier: 'standard',
      executionBudget: { tokens: 60000, costUsd: 8, latencyMs: 480000, events: 500 },
      prompt: 'Résous le problème de programmation dynamique suivant et vérifie le résultat par un petit programme : sac à dos 0/1, capacité 7, objets (poids,valeur) = (1,1), (3,4), (4,5), (5,7). Donne la valeur optimale et les objets choisis avec des preuves reproductibles.'
    });
    assert.equal(deployment.status, 201, JSON.stringify(deployment.body));
    const dossier = await waitForCompletion(port, deployment.body.agentId);
    const failures = dossier.events.filter((event) => ['AGENT_FAILED', 'AGENT_RUNTIME_ERROR'].includes(event.eventType));
    assert.deepEqual(failures, []);
    assert(dossier.memory.length > 0, 'evidence memory must be retrievable');
    assert(dossier.genome.identity.id === deployment.body.agentId);
    assert(dossier.contract?.contract?.mission.includes('programmation dynamique'));
    assert(dossier.organizations.runtime.length > 0, 'runtime organizations must be retrievable');
    assert(dossier.children.length > 0, 'autonomous children must be retrievable');
    assert(dossier.forks.length > 0, 'autonomous forks must be retrievable');
    assert(Array.isArray(dossier.mutations), 'mutations must always be retrievable');
    process.stdout.write(`${JSON.stringify({
      agentId: deployment.body.agentId,
      status: dossier.agent.status,
      memory: dossier.memory.length,
      genomeDecisions: dossier.genome.decisions.length,
      organizations: dossier.organizations.runtime.map((item) => item.name),
      mutations: dossier.mutations.length,
      forks: dossier.forks.map((agent) => agent.id),
      children: dossier.children.map((agent) => agent.id),
      descendants: dossier.descendants.length,
      contract: dossier.contract.id
    }, null, 2)}\n`);
  } finally {
    runtime.stopAllMissions();
    await new Promise((resolve) => server.close(resolve));
    await closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
