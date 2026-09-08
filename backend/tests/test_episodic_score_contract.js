const assert = require('node:assert/strict');
const episodic = require('../src/services/episodicMemoryService');
const db = { run: async () => ({ changes: 1 }) };

(async () => {
  await assert.rejects(() => episodic.recordEpisode({ agentId: 'a', rewardScore: 2 }, db), /between 0 and 1/);
  await assert.rejects(() => episodic.recordEpisode({ agentId: 'a', rewardScore: NaN }, db), /between 0 and 1/);
  await assert.rejects(() => episodic.consolidateEpisodes({ scoreThreshold: -0.1 }, db), /between 0 and 1/);
  console.log('Episodic score contract checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
