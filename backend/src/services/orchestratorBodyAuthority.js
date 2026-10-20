'use strict';

async function bind(ctx, body = ctx.orchestratorBody) {
  if (!body || !ctx.agentId || !ctx.executionRun?.id || typeof ctx.db?.all !== 'function') return body;
  let authority;
  try {
    authority = await require('./missionEnvelopeAuthority').assertRun(ctx.db, {
      agentId: ctx.agentId, runId: ctx.executionRun.id, mission: ctx.normalizedMission
    });
  } catch (_) {
    // Aucune autorité d'exécution n'est liée à ce run (pas de contexte
    // organisation/projet disponible). On continue sans owner-binding des
    // percepts plutôt que de faire échouer l'orchestration entière.
    return body;
  }
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
