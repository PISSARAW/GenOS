'use strict';
const assert = require('node:assert/strict');
const Module = require('node:module');
const original = Module._load;
const missing = Object.assign(new Error('Fixture absent verdict module'), { code: 'MODULE_NOT_FOUND' });
let attempted = 0;
Module._load = function load(request, parent, isMain) {
  if (request.endsWith('/mcpExecutor/domainVerdict')) {
    attempted += 1;
    throw missing;
  }
  return original.call(this, request, parent, isMain);
};

async function main() {
  try {
    const executor = require('../src/services/mcpExecutor');
    assert.equal(attempted, 0, 'Loading unrelated consumers must not require the MCP verdict module.');
    await assert.rejects(executor.execute({ agentId: 'must-not-run', toolName: 'must-not-run' }), error => error === missing);
    assert.equal(attempted, 1, 'The verdict module remains mandatory before MCP execution.');
    console.log('Studio optional MCP: module import available; missing domain verdict refuses execute before effects.');
  } finally { Module._load = original; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
