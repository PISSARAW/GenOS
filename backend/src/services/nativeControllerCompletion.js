'use strict';

async function close(ctx, nativeCompletion) {
  const continuity = require('./missionContinuityService');
  const mission = continuity.buildMissionInput(ctx.normalizedMission.missionId,
    ctx.normalizedMission.prompt, { orchestratorAgentId: ctx.agentId,
      completionContract: ctx.normalizedMission.completionContract,
      context: { missionOutcome: Boolean(nativeCompletion?.dossierDigest),
        flags: { nativeCompletionAccepted: Boolean(nativeCompletion?.dossierDigest) } } });
  const evaluation = await continuity.evaluateContinuity(ctx.db, mission);
  const transition = await continuity.transitionMissionToComplete(ctx.db, {
    organism: evaluation.organism, mission, context: mission.context, immune: evaluation.immune });
  if (!transition.allowed) throw Object.assign(new Error(transition.reason), {
    code: 'NATIVE_CONTROLLER_MISSION_INCOMPLETE', transition });
  const identity = await require('./missionIdentityService').setStatus(ctx.db, mission.id, 'completed');
  return { ...nativeCompletion, transition, missionStatus: identity.status };
}

module.exports = { close };
