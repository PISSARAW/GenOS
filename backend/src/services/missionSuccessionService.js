'use strict';
const authority = require('./missionExecutionAuthority');

async function resumeWithAuthority(db, input) {
  const { mission, successorId, expectedOrchestratorId, workspaceId } = input;
  const runtime = input.runtime || require('./agentRuntimeAdapter');
  if (!mission.missionId) return runtime.startMission({ ...mission, agentId: successorId, workspaceId });
  const previous = await require('./missionIdentityService').get(db, mission.missionId);
  const lease = await authority.reserve(db, { missionId: mission.missionId, agentId: successorId, expectedOrchestratorId });
  if (authority.isOwnerLive(lease)) return { started: true, duplicate: true };
  await authority.claimLaunch(db,lease);
  try {
    if (expectedOrchestratorId && expectedOrchestratorId !== successorId) await runtime.stopMission(expectedOrchestratorId);
    await authority.assertAuthority(db,lease);
    const resumed = await runtime.startMission({ ...mission, agentId: successorId, workspaceId, missionExecutionAuthority: lease });
    assertDormantLaunch(previous, resumed);
    await authority.mark(db,{ authority: lease,state: 'running' });
    await require('./missionIdentityService').setStatus(db,mission.missionId,'active');
    return resumed;
  } catch (error) {
    await authority.mark(db,{ authority: lease,state: 'failed' }).catch(() => {});
    throw error;
  }
}

function assertDormantLaunch(previous, resumed) {
  if (previous?.status !== 'dormant') return;
  if (resumed?.started === true && resumed.duplicate !== true) return;
  throw Object.assign(new Error('Dormant mission did not launch a new runtime.'), { code: 'MISSION_RESUME_NOT_LAUNCHED' });
}
module.exports = { resumeWithAuthority };
