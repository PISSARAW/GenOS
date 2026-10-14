'use strict';

const { buildWorkerSelf, formatWorkerSelfPrompt } = require('./workerSelfService');

async function checkedWorkerSelfBlock(db, mission) {
  try {
    const self = await buildWorkerSelf(db, { agentId: mission.agentId,
      workerRole: mission.role || 'worker', workerContext: { mission: mission.prompt } });
    if (!self.identityDecision.mayAct) {
      throw Object.assign(new Error(`Worker identity cannot act: ${self.identityDecision.reason}`),
        { code: 'WORKER_IDENTITY_INACTIVE' });
    }
    return formatWorkerSelfPrompt(self);
  } catch (error) {
    if (error.code === 'WORKER_IDENTITY_INACTIVE') throw error;
    throw Object.assign(new Error(`Worker identity unavailable: ${error.message}`),
      { code: 'WORKER_IDENTITY_UNAVAILABLE', cause: error });
  }
}

module.exports = { checkedWorkerSelfBlock };
