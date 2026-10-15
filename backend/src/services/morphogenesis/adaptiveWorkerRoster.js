'use strict';

const executorRegistry = require('../agents/workerExecutorRegistry');
const workerKinds = require('../agents/workerKindService');

const MAX_PHASES = 10;
const MAX_METHODS_PER_PHASE = 20;
const MAX_ASSIGNMENTS = 100;

function boundedList(value, limit) {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

function assignmentMethod(assignment) {
  const nested = assignment.workerAssignment?.methodContract?.methodId;
  const worker = assignment.workerContract?.mission?.methodContract?.methodId;
  return assignment.methodContract?.methodId || nested || worker || assignment.methodId || null;
}

function normalizedAssignment(assignment, index) {
  if (typeof assignment === 'string') return { workerKind: assignment, methodId: null, assignmentIndex: index };
  if (!assignment || typeof assignment !== 'object') return null;
  return {
    workerKind: assignment.workerKind || assignment.kind || null,
    methodId: assignmentMethod(assignment),
    assignmentId: assignment.workerId || assignment.agentId || assignment.id || null,
    assignmentIndex: index
  };
}

function assignmentInventory(input) {
  return boundedList(input.workerAssignments, MAX_ASSIGNMENTS)
    .map(normalizedAssignment).filter(Boolean);
}

function catalogByMethod() {
  const catalog = new Map();
  for (const entry of executorRegistry.executorCatalog()) {
    for (const methodId of entry.methods) {
      if (!catalog.has(methodId)) catalog.set(methodId, []);
      catalog.get(methodId).push(entry.kind);
    }
  }
  return catalog;
}

function methodDescriptor(value) {
  if (typeof value === 'string') return { version: 1, methodId: value };
  if (!value || typeof value !== 'object') return null;
  return { ...value, version: value.version || 1 };
}

function compatibleKind(kind, method, availableCapabilities) {
  try {
    workerKinds.assertMethodCompatibility(kind, method);
    const required = workerKinds.requiredMethodCapabilities(method);
    const missing = availableCapabilities === null ? []
      : required.filter(capability => !availableCapabilities.has(capability));
    return { methodCompatible: true, requiredCapabilities: required, missingCapabilities: missing,
      capabilitiesKnown: availableCapabilities !== null };
  } catch (error) {
    return { methodCompatible: false, requiredCapabilities: [], missingCapabilities: [],
      reason: error.code || error.message, capabilitiesKnown: availableCapabilities !== null };
  }
}

function daemonGate(kind, input) {
  if (kind !== 'resident_daemon') return { allowed: true, status: 'not_required' };
  if (input.daemonAllowed === true) return { allowed: true, status: 'explicitly_allowed' };
  if (input.daemonAllowed === false) return { allowed: false, status: 'explicitly_disabled' };
  return { allowed: false, status: 'authorization_missing' };
}

function runtimeObservation(assignmentId, snapshot, now = Date.now()) {
  if (!assignmentId || !snapshot || !Number.isFinite(snapshot.observedAt)
    || now - snapshot.observedAt > 30000 || now < snapshot.observedAt) {
    return { status: 'unknown', reason: 'fresh_instance_observation_missing' };
  }
  const worker = (snapshot.workers || []).find(item => item.instanceId === assignmentId);
  return worker ? { status: worker.status, reason: worker.reason, observedAt: snapshot.observedAt }
    : { status: 'unknown', reason: 'instance_not_in_snapshot' };
}

function matchingAssignment(assignments, kind, methodId) {
  const matchingKind = assignments.filter(item => item.workerKind === kind);
  const configured = matchingKind.find(item => item.methodId === methodId);
  if (configured) return { assignment: configured, status: 'already_configured' };
  const bindable = matchingKind.find(item => !item.methodId);
  if (bindable) return { assignment: bindable, status: 'bindable' };
  return matchingKind.length ? { assignment: matchingKind[0], status: 'method_conflict' }
    : { assignment: null, status: 'not_assigned' };
}

function optionReasons(options) {
  const { compatibility, missing, assignmentMatch, daemon } = options;
  const reasons = [];
  if (!compatibility.methodCompatible) reasons.push(compatibility.reason);
  if (!compatibility.capabilitiesKnown) reasons.push('capability inventory unavailable');
  if (missing.length) reasons.push(`missing capabilities: ${missing.join(', ')}`);
  if (assignmentMatch.status === 'not_assigned') reasons.push('matching worker assignment is absent');
  if (assignmentMatch.status === 'method_conflict') {
    reasons.push(`assigned worker has a different method: ${assignmentMatch.assignment.methodId}`);
  }
  if (!daemon.allowed) reasons.push(`daemon ${daemon.status.replaceAll('_', ' ')}`);
  return reasons;
}

function runtimeReasons(runtime) {
  if (runtime.status === 'unknown') return ['runtime availability unknown'];
  if (runtime.status === 'busy' || runtime.status === 'unavailable') {
    return [`runtime instance ${runtime.status}: ${runtime.reason}`];
  }
  return [];
}

function retainOption(option) {
  const { compatibility, missing, assignmentMatch, daemon, runtime } = option;
  const contractFits = compatibility.methodCompatible && compatibility.capabilitiesKnown && missing.length === 0;
  const assignmentFits = assignmentMatch.status !== 'method_conflict';
  const runtimeAllows = !['busy', 'unavailable'].includes(runtime.status);
  return Boolean(contractFits && assignmentMatch.assignment && assignmentFits && daemon.allowed && runtimeAllows);
}

function optionFor(kind, method, context) {
  const compatibility = compatibleKind(kind, method, context.capabilities);
  const daemon = daemonGate(kind, context.input);
  const assignmentMatch = matchingAssignment(context.assignments, kind, method.methodId);
  const assignment = assignmentMatch.assignment;
  const runtime = runtimeObservation(assignment?.assignmentId, context.input.runtimeSnapshot);
  const missing = compatibility.missingCapabilities;
  const retained = retainOption({ compatibility, missing, assignmentMatch, daemon, runtime });
  const alreadyConfigured = retained && assignmentMatch.status === 'already_configured';
  const bindable = retained && assignmentMatch.status === 'bindable';
  return { workerKind: kind, methodId: method.methodId, nativeExecutor: true,
    methodCompatible: compatibility.methodCompatible, requiredCapabilities: compatibility.requiredCapabilities,
    missingCapabilities: missing, capabilitiesKnown: compatibility.capabilitiesKnown,
    eligibleForAttachment: bindable, alreadyConfigured, bindable, assignmentStatus: assignmentMatch.status,
    daemonStatus: daemon.status, assignmentIndex: assignment?.assignmentIndex ?? null,
    assignmentId: assignment?.assignmentId || null, runtimeStatus: runtime.status,
    runtimeReason: runtime.reason, runtimeObservedAt: runtime.observedAt || null, retained,
    reasons: [...optionReasons({ compatibility, missing, assignmentMatch, daemon }), ...runtimeReasons(runtime)] };
}

function optionsForMethod(methodValue, context) {
  const method = methodDescriptor(methodValue);
  if (!method || typeof method.methodId !== 'string') return [];
  const kinds = context.catalog.get(method.methodId) || [];
  return kinds.map(kind => optionFor(kind, method, context));
}

function phaseResult(phase, context) {
  const methods = boundedList(phase.methods, MAX_METHODS_PER_PHASE);
  const options = methods.flatMap(method => optionsForMethod(method, context));
  return { id: typeof phase.id === 'string' ? phase.id : 'unnamed', requested: phase.requested === true,
    options, retained: options.filter(option => option.retained),
    daemonStatus: options.some(option => option.workerKind === 'resident_daemon')
      ? options.find(option => option.workerKind === 'resident_daemon').daemonStatus : 'not_targeted' };
}

function buildAdaptiveWorkerRoster(input = {}) {
  const assignments = assignmentInventory(input);
  const capabilities = Array.isArray(input.availableCapabilities)
    ? new Set(input.availableCapabilities.filter(item => typeof item === 'string')) : null;
  const context = { input, assignments, capabilities, catalog: catalogByMethod() };
  const phases = boundedList(input.phases, MAX_PHASES).filter(phase => phase && typeof phase === 'object')
    .map(phase => phaseResult(phase, context));
  return { schemaVersion: 1, kind: 'adaptive_worker_roster_advisory', phases,
    executionAuthorized: false, daemonAuthorization: input.daemonAllowed === true ? 'explicitly_allowed'
      : input.daemonAllowed === false ? 'explicitly_disabled' : 'not_supplied' };
}

module.exports = { MAX_PHASES, MAX_METHODS_PER_PHASE, MAX_ASSIGNMENTS, buildAdaptiveWorkerRoster };
