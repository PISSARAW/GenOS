const assert = require('node:assert/strict')
const { CausalReplayService } = require('../../src/services/search/causalReplayService')

{
  const svc = new CausalReplayService();
  const events = [
    { statement: 'step1' },
    { statement: 'step2' },
    { isCheckpoint: true },
    { statement: 'step3' },
    { statement: 'step4 with H_cache' }
  ];
  const idx = svc.findCausalCommitment(events, 'H_cache');
  assert.equal(idx, 4, 'found causal commitment');
}

{
  const svc = new CausalReplayService();
  const events = [
    { statement: 'step1' },
    { isCheckpoint: true },
    { statement: 'step2' },
    { isCheckpoint: true },
    { statement: 'step3' }
  ];
  const checkpoints = svc.createCheckpoints(events);
  assert.equal(checkpoints.length, 3, '3 checkpoints created');
}

{
  const svc = new CausalReplayService();
  const events = [
    { statement: 'step1' },
    { isCheckpoint: true },
    { statement: 'step2' }
  ];
  const checkpoints = svc.createCheckpoints(events);
  assert.equal(checkpoints.length, 2, '2 checkpoints');
}

console.log('Causal Replay tests passed.')
