const assert = require('node:assert/strict');
const { mapEvaluationRow } = require('../src/controllers/evalController');

const result = mapEvaluationRow({
  id: 'job-1', organization_id: 'org-1', created_at: 'now', config_json: '{"graders":["safety"]}', result_json: '{"score":1}', metadata_json: '{}'
});
assert.equal(result.organizationId, 'org-1');
assert.equal(result.createdAt, 'now');
assert.deepEqual(result.config, { graders: ['safety'] });
assert.deepEqual(result.result, { score: 1 });
assert.equal(result.configJson, undefined);
assert.equal(result.metadataJson, undefined);
assert.equal(Object.keys(result).some((key) => key.includes('_')), false);

console.log('Evaluation HTTP naming contract: PASS');