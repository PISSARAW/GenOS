const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(require.resolve('../src/services/agentRuntimeAdapter'), 'utf8');
assert.match(source, /require\('\.\/agentMemoryContext'\)/);
assert.match(source, /formatCognitiveMemoryPrompt\(agentId/);
assert.match(source, /GENOS MEMORY CONTEXT/);
console.log('Agent runtime missions include the cognitive memory context hook.');