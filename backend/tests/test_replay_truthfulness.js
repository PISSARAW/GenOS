const assert = require('node:assert/strict');
const fs = require('node:fs');

const replaySource = fs.readFileSync(require.resolve('../src/controllers/lineage/replay'), 'utf8');
const gitSource = fs.readFileSync(require.resolve('../src/services/agentGitService'), 'utf8');
assert.match(replaySource, /success: applied && replayVerified/);
assert.match(gitSource, /success: replayVerified/);
console.log('Replay verification is required before reporting success.');
