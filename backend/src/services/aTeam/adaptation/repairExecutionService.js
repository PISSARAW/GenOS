'use strict';

const runtime = require('../aTeamRuntime');
const teamRunStore = require('../teamRunStore');

async function executeRepair(input = {}) {
  const identity = validateIdentity(input);
  const current = await loadRun(input.db, identity.teamRunId);
  const previous = findReceipt(current, identity.repairId);
  if (previous) return { run: current, receipt: previous, replayed: true };
  validatePlan(input, current);
  const repairing = await beginRepair(input, current, identity.repairId);
  try {
    const result = await applyPlan(input, repairing);
    return await completeRepair({ input, run: repairing, repairId: identity.repairId, result });
  } catch (error) {
    return recordBlocked({ input, run: repairing, repairId: identity.repairId, error });
  }
}

function validateIdentity(input) {
  const teamRunId = String(input.teamRunId || '').trim();
  const repairId = String(input.repairId || '').trim();
  if (!teamRunId || !repairId) throw coded('A-Team repair requires teamRunId and repairId.', 'ATEAM_REPAIR_IDENTITY_REQUIRED');
  return { teamRunId, repairId };
}

async function loadRun(db, teamRunId) {
  const run = await teamRunStore.load(db, teamRunId);
  if (!run) throw coded(`Unknown A-Team run '${teamRunId}'.`, 'ATEAM_RUN_UNKNOWN');
  return run;
}

function findReceipt(run, repairId) {
  return (run.execution?.repairReceipts || []).find((entry) => entry.repairId === repairId) || null;
}

function validatePlan(input, run) {
  const plan = input.repairPlan || {};
  if (run.status !== 'RUNNING') throw coded('A-Team repair requires a RUNNING run.', 'ATEAM_REPAIR_RUN_NOT_RUNNING');
  const lease = run.execution?.runnerLease;
  if (lease && Date.parse(lease.expiresAt) > Date.now()) throw coded('A-Team repair cannot overlap an active stage runner.', 'ATEAM_REPAIR_RUNNER_ACTIVE');
  if (!['REASSIGN', 'RECRUIT', 'REPLACE'].includes(plan.status)) throw coded('Unsupported A-Team repair action.', 'ATEAM_REPAIR_ACTION_INVALID');
  if (plan.status === 'REASSIGN') return validateReassignment(plan, run);
  validateProvisioning(input, plan);
}

function validateReassignment(plan, run) {
  const member = run.members.find((entry) => (entry.agentId || entry.memberId) === plan.toMemberId);
  if (!member || member.status !== 'ACTIVE') throw coded('Reassignment target is not an active team member.', 'ATEAM_REPAIR_TARGET_INVALID');
  if (!plan.capability) throw coded('Reassignment requires a capability.', 'ATEAM_REPAIR_CAPABILITY_REQUIRED');
}

function validateProvisioning(input, plan) {
  const cost = Number(plan.estimatedCost);
  const budget = Number(input.budget);
  if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(budget) || budget < cost) throw coded('Repair exceeds its authorized budget.', 'ATEAM_REPAIR_BUDGET_EXCEEDED');
  if (Number(input.availableSlots) < 1) throw coded('Repair has no available worker slot.', 'ATEAM_REPAIR_CAPACITY_UNAVAILABLE');
  if (typeof input.reserveCandidate !== 'function' || typeof input.launchWorker !== 'function') {
    throw coded('Repair requires the controlled reservation and dispatch adapters.', 'ATEAM_REPAIR_EXECUTOR_REQUIRED');
  }
  if (!plan.candidate && !plan.replacement) throw coded('Repair plan has no candidate.', 'ATEAM_REPAIR_CANDIDATE_REQUIRED');
}

async function beginRepair(input, run, repairId) {
  const receipt = { repairId, action: input.repairPlan.status, status: 'EXECUTING', startedAt: new Date().toISOString() };
  return runtime.transitionRun({
    db: input.db, teamRunId: run.teamRunId, revision: run.revision,
    patch: { status: 'REPAIRING', execution: withReceipt(run.execution, receipt) }
  });
}

function withReceipt(execution, receipt) {
  return { ...(execution || {}), repairReceipts: [...(execution?.repairReceipts || []), receipt] };
}

async function applyPlan(input, run) {
  if (input.repairPlan.status === 'REASSIGN') return reassign(run.members, input.repairPlan);
  return provision(input, run);
}

function reassign(members, plan) {
  const capability = String(plan.capability);
  const updated = members.map((member) => {
    if ((member.agentId || member.memberId) === plan.fromMemberId) return updateResponsibilities(member, capability, false);
    if ((member.agentId || member.memberId) === plan.toMemberId) return updateResponsibilities(member, capability, true);
    return member;
  });
  return { members: updated, workerId: plan.toMemberId };
}

function updateResponsibilities(member, capability, add) {
  const current = member.ownedResponsibilities || [];
  const ownedResponsibilities = add ? [...new Set([...current, capability])] : current.filter((item) => item !== capability);
  return { ...member, ownedResponsibilities };
}

async function provision(input, run) {
  const plan = input.repairPlan;
  const candidate = plan.candidate || plan.replacement;
  const reservation = await input.reserveCandidate({ candidate, teamRunId: run.teamRunId, repairId: input.repairId });
  if (!reservation?.accepted) throw coded('Candidate reservation was rejected.', 'ATEAM_REPAIR_RESERVATION_REJECTED');
  try {
    const launched = await input.launchWorker({ candidate, reservation, run, repairPlan: plan });
    if (!launched?.workerId || !['ACTIVE', 'RUNNING'].includes(String(launched.status || '').toUpperCase())) {
      throw coded('Dispatched repair worker did not reach an active state.', 'ATEAM_REPAIR_WORKER_NOT_ACTIVE');
    }
    return { members: replaceMember({ members: run.members, plan, candidate, launched }), workerId: launched.workerId };
  } catch (error) {
    await releaseReservation(input, reservation, run);
    throw error;
  }
}

function replaceMember({ members, plan, candidate, launched }) {
  const next = [...members];
  if (plan.status === 'REPLACE') markReplaced(next, plan.failedMemberId);
  next.push(newMember({ candidate, plan, launched }));
  return next;
}

function markReplaced(members, failedMemberId) {
  const index = members.findIndex((member) => (member.agentId || member.memberId) === failedMemberId);
  if (index < 0) throw coded('Failed member disappeared before replacement.', 'ATEAM_REPAIR_MEMBER_CONFLICT');
  members[index] = { ...members[index], status: 'REPLACED' };
}

function newMember({ candidate, plan, launched }) {
  return {
    ...candidate, memberId: launched.workerId, agentId: launched.workerId,
    workerId: launched.workerId, status: 'ACTIVE', ownedResponsibilities: responsibilities(candidate, plan),
    expertise: valueOr(candidate.expertise, candidate.capabilities, []), authority: valueOr(candidate.authority, null, emptyAuthority()),
    participationMode: valueOr(candidate.participationMode, null, 'FULL'), role: valueOr(candidate.role, null, 'specialist'),
    consumes: valueOr(candidate.consumes, null, []), provides: valueOr(candidate.provides, candidate.outputs, []),
    consults: valueOr(candidate.consults, null, []), toolLease: valueOr(candidate.toolLease, null, [])
  };
}

function valueOr(primary, secondary, fallback) {
  return primary || secondary || fallback;
}

function responsibilities(candidate, plan) {
  if (plan.status === 'REPLACE') return [...(candidate.ownedResponsibilities || candidate.capabilities || [])];
  return [plan.capability];
}

function emptyAuthority() {
  return { owns: [], mayModify: [], mayPropose: [], mustConsult: [], mayRead: [], cannotOverride: [] };
}

async function releaseReservation(input, reservation, run) {
  if (typeof input.releaseCandidate !== 'function') return;
  await input.releaseCandidate({ reservation, teamRunId: run.teamRunId, repairId: input.repairId });
}

async function completeRepair({ input, run, repairId, result }) {
  const completedAt = new Date().toISOString();
  const execution = finishReceipt(run.execution, repairId, { status: 'COMPLETED', workerId: result.workerId, completedAt });
  return saveRepair(input, run, { status: input.deferResume ? 'REPAIRING' : 'RUNNING', members: result.members, execution });
}

async function recordBlocked({ input, run, repairId, error }) {
  const execution = finishReceipt(run.execution, repairId, { status: 'BLOCKED', errorCode: error.code || 'ATEAM_REPAIR_FAILED', completedAt: new Date().toISOString() });
  return saveRepair(input, run, { status: 'BLOCKED', execution });
}

function finishReceipt(execution, repairId, patch) {
  return { ...(execution || {}), repairReceipts: (execution?.repairReceipts || []).map((entry) => entry.repairId === repairId ? { ...entry, ...patch } : entry) };
}

async function saveRepair(input, run, patch) {
  const saved = await runtime.transitionRun({ db: input.db, teamRunId: run.teamRunId, revision: run.revision, patch });
  return { run: saved, receipt: findReceipt(saved, input.repairId), replayed: false };
}

function coded(message, code) {
  return Object.assign(new Error(message), { code });
}

module.exports = { executeRepair };
