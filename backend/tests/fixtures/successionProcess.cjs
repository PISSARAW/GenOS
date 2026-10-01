'use strict';
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const succession = require('../../src/services/missionSuccessionService');
const authority = require('../../src/services/missionExecutionAuthority');
async function main() {
  const db = await open({ filename: process.env.TEST_DB, driver: sqlite3.Database });
  await db.exec('PRAGMA busy_timeout=10000');
  process.send({ ready: true });
  process.on('message', async input => {
    try {
      if (input.action === 'reserve') {
        const lease = await authority.reserve(db, input);
        process.send({ reserved: lease });
      } else if (input.action === 'assert') {
        await authority.assertAgentCurrent(db,input.agentId); process.send({ current: true });
      } else {
        const result = await succession.resumeWithAuthority(db, {
          mission: { missionId: input.missionId }, successorId: input.agentId,
          expectedOrchestratorId: input.expectedOrchestratorId,
          runtime: {
            stopMission: async () => true,
            startMission: async () => {
              await db.run('INSERT INTO effects(agent_id) VALUES (?)',input.agentId);
              return { started: true };
            }
          }
        });
        process.send({ result });
      }
    } catch (error) { process.send({ error: error.code || error.message }); }
  });
}
main().catch(error => { console.error(error); process.exit(1); });
