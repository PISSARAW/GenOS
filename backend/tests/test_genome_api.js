const assert = require('assert');
const os = require('os');
const path = require('path');

process.env.GENOS_DB_PATH = path.join(os.tmpdir(), `genos-genome-api-${Date.now()}.db`);
process.env.GENOS_ADMIN_PASSWORD = 'test-admin-password-123';
process.env.GENOS_ADMIN_TOKEN = 'test-admin-token-123';

const { getDatabase, closeDatabase } = require('../src/db');
const controller = require('../src/controllers/genomeController');
const store = require('../src/services/agentDnaStore');

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

async function run() {
  const db = await getDatabase();
  const directory = path.resolve(__dirname, '../../agents/dna/fondations');
  await store.importDirectory(db, directory, {});

  const listRes = mockRes();
  await controller.listGenomes({ tenant: null }, listRes, (error) => { throw error; });
  assert.equal(listRes.body.success, true);
  assert.ok(listRes.body.genomes.length > 0);

  const first = listRes.body.genomes[0];
  const getRes = mockRes();
  await controller.getGenome({ params: { id: first.id }, tenant: null }, getRes, (error) => { throw error; });
  assert.equal(getRes.body.success, true);
  assert.ok(getRes.body.genome.phenotype.role);

  const missingRes = mockRes();
  await controller.getGenome({ params: { id: 'does-not-exist' }, tenant: null }, missingRes, (error) => { throw error; });
  assert.equal(missingRes.statusCode, 404);

  const policyRes = mockRes();
  await controller.getGenomePolicy({ tenant: null }, policyRes, (error) => { throw error; });
  assert.equal(policyRes.body.policy.requireSigned, false);

  const setPolicyRes = mockRes();
  await controller.setGenomePolicy({ tenant: null, body: { requireSigned: true } }, setPolicyRes, (error) => { throw error; });
  assert.equal(setPolicyRes.statusCode, 400);

  await closeDatabase();
  console.log('Genome API checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
