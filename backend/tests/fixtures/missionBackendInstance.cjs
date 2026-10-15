'use strict';

const http = require('node:http');
const { getDatabase, closeDatabase } = require('../../src/db');
const { createApp } = require('../../src/app');
const succession = require('../../src/services/missionSuccessionService');
const authority = require('../../src/services/missionExecutionAuthority');

const waits = new Map();

function awaitRelease(id) {
  return new Promise(resolve => waits.set(id, resolve));
}

async function dispatch(db, input) {
  if (input.action === 'assert') {
    await authority.assertAgentCurrent(db, input.agentId);
    return { current: true };
  }
  if (input.action === 'reserve') {
    return { reserved: await authority.reserve(db, input) };
  }
  if (input.action === 'resume') {
    const runtime = {
      stopMission: async missionId => {
        if (input.pauseAfterClaim) {
          process.send({ requestId: input.requestId, phase: 'stop-entered', missionId });
          await awaitRelease(input.requestId);
        }
        return true;
      },
      startMission: async mission => {
        await db.run('INSERT INTO effects(agent_id) VALUES (?)', mission.agentId);
        return { started: true };
      }
    };
    return { result: await succession.resumeWithAuthority(db, {
      mission: { missionId: input.missionId }, successorId: input.agentId,
      expectedOrchestratorId: input.expectedOrchestratorId, runtime
    }) };
  }
  throw new Error(`Unknown test action: ${input.action}`);
}

async function main() {
  const db = await getDatabase();
  const server = http.createServer(createApp());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  process.send({ ready: true, port: server.address().port, pid: process.pid });
  process.on('message', async input => {
    if (input.action === 'release') {
      const release = waits.get(input.requestId);
      if (release) {
        waits.delete(input.requestId);
        release();
      }
      return;
    }
    try {
      process.send({ requestId: input.requestId, ...(await dispatch(db, input)) });
    } catch (error) {
      process.send({ requestId: input.requestId, error: error.code || error.message });
    }
  });
  process.on('disconnect', () => shutdown(server));
}

async function shutdown(server) {
  server.close();
  await closeDatabase();
  process.exit(0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
