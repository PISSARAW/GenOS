const assert = require('node:assert/strict');
const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../src/services/agentAutonomyPlanService.js'), 'utf8');
assert.match(source, /if \(autonomyPlan\.trinity\.activated\)/);
assert.match(source, /base worker plan remains active meanwhile/);
assert.match(source, /!autonomyPlan\.trinity\.activated/);
console.log('Interview autonomy dispatch checks passed.');