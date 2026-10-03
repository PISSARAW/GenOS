const assert = require('node:assert/strict');
const Module = require('node:module');

const fakeBootstrap = { getAdaptivePersister: () => null, setAdaptivePersister: () => {} };
const originalLoad = Module._load;
Module._load = function loadWithFakeBootstrap(request, parent, isMain) {
  if (request === '../../adaptiveStateBootstrap') return fakeBootstrap;
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
  try {
    const moduleUnderTest = require('../src/services/mcpBioTools/handlers/fetusInFetu');
    const { handle } = moduleUnderTest;
    const circular = {}; circular.self = circular;
    assert.equal((await handle({ action: 'encapsulate_inner_fetus', host_agent_id: 'circular', clean_checkpoint: circular })).status, 'invalid_args');
    assert.equal((await handle({ action: 'encapsulate_inner_fetus', host_agent_id: 'large', clean_checkpoint: { data: 'x'.repeat(1024 * 1024) } })).status, 'invalid_args');

    const saved = await handle({ action: 'encapsulate_inner_fetus', host_agent_id: 'valid-host', clean_checkpoint: { step: 7 } });
    assert.equal(saved.execution_scope, 'metadata_simulation');
    assert.equal(saved.runtime_checkpoint_saved, false);
    assert.equal((await handle({ action: 'encapsulate_inner_fetus', host_agent_id: 'valid-host' })).status, 'already_encapsulated');
    const record = moduleUnderTest.FETUS_REGISTRY.get('valid-host');
    record.checkpoint.step = 8;
    const rejected = await handle({ action: 'trigger_emergency_resurrection', host_agent_id: 'valid-host' });
    assert.equal(rejected.success, false);
    assert.equal(rejected.status, 'integrity_check_failed');
    assert.equal(record.state, 'dormant');
    record.checkpoint.step = 7;
    const recovered = await handle({ action: 'trigger_emergency_resurrection', host_agent_id: 'valid-host' });
    assert.equal(recovered.runtime_agent_created, false);
    assert.equal(recovered.host_runtime_purged, false);
    assert.equal((await handle({ action: 'trigger_emergency_resurrection', host_agent_id: 'valid-host' })).status, 'already_recovered');
  } finally {
    Module._load = originalLoad;
  }
})().then(() => console.log('fetus in fetu integrity checks passed'))
  .catch(error => { console.error(error); process.exitCode = 1; });
