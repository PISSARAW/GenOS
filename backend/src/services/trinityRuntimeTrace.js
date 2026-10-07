'use strict';
const manifests = require('./trinityRunManifest');
const traces = require('./trinityTraceEvents');
const { digest } = require('./trinityExecutionJournal');
const path = require('node:path');

async function observe(context, event) {
  const scope = context.normalizedMission?.missionScope;
  if (!scope?.trinityExperimentId) return null;
  const key = { missionId: scope.missionId || scope.trinityExperimentId, runId: context.executionRun.id };
  const manifest = await manifests.read(context.db, key);
  if (!manifest) throw failure('TRINITY_RUNTIME_MANIFEST_MISSING');
  assertCorrelation(context, manifest.payload.correlation);
  return traces.observe(context.db, { correlation: manifest.payload.correlation,
    eventId: event.id ? 'runtime-observation:' + key.runId + ':' + event.id : undefined,
    stage: 'supervised_runtime_event', details: { sourceEventId: event.id || null,
      eventType: String(event.eventType || 'unknown'), action: String(event.action || 'unknown'),
      payloadHash: digest(event.payload || event.payloadJson || null),
      qualification: 'supervisor-event-observation', decisionAuthority: 'none' } });
}

function assertCorrelation(context, correlation) {
  const mission = context.normalizedMission;
  if (correlation.missionId !== (mission.missionScope.missionId || mission.missionScope.trinityExperimentId)
    || correlation.runId !== context.executionRun.id) throw failure('TRINITY_WORKER_SCOPE_INVALID');
  if (correlation.workerId !== context.agentId) throw failure('TRINITY_WORKER_SCOPE_INVALID');
  if (correlation.experimentId !== mission.missionScope.trinityExperimentId) throw failure('TRINITY_WORKER_SCOPE_INVALID');
  if (correlation.parentId !== (mission.orchestratorAgentId ?? null)) throw failure('TRINITY_WORKER_SCOPE_INVALID');
  assertOptionalBindings(context, correlation);
}

function assertOptionalBindings(context, correlation) {
  const workspace = context.normalizedMission.workspaceRoot;
  if (workspace && !sameWorkspace(workspace, correlation.workspaceRoot)) throw failure('TRINITY_WORKER_SCOPE_INVALID');
  const tenant = context.dispatchedAgent?.organization_id;
  if (tenant && tenant !== correlation.tenantId) throw failure('TRINITY_WORKER_SCOPE_INVALID');
}

function sameWorkspace(left, right) {
  if (typeof right !== 'string' || !path.isAbsolute(right)) return false;
  if (typeof left !== 'string' || !path.isAbsolute(left)) return false;
  const roots = [path.resolve(left), path.resolve(right)];
  if (process.platform === 'win32') return roots[0].toLowerCase() === roots[1].toLowerCase();
  return roots[0] === roots[1];
}

function failure(code) { return Object.assign(new Error(code), { code }); }
module.exports = { observe, assertCorrelation };
