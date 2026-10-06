'use strict';

const store = require('../holobiontStore');
const constitution = require('../host/hostConstitutionService');
const persistentHost = require('../persistentHostService');
const contracts = require('../contracts/symbiosisContractService');
const admission = require('../symbionts/symbiontAdmissionService');
const runtime = require('./holobiontRuntime');
const stop = require('./stopConditionsService');
const policy = require('./capabilityExecutionPolicy');
const limits = require('./missionExecutionLimits');
const { initializeHolobiontSchema } = require('./holobiontSchema');

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw policy.invalid(`${field} is required.`);
  return value.trim();
}

async function openMissionHost(db, input = {}) {
  const hostId = requiredText(input.hostId, 'hostId');
  const missionId = requiredText(input.missionId, 'missionId');
  await initializeHolobiontSchema(db);
  if (input.holobiontId) return existingMissionHost(db, { ...input, hostId, missionId });
  const hostConstitution = constitution.createHostConstitution({
    ...input.constitution, hostId, identity: input.constitution?.identity || hostId,
    objectives: input.constitution?.objectives || [missionId]
  });
  if (input.persistentHost === true) return persistentHost.openPersistentHost(db, {
    ...input, hostId, missionId, constitution: hostConstitution
  });
  const session = await store.createSession(db, { hostId, missionId, constitution: hostConstitution,
    constitutionId: hostConstitution.constitutionId, workspaceId: input.workspaceId, projectId: input.projectId });
  return { session, reused: false };
}

function assertHostScope(session, input) {
  const mismatched = ['projectId', 'workspaceId'].some((key) => input[key] !== undefined && input[key] !== session[key]);
  if (mismatched) throw policy.invalid('Session belongs to another project or workspace.', 'HOLOBIONT_HOST_SCOPE_INVALID');
}

async function existingMissionHost(db, input) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session || session.hostId !== input.hostId) throw policy.invalid('Session does not belong to this Host.', 'HOLOBIONT_HOST_MISMATCH');
  assertHostScope(session, input);
  if (session.scope === 'MISSION' && session.missionId !== input.missionId) throw policy.invalid('Session belongs to another mission.', 'HOLOBIONT_MISSION_MISMATCH');
  if (session.status !== 'ACTIVE') throw policy.invalid('Existing mission Host must be active.', 'HOLOBIONT_SESSION_INACTIVE');
  return { session, reused: true };
}

async function discoverCandidate(db, context) {
  const { session, symbiont, input } = context;
  const known = session.candidateSymbionts.find((item) => item.id === symbiont.id);
  if (known) return session;
  await store.appendEvent(db, { holobiontId: session.holobiontId,
    expectedRevision: session.revision, eventType: 'SYMBIONT_DISCOVERED', actorId: input.actorId,
    payload: { symbiontId: symbiont.id, symbiont: { kind: symbiont.kind,
      capabilities: symbiont.contract.capabilitiesOffered, role: symbiont.role } } });
  return store.getSession(db, session.holobiontId);
}

async function candidateContract(db, context) {
  const { session, symbiont, input } = context;
  const existing = await contracts.getContract(db, session.holobiontId, symbiont.id);
  if (existing) return existing;
  return contracts.createContract(db, { holobiontId: session.holobiontId,
    expectedSessionRevision: session.revision, actorId: input.actorId,
    contract: { ...symbiont.contract, hostId: session.hostId, symbiontId: symbiont.id } });
}

async function trialContext(db, context) {
  let { session } = context;
  session = await discoverCandidate(db, context);
  const contract = await candidateContract(db, { ...context, session });
  const candidate = session.candidateSymbionts.find((item) => item.id === context.symbiont.id);
  if (candidate.status === 'CANDIDATE') await admission.startAdmission(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
    symbiontId: candidate.id, capability: contract.capabilitiesOffered[0], actorId: context.input.actorId
  });
  session = await store.getSession(db, session.holobiontId);
  const current = session.candidateSymbionts.find((item) => item.id === candidate.id);
  if (current.status !== 'TRIAL') throw policy.invalid('Candidate must be released before trial.', 'HOLOBIONT_CANDIDATE_STATE_INVALID');
  return { session, contract, resident: current, capability: current.admissionTrial.capability };
}

async function admitMissionSymbiont(db, input, symbiont) {
  requiredText(symbiont.id, 'symbiont.id');
  const session = await store.getSession(db, input.holobiontId);
  const resident = session.residentSymbionts.find((item) => item.id === symbiont.id);
  if (resident) return { decision: resident.status === 'RESIDENT' ? 'REUSED' : 'UNAVAILABLE', symbiontId: resident.id };
  if (typeof input.trialCapabilityExecutor !== 'function') throw policy.invalid('An isolated trial executor is required.', 'HOLOBIONT_TRIAL_EXECUTOR_REQUIRED');
  const plan = await trialContext(db, { session, symbiont, input });
  const sandbox = boundedTrial(plan.resident.admissionTrial, input);
  const invocation = structuredClone({ capability: plan.capability,
    candidate: plan.resident, contract: plan.contract, sandbox, session: plan.session });
  const raw = await input.trialCapabilityExecutor({ ...invocation, signal: input.signal });
  input.signal?.throwIfAborted();
  const output = await policy.verifyOutput(raw, { plan, input, allocation: { resources: sandbox.maxCost } });
  input.signal?.throwIfAborted();
  const verdict = await policy.authorizeOutput(db, { plan, output: { ...output, receiptId: sandbox.trialId }, input });
  const result = await admission.evaluateTrial(db, { holobiontId: session.holobiontId,
    expectedSessionRevision: plan.session.revision, symbiontId: symbiont.id,
    contributionScore: output.contributionScore, verification: output.verification,
    contractCompliant: output.contractCompliant === true, unsafeBehavior: output.unsafeBehavior === true || verdict.allowed !== true,
    riskScore: output.riskScore, actorId: input.actorId });
  return { ...result, resourcesConsumed: output.resourcesConsumed };
}

function boundedTrial(trial, input) {
  if (input.remainingTokens === undefined) return trial;
  if (input.remainingTokens <= 0) throw policy.invalid('Admission token budget exhausted.', 'BUDGET_EXHAUSTED');
  const tokens = Math.min(trial.maxCost.tokens ?? input.remainingTokens, input.remainingTokens);
  return { ...trial, maxCost: { ...trial.maxCost, tokens } };
}

function validateStep(step) {
  requiredText(step?.capability, 'step.capability');
  const allowed = new Set(['capability', 'request', 'allocation', 'toolName', 'dataClasses', 'changedInvariants']);
  if (Object.keys(step).some((key) => !allowed.has(key))) throw policy.invalid('Step cannot change Host identity, adapters or budget.', 'HOLOBIONT_STEP_SCOPE_INVALID');
}

function validateAllocation(allocation) {
  const tokens = Number(allocation?.available?.tokens);
  if (!allocation?.policy?.tokens || !Number.isFinite(tokens) || tokens <= 0) {
    throw policy.invalid('A token allocation policy and positive availability are required.', 'HOLOBIONT_RESOURCE_INVALID');
  }
}

function validateMissionStep(step, input) {
  validateStep(step);
  validateAllocation(step.allocation || input.allocation);
}

function prepareMission(input) {
  requiredText(input.hostId, 'hostId');
  requiredText(input.missionId, 'missionId');
  const steps = input.steps || [{ capability: input.capability, request: input.request }];
  const budget = limits.missionBudget(input);
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > Math.min(32, budget.maxSteps)) {
    throw policy.invalid('Mission must have between 1 and 32 bounded steps.');
  }
  steps.forEach((step) => validateMissionStep(step, input));
  if (input.symbionts && (!Array.isArray(input.symbionts) || input.symbionts.length > 32)) throw policy.invalid('At most 32 symbionts can be admitted per mission.');
  if (typeof input.executeCapability !== 'function' || typeof input.verifyCapability !== 'function') {
    throw policy.invalid('Mission executor and independent verifier are required.', 'HOLOBIONT_ADAPTERS_REQUIRED');
  }
  const deadline = limits.missionDeadline(input, budget);
  return { steps, budget, deadline, input: { ...input, signal: deadline.signal,
    executeCapability: limits.boundedAdapter(input.executeCapability, deadline.signal),
    verifyCapability: limits.boundedAdapter(input.verifyCapability, deadline.signal),
    trialCapabilityExecutor: limits.boundedAdapter(input.trialCapabilityExecutor, deadline.signal) } };
}

async function admitCandidates(db, context) {
  const receipts = [];
  for (const symbiont of context.input.symbionts || []) {
    context.input.signal.throwIfAborted();
    const receipt = await admitMissionSymbiont(db, { ...context.input, remainingTokens: context.budget.tokens - context.usage.tokens }, symbiont);
    receipts.push(receipt);
    context.usage.tokens += Number(receipt.resourcesConsumed?.tokens || 0);
    if (context.usage.tokens > context.budget.tokens) throw policy.invalid('Admission exceeded the mission token budget.', 'BUDGET_EXHAUSTED');
    if (!['ADMITTED', 'REUSED'].includes(receipt.decision)) return { accepted: false, receipts };
  }
  return { accepted: true, receipts };
}

function stepInput(context, step) {
  const remaining = context.budget.tokens - context.usage.tokens;
  if (remaining <= 0) throw policy.invalid('Mission token budget exhausted.', 'BUDGET_EXHAUSTED');
  const allocation = step.allocation || context.input.allocation;
  if (!allocation) throw policy.invalid('Each step requires a resource allocation policy.', 'HOLOBIONT_RESOURCE_INVALID');
  return { ...context.input, ...step, allocation: { ...allocation,
    available: { ...allocation.available, tokens: Math.min(Number(allocation.available?.tokens || 0), remaining) } },
    executeCapability: context.input.executeCapability, verifyCapability: context.input.verifyCapability,
    signal: context.input.signal };
}

async function runSteps(db, context) {
  const completed = [];
  for (const step of context.steps) {
    context.input.signal.throwIfAborted();
    const result = await runtime.runCycle(db, stepInput(context, step));
    completed.push(result);
    if (result.status !== 'VERIFIED') return { status: result.status, completed };
    context.usage.tokens += Number(result.execution.contribution.resourcesConsumed.tokens || 0);
  }
  return { status: 'VERIFIED', completed };
}

async function finishMission(db, context, outcome) {
  if (outcome.status !== 'VERIFIED') return { ...outcome, stopped: false };
  context.input.signal.throwIfAborted();
  const session = await store.getSession(db, context.input.holobiontId);
  const lifecycle = await stop.stopHolobiont(db, { holobiontId: session.holobiontId,
    expectedSessionRevision: session.revision, missionId: context.input.missionId,
    missionCompleted: true, missionActive: false, allPromotedOutputsImmunePassed: true,
    unresolvedCriticalFailures: outcome.completed.filter((item) => ['COMPROMISED', 'PATHOBIOTIC'].includes(item.health?.failure?.failureClass)).length });
  return { ...outcome, status: lifecycle.stopped ? outcome.status : 'STOP_BLOCKED', lifecycle, stopped: lifecycle.stopped };
}

function preflightHolobiontMission(input = {}) {
  try {
    const context = prepareMission(input);
    context.deadline.close();
    return { ready: true, blockers: [], hostId: input.hostId, missionId: input.missionId,
      capabilities: context.steps.map((step) => step.capability), budget: context.budget };
  } catch (error) {
    return { ready: false, blockers: [error.message], code: error.code || 'HOLOBIONT_PREFLIGHT_INVALID' };
  }
}

async function runHolobiontMission(db, input = {}) {
  const context = prepareMission(input);
  context.usage = { tokens: 0 };
  try {
    context.input.signal.throwIfAborted();
    const opened = await openMissionHost(db, context.input);
    context.input.holobiontId = opened.session.holobiontId;
    const admissions = await admitCandidates(db, context);
    const outcome = admissions.accepted ? await runSteps(db, context) : { status: 'ADMISSION_REJECTED', completed: [] };
    const result = await finishMission(db, context, outcome);
    return { schema: 'genos.holobiont-capability-mission/v1', missionId: input.missionId,
      holobiontId: opened.session.holobiontId, hostId: opened.session.hostId, hostReused: opened.reused,
      persistentHost: input.persistentHost === true, budget: context.budget,
      admissions: admissions.receipts, usage: context.usage, ...result };
  } finally {
    context.deadline.close();
  }
}

module.exports = { openMissionHost, admitMissionSymbiont, runHolobiontMission, preflightHolobiontMission };
