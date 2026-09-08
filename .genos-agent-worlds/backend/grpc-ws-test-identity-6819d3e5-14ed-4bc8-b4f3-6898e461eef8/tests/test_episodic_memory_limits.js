const assert = require('assert');
const episodic = require('../src/services/episodicMemoryService');

(async () => {
  const previous = process.env.GENOS_MAX_EPISODE_FIELD_BYTES;
  process.env.GENOS_MAX_EPISODE_FIELD_BYTES = '4';
  try {
    await assert.rejects(
      episodic.recordEpisode({ action_input: '12345' }, { run: async () => {} }),
      /Episode action_input exceeds the 4-byte limit/
    );
    console.log('Episodic memory size limit passed.');
  } finally {
    if (previous === undefined) delete process.env.GENOS_MAX_EPISODE_FIELD_BYTES;
    else process.env.GENOS_MAX_EPISODE_FIELD_BYTES = previous;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});