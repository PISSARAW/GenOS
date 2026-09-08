const assert = require('node:assert/strict');
const service = require('../src/services/complianceService');
const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../src/routes/complianceRoutes.js'), 'utf8');
assert.match(source, /reports.*requireTenantScope/);
assert.match(service.buildReport.toString(), /organization_id = \? AND project_id = \?/);
assert.match(service.getReport.toString(), /organization_id = \? AND project_id = \?/);
console.log('Compliance report tenant scope checks passed.');