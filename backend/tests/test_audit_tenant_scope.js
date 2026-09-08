const assert = require('node:assert/strict');
const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../src/controllers/platformController.js'), 'utf8');
const routes = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../src/routes/platformRoutes.js'), 'utf8');
assert.match(source, /FROM audit_logs WHERE organization_id = \? AND project_id = \?/);
assert.match(routes, /platform\/audit.*requirePlatformTenant/);
console.log('Audit tenant scope checks passed.');