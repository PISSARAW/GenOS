'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.TEMP = require('node:path').dirname(process.env.GENOS_DB_PATH);
process.env.TMP = process.env.TEMP;
process.env.TMPDIR = process.env.TEMP;
const fixture = require('../test_native_memory_budget');
const executor = require('../../src/services/epistemic/oracleNativeProcess');
const original = executor.run;
const barrier = process.argv[3] || 'intent';

executor.run = (subject, options) => original(subject, { ...options, onExecution: async execution => {
  if (execution.phase === barrier) {
    if (barrier === 'intent') await options.onExecution(execution);
    const db = await require('../../src/db').getDatabase();
    const verification = subject.verification;
    const scope = await require('../../src/services/gvxMissionProvenance').agentScope(db, verification.workerId);
    process.send({ schema: 'genos.test.oracle-barrier/v1', execution,
      request: { runId: verification.runId, agentId: verification.workerId, scope } });
    await new Promise(() => {});
  } else await options.onExecution(execution);
} });

require('../../src/db').getDatabase().then(db => fixture.dispatch(db, JSON.parse(process.argv[2])))
  .then(() => { throw new Error('Crash probe crossed the intent barrier.'); })
  .catch(failure => { console.error(failure); process.exitCode = 1; });
