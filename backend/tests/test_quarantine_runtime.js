const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const runtime = require('../src/services/agentRuntimeAdapter');
const authority = require('../src/services/agentAuthorityService');
const safety = require('../src/services/primitiveHandlers/safety');

const originalDb = dbModule.getDatabase;
const originalStop = runtime.stopMission;
const originalAuthorize = authority.authorizeAgentControl;
let stopped = null;
dbModule.getDatabase = async () => ({
  get: async () => ({ id: 'agent-q', status: 'running' }),
  run: async () => ({ changes: 1 })
});
runtime.stopMission = (id) => { stopped = id; return true; };
authority.authorizeAgentControl = async () => ({ id: 'agent-q', status: 'running' });

safety.quarantine({ agentId: 'agent-q', actorId: 'operator' })
  .then((result) => { assert.equal(result.runtimeStopped, true); assert.equal(stopped, 'agent-q'); console.log('Quarantine runtime checks passed.'); })
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => { dbModule.getDatabase = originalDb; runtime.stopMission = originalStop; authority.authorizeAgentControl = originalAuthorize; });