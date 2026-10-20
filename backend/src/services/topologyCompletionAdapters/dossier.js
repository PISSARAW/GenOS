'use strict';

function memberId(member) {
  return member?.memberId || member?.workerId || null;
}

function baseDossier(input = {}) {
  const { context = {}, evidence = {} } = input;
  const members = Array.isArray(evidence.members) ? evidence.members : [];
  return { missionId: context.missionId || null, topology: context.mode || null,
    lifecycleState: context.lifecycleState || 'completed', producerId: context.missionId || null,
    roster: { requiredMemberIds: members.map(memberId).filter(Boolean), members,
      evidenceProofs: Array.isArray(evidence.evidenceProofs) ? evidence.evidenceProofs : [] },
    barrierStatus: context.output?.complete === true ? 'complete' : 'partial' };
}

function closureInput(dossier = {}) {
  const source = dossier || {};
  const roster = source.roster || {};
  return { missionId: source.missionId || null, topology: source.topology || null,
    lifecycleState: source.lifecycleState, producerId: source.producerId || null,
    requiredMemberIds: roster.requiredMemberIds, members: roster.members,
    evidenceProofs: roster.evidenceProofs, topologyValidation: source.topologyValidation,
    barrierStatus: source.barrierStatus, invariants: source.invariants,
    oracle: source.oracle || null };
}

module.exports = { baseDossier, closureInput, memberId };
