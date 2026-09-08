const assert = require('node:assert/strict');
const evalService = require('../src/grpc_services/evalService');
const observability = require('../src/services/evaluationObservabilityService');

const original = observability.getObservabilitySummary;
(async () => {
  let received;
  observability.getObservabilitySummary = async (scope) => { received = scope; return { scoped: true }; };
  let response;
  await evalService.GetSummary({ request: { organization_id: 'org-1', project_id: 'project-1' } }, (error, value) => { assert.equal(error, null); response = value; });
  assert.deepEqual(received, { organizationId: 'org-1', projectId: 'project-1' });
  assert.deepEqual(JSON.parse(response.summary_json), { scoped: true });
  let missing;
  await evalService.GetSummary({ request: { organization_id: 'org-1' } }, (error) => { missing = error; });
  assert.equal(missing.code, 3);
  observability.getObservabilitySummary = original;
  console.log('Evaluation gRPC summaries require tenant scope.');
})().catch((error) => { observability.getObservabilitySummary = original; console.error(error); process.exitCode = 1; });