'use strict';

async function assert(db, request) {
  if (!db || !request?.agentId || !request.toolName) return false;
  try {
    await require('../../missionExecutionAuthority').assertAgentCurrent(db, request.agentId);
    const result = await require('../../missionEnvelopeAuthority').assertTool(db, {
      agentId: request.agentId, toolName: request.toolName
    });
    return result.status === 'authorized';
  } catch (_) {
    return false;
  }
}

module.exports = { assert };
