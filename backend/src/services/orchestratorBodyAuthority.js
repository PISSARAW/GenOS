'use strict';

async function bind(ctx, body = ctx.orchestratorBody) {
  if (!body || !ctx.agentId || !ctx.executionRun?.id || typeof ctx.db?.all !== 'function') return body;
  const authority = await require('./missionEnvelopeAuthority').assertRun(ctx.db, {
    agentId: ctx.agentId, runId: ctx.executionRun.id, mission: ctx.normalizedMission
  });
  if (authority.status !== 'authorized') return body;
  const percepts = body.percepts.map((percept) => ({ ...percept,
    sensorOwnerAgentId: ctx.agentId,
    ownerAuthorityHash: authority.hash,
    provenanceStatus: 'owner_bound',
    observationAttested: false
  }));
  const bound = { ...body, percepts };
  ctx.orchestratorBody = bound;
  ctx.normalizedMission.orchestratorBody = bound;
  return bound;
}

module.exports = { bind };
