/**
 * Verification test suite for crates/genos-store & crates/genos-api reconnections
 */
const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const genosCli = require('../src/services/genosCli');
const fundamentals = require('../src/services/primitiveHandlers/fundamentals');
const safety = require('../src/services/primitiveHandlers/safety');
const strategyAdapter = require('../src/services/strategyExecutionAdapter');
const { getDatabase } = require('../src/db');

function httpRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== Test Suite: genos-store & genos-api Reconnections ===\n');

  // 1. Direct genosCli Cryptobiosis Freeze & Thaw
  console.log('1. Testing genosCli Cryptobiosis freeze, status & thaw...');
  const testAgentId = 'agent_vitrified_' + Date.now();
  const freezeRes = await genosCli.runCryptobiosisFreeze(testAgentId, {
    state: { memory: ['insight_alpha', 'insight_beta'], tokens: 100 }
  });
  assert(freezeRes.ok, `Freeze failed: ${freezeRes.error || freezeRes.stderr}`);
  assert(freezeRes.data, 'Missing freeze JSON data');
  assert.equal(freezeRes.data.status, 'FROZEN_VITRIFIED');
  assert.equal(freezeRes.data.agent_id, testAgentId);
  assert(freezeRes.data.capsule_hash, 'Missing capsule SHA-256 hash');
  assert.equal(freezeRes.data.bunker_armor, 9999);
  console.log('   ✓ Agent frozen with SHA-256 capsule & endospore bunker armor 9999');

  const thawRes = await genosCli.runCryptobiosisThaw(testAgentId);
  assert(thawRes.ok, `Thaw failed: ${thawRes.error || thawRes.stderr}`);
  assert(thawRes.data, 'Missing thaw JSON data');
  assert.equal(thawRes.data.status, 'RESUSCITATED');
  assert.equal(thawRes.data.hydration_level, 1.0);
  assert.deepEqual(thawRes.data.state_snapshot, { memory: ['insight_alpha', 'insight_beta'], tokens: 100 });
  console.log('   ✓ Agent thawed and resuscitated with intact memory state');

  // 2. Direct genosCli Stratigraphic Fossils Record & List
  console.log('\n2. Testing genosCli Fossil registration & listing...');
  const lineageId = 'lineage_cambrian_' + Date.now();
  const fossilRes = await genosCli.runFossilize(lineageId, 'Sudden token depletion in epoch 4');
  assert(fossilRes.ok, `Fossilize failed: ${fossilRes.error || fossilRes.stderr}`);
  assert(fossilRes.data, 'Missing fossil data');
  assert.equal(fossilRes.data.operation, 'fossil_record');
  assert.equal(fossilRes.data.extinct_lineage_id, lineageId);
  assert(fossilRes.data.fossil_id, 'Missing fossil UUID');
  console.log('   ✓ Stratigraphic fossil recorded with UUID: ' + fossilRes.data.fossil_id);

  const listRes = await genosCli.runListFossils();
  assert(listRes.ok, `List fossils failed: ${listRes.error || listRes.stderr}`);
  assert(listRes.data, 'Missing list data');
  assert(listRes.data.fossils.length >= 1, 'Expected at least 1 fossil');
  const found = listRes.data.fossils.find(f => f.extinct_lineage_id === lineageId);
  assert(found, 'Recorded fossil not found in list');
  console.log(`   ✓ Stratigraphic fossil registry list confirmed (${listRes.data.total_fossils} fossils)`);

  // 3. Primitive Handlers Fundamentals (cryptobiosisFreeze & cryptobiosisThaw)
  console.log('\n3. Testing primitiveHandlers fundamentals (cryptobiosisFreeze/Thaw)...');
  const db = await getDatabase();
  const primAgentId = 'prim_agent_' + Date.now();
  await db.run(
    "INSERT INTO agents (id, name, role, status, execution_mode) VALUES (?, 'Cryptobiosis Worker', 'worker', 'idle', 'worker')",
    primAgentId
  );
  const primFreeze = await fundamentals.cryptobiosisFreeze({
    agentId: primAgentId,
    state: { cortex: 'dormant_mode' }
  });
  assert(primFreeze.success, 'Primitive freeze failed');
  assert.equal(primFreeze.status, 'FROZEN_VITRIFIED');
  assert(primFreeze.capsuleHash, 'Missing capsule hash');

  const primThaw = await fundamentals.cryptobiosisThaw({ agentId: primAgentId });
  assert(primThaw.success, 'Primitive thaw failed');
  assert.equal(primThaw.status, 'RESUSCITATED');
  console.log('   ✓ Primitive handler fundamentals cryptobiosis works end-to-end');

  // 4. Primitive Handlers Safety (apoptosis with stratigraphic fossil record)
  console.log('\n4. Testing primitiveHandlers safety (apoptosis -> stratigraphic fossil)...');
  const apoptoticAgentId = 'apoptotic_' + Date.now();
  await db.run(
    "INSERT INTO agents (id, name, role, status) VALUES (?, 'Doomed Worker', 'worker', 'idle')",
    apoptoticAgentId
  );
  const apopRes = await safety.apoptosis({
    targetId: apoptoticAgentId,
    actorId: apoptoticAgentId,
    reason: 'Irreversible catastrophic divergence'
  });
  assert(apopRes.success, 'Apoptosis failed');
  assert(apopRes.fossilRecord, 'Apoptosis did not produce a fossil record');
  assert.equal(apopRes.fossilRecord.extinct_lineage_id, apoptoticAgentId);
  console.log('   ✓ Apoptosis automatically archived extinct agent as stratigraphic fossil');

  // 5. Strategy Execution Adapter Dispatch
  console.log('\n5. Testing strategyExecutionAdapter dispatch...');
  const adapterAgentId = 'adapter_agent_' + Date.now();
  await db.run(
    "INSERT INTO agents (id, name, role, status, execution_mode) VALUES (?, 'Adapter Worker', 'worker', 'idle', 'worker')",
    adapterAgentId
  );
  const stratFreeze = await strategyAdapter.executePrimitive('cryptobiosis_freeze', {
    agentId: adapterAgentId,
    state: { strategy: 'hibernation' }
  });
  assert(stratFreeze.success, 'Strategy adapter failed to execute cryptobiosis_freeze');

  const stratFossil = await strategyAdapter.executePrimitive('fossilize', {
    lineageId: 'adapter_lineage_' + Date.now(),
    reason: 'Pruned by Pareto frontier optimization'
  });
  assert(stratFossil.success, 'Strategy adapter failed to execute fossilize');
  console.log('   ✓ Strategy execution adapter dispatches cryptobiosis and fossilize correctly');

  // 6. GenOS REST API Server (OpenAI compatible HTTP endpoints)
  console.log('\n6. Testing genos-api REST Server (OpenAI-compatible protocol)...');
  const repoRoot = path.resolve(__dirname, '../..');
  const apiBin = path.join(repoRoot, 'target', 'debug', 'genos-api.exe');
  const apiPort = 8099;

  const serverProc = spawn(apiBin, ['--port', String(apiPort), '--api-key', 'sk-test-genos-token'], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // Wait for server to bind
  await new Promise((resolve, reject) => {
    let resolved = false;
    serverProc.stdout.on('data', (d) => {
      if (d.toString().includes('Listening on') && !resolved) {
        resolved = true;
        resolve();
      }
    });
    serverProc.on('error', reject);
    setTimeout(() => {
      if (!resolved) resolve(); // Proceed and test probe
    }, 1500);
  });

  try {
    // Probe 1: GET /healthz
    const health = await httpRequest({
      hostname: '127.0.0.1',
      port: apiPort,
      path: '/healthz',
      method: 'GET'
    });
    assert.equal(health.statusCode, 200);
    const healthJson = JSON.parse(health.body);
    assert.equal(healthJson.status, 'healthy');
    console.log('   ✓ GET /healthz probe passed: ' + health.body.trim());

    // Probe 2: GET /v1/models
    const models = await httpRequest({
      hostname: '127.0.0.1',
      port: apiPort,
      path: '/v1/models',
      method: 'GET'
    });
    assert.equal(models.statusCode, 200);
    const modelsJson = JSON.parse(models.body);
    assert(modelsJson.data.some(m => m.id === 'genos-core-v3'));
    console.log('   ✓ GET /v1/models listed models: ' + modelsJson.data.map(m => m.id).join(', '));

    // Probe 3: POST /v1/chat/completions
    const chatPayload = JSON.stringify({
      model: 'genos-core-v3',
      messages: [{ role: 'user', content: 'Explore bio-mimetic cognitive pathways' }]
    });
    const chat = await httpRequest({
      hostname: '127.0.0.1',
      port: apiPort,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-test-genos-token',
        'Content-Length': Buffer.byteLength(chatPayload)
      }
    }, chatPayload);

    assert.equal(chat.statusCode, 200);
    const chatJson = JSON.parse(chat.body);
    assert.equal(chatJson.object, 'chat.completion');
    assert(chatJson.choices && chatJson.choices.length > 0);
    assert(chatJson.choices[0].message.content.includes('Explore bio-mimetic cognitive pathways'));
    console.log('   ✓ POST /v1/chat/completions returned completion with usage: ' + JSON.stringify(chatJson.usage));

    // Probe 4: POST /v1/chat/completions Unauthorized Check
    const unauth = await httpRequest({
      hostname: '127.0.0.1',
      port: apiPort,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-invalid-token',
        'Content-Length': Buffer.byteLength(chatPayload)
      }
    }, chatPayload);
    assert.equal(unauth.statusCode, 401);
    console.log('   ✓ Unauthorized token correctly rejected with 401');
  } finally {
    serverProc.kill();
  }

  console.log('\n>>> All genos-store and genos-api tests PASSED successfully! <<<');
}

runTests().catch((err) => {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
});
