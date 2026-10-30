'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
let browserDependencyLoads = 0;

Module._load = function load(request, parent, isMain) {
  if (request === 'puppeteer') {
    browserDependencyLoads += 1;
    throw Object.assign(new Error('Browser dependency intentionally absent'), { code: 'MODULE_NOT_FOUND' });
  }
  return originalLoad.call(this, request, parent, isMain);
};

async function main() {
  try {
    require('../src/services/mcpBioTools');
    assert.equal(browserDependencyLoads, 0, 'loading unrelated MCP tools must not require a browser');
    const { BrowserPuppeteerAdapter } = require('../src/services/browserPuppeteerAdapter');
    const adapter = new BrowserPuppeteerAdapter();
    assert.equal(browserDependencyLoads, 0);
    await assert.rejects(adapter.open(), { code: 'MODULE_NOT_FOUND' });
    assert.equal(browserDependencyLoads, 1, 'actual browser use still requires its dependency');
  } finally {
    Module._load = originalLoad;
  }
  console.log('MCP registry remains available without the optional browser dependency.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
