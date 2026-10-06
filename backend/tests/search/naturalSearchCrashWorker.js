const { openFixture, runtime } = require('./naturalSearchTestFixture');

async function main() {
  const db = await openFixture(process.argv[2]);
  const state = await runtime.getOrCreateSearchState('crash', db);
  await state.actuator.hypermutation({ agentId: 'crash', radius: 'radical' });
  state.stepCount += 5;
  state.persistence.saveRuntimeCheckpoint = async () => { throw new Error('crash before checkpoint commit'); };
  try { await runtime.flushSearchState('crash'); }
  catch (error) {
    if (error.message === 'crash before checkpoint commit') process.exit(17);
    throw error;
  }
  throw new Error('Expected injected failure');
}
main().catch(error => { console.error(error); process.exit(1); });
