'use strict';
const old = require('D:/GenOS-Experiments/local-code-temp-20261104/scripts/common.cjs');
const ROOT = old.path.resolve(process.env.GENOS_NATIVE_TEMPERATURE_LAB || 'D:/GenOS-Experiments/local-code-temp-native-20261104');
const SOURCE = old.path.join(ROOT, 'runtime/source-limits');
function service(name) { return require(old.path.join(SOURCE, 'backend/src/services', name)); }
function backend(name) { return require(old.path.join(SOURCE, 'backend', name)); }
function setup(directory) {
  old.setup(directory);
  const keys = old.read(old.path.join(ROOT, 'private/keys.json'));
  Object.assign(process.env, { GENOS_DB_PATH: old.path.join(directory, 'run.db'),
    GENOS_STUDIO_ROOT: old.path.join(directory, 'studio'),
    GENOS_CAPSULE_ROOT: old.path.join(directory, 'capsules'),
    GENOS_WORKSPACES_ROOT: old.path.join(directory, 'workspaces'),
    GENOS_WORKSPACE_ROOT: old.path.join(directory, 'workspace'),
    GENOS_BIN: old.path.join(ROOT, 'runtime/genos.exe'),
    GENOS_GVX_LEDGER_HMAC_SECRET: keys.ledger, GENOS_EPISTEMIC_RECEIPT_SECRET: keys.receipt,
    GENOS_ADMIN_PASSWORD: keys.admin, GENOS_ADMIN_TOKEN: keys.admin,
    GENOS_AGENT_DNA: '1', GENOS_BUILD_REVISION: '01333f81c+eb7b89601-inference-transport' });
}
function sources() {
  return Object.fromEntries(old.fs.readdirSync(__dirname).filter(n => n.endsWith('.cjs')).sort()
    .map(n => [n, old.fileHash(old.path.join(__dirname, n))]));
}
async function modelIdentity() {
  const result = await old.api('/api/tags', undefined, 30000);
  const model = result.data.models.find(item => item.name === old.CONFIG.model);
  old.assert.equal(model?.digest, old.CONFIG.digest);
  return { name: model.name, digest: model.digest, size: model.size, details: model.details };
}
module.exports = { ...old, ROOT, SOURCE, service, backend, setup, sources, modelIdentity };
