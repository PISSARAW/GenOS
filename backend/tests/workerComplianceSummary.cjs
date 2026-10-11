'use strict';

const { KINDS } = require('../src/services/agents/workerKindService');

function verifiedResult(entry) {
  if (!entry || !Object.hasOwn(KINDS, entry.kind)) return false;
  const required = ['passed', 'persistedContract', 'parentBound', 'runtimeStarted',
    'executionRunBound', 'artifactValidated',
    'sourceEvidenceValidated', 'refusalsValidated'];
  const artifact = KINDS[entry.kind]?.[1];
  return [required.every((field) => entry[field] === true),
    ['runId', 'workerId'].every((field) => typeof entry[field] === 'string' && entry[field].length > 0),
    entry.status === 'completed', entry.terminalEvent === 'AGENT_COMPLETED',
    entry.outcome === 'success',
    entry.expectedArtifact === artifact, entry.artifact === artifact,
    entry.nativeExecution === true ? entry.oracleAccepted === true : entry.oracleAccepted === null,
    !entry.errorCode, !entry.error].every(Boolean);
}

function completeKindSet(results, kinds) {
  const expected = new Set(kinds);
  const selected = new Set(results.map((entry) => entry.kind));
  return results.length === kinds.length && expected.size === kinds.length
    && selected.size === kinds.length && results.every((entry) => expected.has(entry.kind))
    && new Set(results.map((entry) => entry.runId)).size === 1;
}

function summarizeCompliance(results, kinds) {
  const executed = results.filter(verifiedResult).length;
  const unavailable = results.filter((entry) => entry.errorCode === 'WORKER_EXECUTOR_UNAVAILABLE').length;
  const accepted = completeKindSet(results, kinds) && executed === kinds.length;
  return { executed, unavailable, failed: results.length - executed, accepted };
}

function verifiedPerception(entry) {
  if (!entry || !Object.hasOwn(KINDS, entry.kind)) return false;
  const observation = entry.perception;
  if (!observation) return false;
  return [typeof entry.runId === 'string' && entry.runId.length > 0,
    entry.runtimeStarted === true, observation.observerAvailable === true,
    observation.observedCount >= 2, observation.telemetryCount >= 2,
    observation.distinctDigests >= 2, observation.planRevision >= 2,
    observation.runBound === true, observation.executionRunBound === true,
    observation.runtimeSettled === true].every(Boolean);
}

function summarizePerception(results, kinds) {
  const observed = results.filter(verifiedPerception).length;
  return { observed, failed: results.length - observed,
    accepted: completeKindSet(results, kinds) && observed === kinds.length };
}

module.exports = { verifiedResult, summarizeCompliance, verifiedPerception, summarizePerception };
