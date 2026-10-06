'use strict';

const rhizomeMissionRunner = require('../rhizome/rhizomeMissionRunnerService.js');

async function applyRhizomeResults({ db, context, mode, topology, accepted, parent, output }) {
  if (mode !== 'rhizome' || !topology.sessionId) return;
  const discovery = await rhizomeMissionRunner.completeMission({
    db, sessionId: topology.sessionId, accepted, mission: output.biologicalMode.mission,
    dispatch: (members) => dispatchRhizomeMissionMembers({ db, context, members, parent })
  });
  const { result, discoveredBranches } = discovery;
  output.biologicalMode.members.push(...discoveredBranches);
  Object.assign(output.biologicalMode, result, { status: result.status, graphVersion: result.graph.graphVersion });
}

function dispatchRhizomeMissionMembers({ db, context, members, parent }) {
  return rhizomeMissionRunner.dispatchMembers({
    members,
    hasCapacity: async () => (await workerGarage.state(db, context.orchestratorId)).available > 0,
    launch: (member, index) => launchWorker({ db, context, member, index, parent })
  });
}

module.exports = { applyRhizomeResults };