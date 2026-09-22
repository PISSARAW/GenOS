'use strict';

const { createStore, handleGet, handleAll, handleRun } = require('./test_agent_git_mock_sql.cjs');

function makeMockDb(agents, objects) {
  const store = createStore();
  Object.assign(store.objects, Object.fromEntries(Object.entries(objects).map(([k, v]) => [k, v])));
  return {
    get: async (sql, ...args) => handleGet(store, sql, args),
    all: async (sql, ...args) => handleAll(store, sql),
    run: async (sql, ...args) => handleRun(store, sql, args),
    exec: async () => ({ changes: 0 })
  };
}

function clearCache() {
  Object.keys(require.cache).forEach(key => {
    if (key.includes('agentGitService') || key.includes('canonical') || key.includes('storeObjectHelper') || key.includes('commitGraph') || key.includes('dagOperations') || key.includes('headIndex') || key.includes('mergeHelpers') || key.includes('replaceStateHelpers')) {
      delete require.cache[key];
    }
  });
}

function installMock(opts = {}) {
  const db = makeMockDb(opts.agents || {}, opts.objects || {});
  require('../src/db').getDatabase = async () => db;
}

function clearServiceCache() { clearCache(); }

module.exports = { makeMockDb, clearCache, installMock, clearServiceCache };
