'use strict';

const resultsService = require('./rhizomeMissionResultService');

const MAX_DISCOVERY_BRANCHES = 8;
const MAX_DISCOVERY_ROUNDS = 2;

async function completeMission(input) {
  const { db, sessionId, accepted, mission, dispatch } = input;
  const branches = [...accepted];
  let result = await resultsService.collect(db, sessionId, branches);
  const state = { db, sessionId, branches, mission, dispatch, result, seen: new Set(), unlaunched: [], deferred: [], launched: 0 };
  await runDiscoveryRounds(state);
  result = state.result;
  result.unexploredDependencies = unresolvedCandidates(state);
  if (result.unexploredDependencies.length) {
    result.status = 'partial';
    result.complete = false;
  }
  delete result.branchCandidates;
  return { result, discoveredBranches: branches.slice(accepted.length) };
}

async function runDiscoveryRounds(state) {
  let pending = state.result.branchCandidates || [];
  for (let round = 0; round < MAX_DISCOVERY_ROUNDS && state.launched < MAX_DISCOVERY_BRANCHES; round += 1) {
    const fresh = pending.filter((candidate) => !state.seen.has(candidate.id));
    const candidates = fresh.slice(0, MAX_DISCOVERY_BRANCHES - state.launched);
    const selectedIds = new Set(candidates.map((candidate) => candidate.id));
    state.deferred = state.deferred.filter((candidate) => !selectedIds.has(candidate.id));
    state.deferred.push(...fresh.slice(candidates.length));
    if (!candidates.length) return;
    candidates.forEach((candidate) => state.seen.add(candidate.id));
    const members = candidates.map((candidate, index) => discoveryMember(candidate, index, state.mission));
    const launched = await state.dispatch(members);
    state.branches.push(...launched);
    state.launched += launched.length;
    const launchedIds = new Set(launched.map((branch) => branch.branchCandidateId));
    state.unlaunched.push(...candidates.filter((candidate) => !launchedIds.has(candidate.id)));
    state.result = await resultsService.collect(state.db, state.sessionId, state.branches);
    pending = [...state.unlaunched, ...fresh.slice(candidates.length), ...newCandidates(state)];
  }
}

function newCandidates(state) {
  return (state.result.branchCandidates || []).filter((candidate) => !state.seen.has(candidate.id));
}

function unresolvedCandidates(state) {
  const pending = [...state.unlaunched, ...state.deferred, ...(state.result.branchCandidates || [])];
  return [...new Map(pending.map((item) => [item.id, item])).values()];
}

function discoveryMember(candidate, index, mission) {
  return {
    role: 'capability_offshoot', workerKind: 'specialist', modelTier: 'standard',
    branchCandidateId: candidate.id,
    branchCandidateLabel: candidate.label,
    branchCandidateReason: candidate.reason,
    mission: `Rhizome discovery branch for the shared mission: ${mission}\nExplore the newly discovered dependency "${candidate.label}" (${candidate.id}). Why it matters: ${candidate.reason || 'a completed branch identified it as necessary but unmapped'}. Return JSON with top-level claims and the required workerArtifact for your worker contract. Also include answer, capabilities, unknownDependencies, interfaces, assumptions, and evidence. Define its capability boundary, inputs, outputs, neighboring contracts, alternatives and evidence. Continue exposing unmapped dependencies with stable identifiers.`,
    memberNumber: index + 1
  };
}

async function dispatchMembers(input) {
  const { members, hasCapacity, launch } = input;
  const completed = [];
  for (const [index, member] of members.entries()) {
    if (!await hasCapacity()) {
      completed.push(...failedMembers(members.slice(index), 'No worker slot was available for this Rhizome branch.'));
      break;
    }
    try {
      completed.push(await launch(member, index + 1));
    } catch (error) {
      console.error(`[topology] Rhizome discovery branch failed: ${error?.message || error}`);
      completed.push(...failedMembers([member], String(error?.message || error)));
    }
  }
  return completed;
}

function failedMembers(members, reason) {
  return members.map((member) => ({
    workerId: null, role: member.role, branchCandidateId: member.branchCandidateId,
    status: 'error', answer: '', failureReason: reason
  }));
}

module.exports = { completeMission, dispatchMembers };
