'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
const fixture = require('../test_native_memory_budget');
const executor = require('../../src/services/epistemic/oracleNativeProcess');
const original = executor.run;

executor.run = (subject, options) => original(subject, { ...options, onExecution: async execution => {
  await options.onExecution(execution);
  if (execution.phase === 'intent') {
    const db = await require('../../src/db').getDatabase();
    const verification = subject.verification;
    const scope = await require('../../src/services/gvxMissionProvenance').agentScope(db, verification.workerId);
    process.send({ schema: 'genos.test.oracle-intent/v1', request: { runId: verification.runId, agentId: verification.workerId, scope } });
    await new Promise(() => {});
  }
} });

require('../../src/db').getDatabase().then(db => fixture.dispatch(db, JSON.parse(process.argv[2])))
  .then(() => { throw new Error('Crash probe crossed the intent barrier.'); })
  .catch(failure => { console.error(failure); process.exitCode = 1; });
