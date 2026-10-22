'use strict';

// This is an actual loopback network campaign: each deployment is an
// independent Node process exposing an HTTP endpoint. It proves deterministic
// morphology output across process/network boundaries with a shared SQLite
// WAL, including an explicit process-loss/restart scenario. It does not claim
// parity across external schedulers or clouds.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DEPLOYMENTS = ['node-a', 'node-b', 'node-c'];
const DEPLOYMENT_CONTRACT = {
  protocol: 'genos-morphogenesis-parity-v1',
  transport: 'http-loopback',
  persistence: 'sqlite-wal-shared',
  externalScheduler: false
};
const INPUT = { problemSpace: ['p1', 'p2'], requirements: ['r1'], work_packages: ['w1'], document: { v: 1 }, operations: [], measurements: { productivity: 1 } };
const DYNAMIC_FIELDS = ['executionId', 'parentExecutionId', 'receiptId', 'startedAt', 'completedAt', 'timestamp', 'expressionId'];

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort()
    .filter((key) => !DYNAMIC_FIELDS.includes(key))
    .map((key) => [key, stable(value[key])]));
}

function childCode() {
  return `const http = require('node:http');
const crypto = require('node:crypto');
const { getDatabase, closeDatabase } = require('./src/db');
const { MorphologyRuntime } = require('./src/services/morphogenesis/runtime/morphologyRuntime');
const { compileExpression } = require('./src/services/morphogenesis/graph/morphologyCompiler');
const { topologyExpression } = require('./src/services/morphogenesis/expression');
const input = ${JSON.stringify(INPUT)};
const fields = new Set(${JSON.stringify(DYNAMIC_FIELDS)});
const deploymentContract = ${JSON.stringify(DEPLOYMENT_CONTRACT)};
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.keys(value).sort().filter((key) => !fields.has(key)).map((key) => [key, stable(value[key])])); }
function readBody(request) { return new Promise((resolve, reject) => { let body = ''; request.on('data', chunk => { body += chunk; if (body.length > 100000) reject(new Error('request too large')); }); request.on('end', () => resolve(body)); request.on('error', reject); }); }
(async () => {
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  await db.exec('CREATE TABLE IF NOT EXISTS morphogenesis_network_parity (mission_id TEXT PRIMARY KEY, output_digest TEXT NOT NULL, deployment TEXT NOT NULL)');
  const server = http.createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') {
      response.writeHead(200, { 'content-type': 'application/json' });
      return response.end(JSON.stringify({ status: 'ok', deployment: process.env.GENOS_DEPLOYMENT, contract: deploymentContract }));
    }
    if (request.method !== 'POST' || request.url !== '/execute') { response.writeHead(404); return response.end(); }
    try {
      const payload = JSON.parse(await readBody(request));
      const mission = String(payload.mission || 'network-parity');
      const graph = compileExpression(topologyExpression('rhizome', null, { mission }), { mission, globalBudget: { tokens: 120, growth: 1 } });
      const result = await new MorphologyRuntime({ globalBudget: { tokens: 120 } }).execute(graph, input);
      const outputDigest = crypto.createHash('sha256').update(JSON.stringify(stable(result.output))).digest('hex');
      await db.run('INSERT OR IGNORE INTO morphogenesis_network_parity (mission_id, output_digest, deployment) VALUES (?, ?, ?)', [mission, outputDigest, process.env.GENOS_DEPLOYMENT]);
      const row = await db.get('SELECT output_digest, deployment FROM morphogenesis_network_parity WHERE mission_id = ?', [mission]);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ outputDigest, persistedDigest: row?.output_digest, persistedDeployment: row?.deployment, deployment: process.env.GENOS_DEPLOYMENT, contract: deploymentContract }));
    } catch (error) { response.writeHead(500, { 'content-type': 'application/json' }); response.end(JSON.stringify({ error: error.message })); }
  });
  server.listen(0, '127.0.0.1', () => process.stdout.write(JSON.stringify({ ready: true, port: server.address().port }) + '\\n'));
  process.on('SIGTERM', async () => { server.close(); await closeDatabase(); process.exit(0); });
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });`;
}

function startDeployment(databasePath, deployment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', childCode()], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, GENOS_DB_PATH: databasePath, GENOS_DEPLOYMENT: deployment, GENOS_ADMIN_PASSWORD: 'network-parity-only', GENOS_SQLITE_BUSY_TIMEOUT_MS: '30000' },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
    });
    let stdout = ''; let stderr = ''; let settled = false;
    child.stdout.on('data', chunk => {
      stdout += chunk;
      const line = stdout.split(/\r?\n/).find(value => value.includes('"ready":true'));
      if (!settled && line) { settled = true; resolve({ child, port: JSON.parse(line).port }); }
    });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { if (!settled) reject(error); });
    child.on('exit', code => { if (!settled && code !== 0) reject(new Error(`${deployment} failed to boot: ${stderr || stdout}`)); });
  });
}

function request(port, mission) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ mission });
    const request = http.request({ hostname: '127.0.0.1', port, path: '/execute', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, response => {
      let data = ''; response.setEncoding('utf8'); response.on('data', chunk => { data += chunk; });
      response.on('end', () => { try { const value = JSON.parse(data); if (response.statusCode !== 200) reject(new Error(value.error || `status ${response.statusCode}`)); else resolve(value); } catch (error) { reject(error); } });
    });
    request.on('error', reject); request.end(body);
  });
}

function health(port) {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port, path: '/healthz', method: 'GET' }, response => {
      let data = ''; response.setEncoding('utf8'); response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        try { const value = JSON.parse(data); if (response.statusCode !== 200) reject(new Error(value.error || `status ${response.statusCode}`)); else resolve(value); }
        catch (error) { reject(error); }
      });
    });
    request.on('error', reject); request.end();
  });
}

function stopDeployment(child) {
  return new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', resolve);
    child.kill('SIGTERM');
    setTimeout(() => { if (child.exitCode === null) child.kill(); }, 1000).unref();
  });
}

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-network-parity-'));
  const databasePath = path.join(root, 'runtime.db');
  const deployments = [];
  try {
    for (const deployment of DEPLOYMENTS) deployments.push(await startDeployment(databasePath, deployment));
    const healthChecks = await Promise.all(deployments.map(({ port }) => health(port)));
    for (const result of healthChecks) assert.deepEqual(result.contract, DEPLOYMENT_CONTRACT, 'each deployment must expose the parity contract');
    const results = await Promise.all(deployments.map(({ port }) => request(port, 'network-deployment-parity')));
    const expected = results[0].outputDigest;
    for (const result of results) {
      assert.equal(result.outputDigest, expected, 'network deployments must return the same normalized morphology digest');
      assert.equal(result.persistedDigest, expected, 'each deployment must observe the shared persisted digest');
      assert.deepEqual(result.contract, DEPLOYMENT_CONTRACT, 'execution must carry the deployment contract');
    }
    assert.equal(new Set(results.map(result => result.persistedDeployment)).size, 1, 'shared WAL must converge on one persisted owner');
    const failed = deployments[2];
    await stopDeployment(failed.child);
    await assert.rejects(request(failed.port, 'network-deployment-parity'), 'a stopped deployment must be unreachable');
    const survivor = await request(deployments[0].port, 'network-deployment-parity');
    assert.equal(survivor.persistedDigest, expected, 'a surviving deployment must retain the committed digest during a partition');
    deployments[2] = await startDeployment(databasePath, DEPLOYMENTS[2]);
    const recovered = await request(deployments[2].port, 'network-deployment-parity');
    assert.equal(recovered.outputDigest, expected, 'a restarted deployment must reproduce the digest');
    assert.equal(recovered.persistedDigest, expected, 'a restarted deployment must recover the shared digest');
    console.log(`Morphogenesis network deployment parity (${DEPLOYMENTS.length} processes, restart/partition): PASS`);
  } finally {
    await Promise.all(deployments.map(({ child }) => stopDeployment(child)));
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

if (require.main === module) run().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });

module.exports = { DEPLOYMENTS, DEPLOYMENT_CONTRACT, stable, run };
