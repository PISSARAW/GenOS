'use strict';

const { waitForMetapopulationWorkers } = require('./metapopulationWaiter.cjs');
const { reviewMetapopulationCandidates } = require('./metapopulationReviewer.cjs');
const { dispatchBiologicalMembersCore, dispatchRhizomeMissionMembers, selectMembers } = require('./biologicalMemberDispatcherCore.cjs');

async function dispatchBiologicalMembers({ db, context, mode, parent, members }) {
  const garage = await workerGarage.state(db, context.orchestratorId);
  if (garage.available <= 0) throw Object.assign(new Error(`${mode} requires free worker slots, but worker garage is full`), { code: 'WORKER_GARAGE_FULL' });
  const waves = mode === 'metapopulation' || process.env.GENOS_TOPOLOGY_AWAIT_WORKERS === '1';
  const selected = selectMembers(members, garage.available, waves ? 2 : members.length);
  if (mode === 'rhizome') return dispatchRhizomeMissionMembers({ db, context, members: selected, parent });
  return dispatchBiologicalMembersCore({ db, context, mode, parent, selected, waves });
}

async function dispatchMetapopulationReview({ db, context, parent, members, initialWorkers }) {
  const initialSettled = await waitForMetapopulationWorkers(db, initialWorkers, context.request.timeoutMs);
  for (const member of initialWorkers) member.result = await metapopulationMissionResults.read(db, member);
  const initial = initialWorkers.map((member) => ({ role: member.role, ...member.result }));
  if (!initialSettled) {
    for (const member of initialWorkers) member.result.initialResults = initial;
    return initialWorkers;
  }
  let candidates = initial;
  let accepted = initialWorkers;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    accepted = await reviewMetapopulationCandidates({ db, context, parent, members, candidates });
    await waitForMetapopulationWorkers(db, accepted, context.request.timeoutMs);
    for (const member of accepted) {
      member.result = await metapopulationMissionResults.read(db, member);
      member.result.initialResults = initial;
    }
    candidates = accepted.map((member) => ({ role: member.role, ...member.result }));
    if (accepted.every((member) => isVerifiedResult(member.result))) break;
  }
  return accepted;
}

module.exports = { dispatchBiologicalMembers, dispatchMetapopulationReview };