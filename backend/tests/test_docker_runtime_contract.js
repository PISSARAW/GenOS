const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dockerfile = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8');

assert.match(dockerfile, /GENOS_AGENT_EXECUTOR=local/, 'container must use the bundled local runtime');
assert.match(dockerfile, /COPY --chown=node:node backend\/bin \.\/bin/, 'container must include runtime scripts');

console.log('Docker runtime contract checks passed.');