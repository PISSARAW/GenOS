'use strict';

// Merge independent process measurements of real worker missions.
const fs = require('node:fs');
const kinds = require('../src/services/agents/workerKindService');

function selectResults(paths) {
  const selected = new Map();
  const children = [];
  for (const input of paths) {
    const measurement = JSON.parse(fs.readFileSync(input, 'utf8'));
    for (const result of measurement.results || []) {
      if (/-d\d+$/.test(result.workerId)) {
        children.push({ runId: measurement.runId, ...result });
        continue;
      }
      selected.set(result.kind, { runId: measurement.runId, ...result });
    }
  }
  const results = Object.keys(kinds.KINDS).map((kind) => {
    const result = selected.get(kind);
    return result || { kind, missing: true };
  });
  return { results, children };
}

function hasDurableRecall(result) {
  const policy = result.policyAfterRestart;
  const restartedPolicyChanged = policy?.riskTolerance !== 0.5
    || policy?.evidenceStrictness !== 0.5;
  const persisted = result.episodesPersisted > 0 && result.lessonsPersisted > 0;
  const recalled = result.missionRecall?.lessonCount > 0 && result.lessonsRecalled > 0;
  return result.runsObserved >= 3 && persisted && recalled
    && result.missionPolicyChanged === true && restartedPolicyChanged;
}

function hasDevelopmentalDecision(result) {
  return result.artifact?.valid && result.nativeCompletedEvent
    && hasDurableRecall(result) && result.decisionChanged === true;
}

function summarize(paths) {
  const { results, children } = selectResults(paths);
  const artifactsValidated = results.filter((result) => result.artifact?.valid).length;
  const nativeArtifacts = results.filter((result) => result.artifact?.valid && result.nativeCompletedEvent).length;
  const durableRecall = results.filter(hasDurableRecall).length;
  const developmental = results.filter(hasDevelopmentalDecision).length;
  return { workerTypes: results.length, artifactsValidated, nativeArtifacts, durableRecall,
    developmental, children,
    developmentalMemoryVerified: developmental === results.length, results };
}

const paths = process.argv.slice(2).filter((arg) => arg !== '--assert-developmental');
if (!paths.length) throw new Error('Usage: node summarize_worker_developmental_memory.cjs <measurement.json>... [--assert-developmental]');
const summary = summarize(paths);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (process.argv.includes('--assert-developmental') && !summary.developmentalMemoryVerified) process.exitCode = 1;
