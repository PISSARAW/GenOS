const assert = require('assert/strict');
const router = require('../src/routes/actionGenomeRoutes');
const { admitCatalogAction } = require('../src/services/actionGenome/catalogActionAdmission');
const { getActionGenome } = require('../src/services/actionGenome/actionGenomeCatalog');
const { projectActionGenome } = require('../src/services/actionGenome/surfaceProjection');

async function main() {
  const routes = router.stack.filter((layer) => layer.route).map((layer) => ({
    path: layer.route.path,
    methods: Object.keys(layer.route.methods)
  }));
  assert.ok(routes.some((route) => route.path === '/action-genomes/:id/:version/evaluate'
    && route.methods.includes('post')));

  const genome = getActionGenome('syncytium.session.events', '1.0.0');
  const rest = projectActionGenome(genome).surfaces.find((surface) => surface.surface === 'rest');
  assert.equal(rest.wired, true);
  assert.equal(rest.mode, 'admission_only');

  const request = {
    id: 'syncytium.session.events', version: '1.0.0', actorId: 'admin-1',
    permissions: ['all'], leases: ['genos_topology_session'],
    budget: { maxDurationMs: 1000, maxCostUnits: 0.5 },
    observedStateVersion: 'revision:9', input: { session_id: 'sync-9', after_revision: 8 }
  };
  const receipt = await admitCatalogAction(request, {
    loadState: async () => ({ version: 'revision:9', snapshot: { revision: 9, topology: 'syncytium' } })
  });
  assert.equal(receipt.statement.admitted, true);
  assert.equal(receipt.statement.observedStateVersion, 'revision:9');
  assert.equal(receipt.statement.evidenceStatus, 'pending_execution');

  const stale = await admitCatalogAction({ ...request, observedStateVersion: 'revision:8' }, {
    loadState: async () => ({ version: 'revision:9', snapshot: { revision: 9, topology: 'syncytium' } })
  });
  assert.equal(stale.statement.admitted, false);
  console.log('ActionGenome REST admission uses versioned Syncytium state and remains non-executing.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
