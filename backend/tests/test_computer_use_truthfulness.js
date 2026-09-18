const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/services/computerUseService.js'), 'utf8');
assert.match(source, /outcome = 'capture_unavailable'/);
assert.match(source, /outcome = 'model_unavailable'/);
assert.match(source, /outcome = 'execution_failed'/);
assert.doesNotMatch(source, /capture\.synthetic\)\s*\{\s*outcome = 'completed'/);
console.log('Computer Use does not promote synthetic execution to success.');
