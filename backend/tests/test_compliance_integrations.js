const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { TEST_ADMIN_TOKEN } = require('../testAuth');
const { createApp } = require('../src/app');
const { getDatabase, closeDatabase } = require('../src/db');
const MILITARY_OVERRIDE_TOKEN = TEST_ADMIN_TOKEN;

let port = 0;
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-compliance-integrations-'));
const dbPath = path.join(testRoot, 'test.db');
function request(method, route, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, method, path: route, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MILITARY_OVERRIDE_TOKEN}`, 'X-CSRF-Token': 'test' } }, (res) => { let data = ''; res.on('data', (chunk) => { data += chunk; }); res.on('end', () => { let parsed; try { parsed = JSON.parse(data); } catch { parsed = data; } resolve({ status: res.statusCode, body: parsed }); }); });
    req.on('error', reject); if (body) req.write(JSON.stringify(body)); req.end();
  });
}

(async () => {
  await getDatabase(dbPath);
  const server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(port, resolve));
  port = server.address().port;
  await verifyComplianceEndpoints();
  const contract = await request('GET', '/api/ide/contract');
  if (contract.status !== 200 || contract.body.ides.length !== 3) throw new Error('IDE contract endpoint failed');
  const migration = await request('POST', '/api/schema/migrate', {});
  if (migration.status !== 200 || !migration.body.success) throw new Error('migration endpoint failed');
  console.log('compliance/integrations endpoint tests passed');
  await new Promise((resolve) => server.close(resolve));
  await closeDatabase(); fs.rmSync(testRoot, { recursive: true, force: true });
})().catch(async (error) => { console.error(error); await closeDatabase(); fs.rmSync(testRoot, { recursive: true, force: true }); process.exit(1); });

async function verifyComplianceEndpoints() {
  const frameworks = await request('GET', '/api/compliance/frameworks');
  if (frameworks.status !== 200 || frameworks.body.length !== 3) throw new Error('framework endpoint failed');
  const report = await request('POST', '/api/compliance/reports', { framework: 'EU_AI_ACT' });
  if (report.status !== 201 || !report.body.id) throw new Error('report endpoint failed');
  const exported = await request('GET', `/api/compliance/reports/${report.body.id}/export?format=csv`);
  if (exported.status !== 200 || !String(exported.body).includes('control,status')) throw new Error('CSV export failed');
}
