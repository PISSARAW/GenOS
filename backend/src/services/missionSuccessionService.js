'use strict';
const authority = require('./missionExecutionAuthority');

async function resumeWithAuthority(db, input) {
  const { mission, successorId, expectedOrchestratorId, workspaceId } = input;
  const runtime = input.runtime || require('./agentRuntimeAdapter');
  if (!mission.missionId) return runtime.startMission({ ...mission, agentId: successorId, workspaceId });
  const lease = await authority.reserve(db, { missionId: mission.missionId, agentId: successorId, expectedOrchestratorId });
  if (lease.state === 'running') return { started: true, duplicate: true };
  await authority.claimLaunch(db,lease);
  try {
    if (expectedOrchestratorId && expectedOrchestratorId !== successorId) await runtime.stopMission(expectedOrchestratorId);
    await authority.assertAuthority(db,lease);
    const resumed = await runtime.startMission({ ...mission, agentId: successorId, workspaceId, missionExecutionAuthority: lease });
    await authority.mark(db,{ authority: lease,state: 'running' });
    await require('./missionIdentityService').setStatus(db,mission.missionId,'active');
    return resumed;
  } catch (error) {
    await authority.mark(db,{ authority: lease,state: 'failed' }).catch(() => {});
    throw error;
  }
}
module.exports = { resumeWithAuthority };
