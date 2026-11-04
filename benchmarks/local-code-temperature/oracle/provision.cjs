'use strict';
const c = require('./common.cjs');
async function provision(input) {
  const ctx = await require('../native/provision.cjs').provision(input);
  const contract = { version: 1, kind: 'javascript_repair_cases', suite: 'genos.pure-js-repair/v1',
    caseId: input.task.id, artifactPath: 'module.js', sources: [{ path: 'module.js', mutable: true,
      sha256: c.fileHash(c.path.join(ctx.workspace, 'module.js')) }] };
  c.service('epistemic/workspaceVerificationContract').assertContract(contract);
  ctx.mission.workerAssignment.workspaceVerificationContract = contract;
  const workerContract = c.service('agents/workerKindService').buildWorkerContract('bounded_worker', ctx.mission);
  c.service('agents/workerContractEnforcement').assertRuntimeContract(workerContract, 'bounded_worker');
  const saved = await ctx.db.run("UPDATE agents SET metadata_json=? WHERE id='benchmark-worker' AND status='idle'",
    JSON.stringify({ workerKind: 'bounded_worker', workerContract }));
  c.assert.equal(saved.changes, 1);
  return ctx;
}
module.exports = { provision };
