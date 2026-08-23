const assert = require('assert');

const {
  buildWorkerSynthesisPrompt,
  waitForAutonomousWorkerQuiescence
} = require('./src/services/agentRuntimeAdapter');

async function main() {
  const dossiers = [
    {
      workerId: 'worker-author',
      role: 'literary_author',
      events: [{ eventType: 'EVIDENCE_REPORT', payload: { claims: [{ statement: 'Use the lamp as an unreliable witness.' }] } }]
    },
    {
      workerId: 'worker-critic',
      role: 'literary_critic',
      events: [{ eventType: 'AGENT_COMPLETED', payload: { evidenceReport: { claims: [{ statement: 'The ending needs a third interpretation.' }] } } }]
    }
  ];
  const prompt = buildWorkerSynthesisPrompt('Write the story.', dossiers);
  assert(prompt.startsWith('Write the story.'));
  assert(prompt.includes('MANDATORY FINAL SYNTHESIS PHASE'));
  assert(prompt.includes('worker-author'));
  assert(prompt.includes('Use the lamp as an unreliable witness.'));
  assert(prompt.includes('worker-critic'));
  assert(prompt.includes('The ending needs a third interpretation.'));

  let polls = 0;
  const fakeDb = {
    async all() {
      polls += 1;
      return polls === 1
        ? [{ id: 'worker-author', status: 'running' }]
        : [{ id: 'worker-author', status: 'idle' }];
    }
  };
  const agents = await waitForAutonomousWorkerQuiescence(
    fakeDb,
    'root',
    ['worker-author'],
    { timeoutMs: 100, pollMs: 1 }
  );
  assert.strictEqual(agents[0].status, 'idle');
  assert(polls >= 3, 'the barrier must require a stable terminal observation');

  await assert.rejects(
    waitForAutonomousWorkerQuiescence(
      { async all() { return [{ id: 'worker-author', status: 'running' }]; } },
      'root-cancelled',
      ['worker-author'],
      { timeoutMs: 100, pollMs: 1, isCancelled: () => true }
    ),
    (error) => error.code === 'WORKER_BARRIER_CANCELLED'
  );

  console.log('Orchestration worker evidence barrier checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
