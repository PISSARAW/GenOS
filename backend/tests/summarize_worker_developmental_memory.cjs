'use strict';

// Merge independent process measurements of real worker missions.
const fs = require('node:fs');
const kinds = require('../src/services/agents/workerKindService');

function summarize(paths) {
  const selected = new Map();
  const children = [];
  for (const input of paths) {
    const measurement = JSON.parse(fs.readFileSync(input, 'utf8'));
    for (const result of measurement.results || []) {
      if (result.workerId.endsWith('-d1')) {
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
  const nativeArtifacts = results.filter((result) => result.artifact?.valid && result.nativeCompletedEvent).length;
  const developmental = results.filter((result) => result.episodesPersisted > 0
    && result.lessonsRecalled > 0
    && (result.policyAfterRestart?.riskTolerance !== 0.5
      || result.policyAfterRestart?.evidenceStrictness !== 0.5)).length;
  return { workerTypes: results.length, nativeArtifacts, developmental, children,
    developmentalMemoryVerified: developmental === results.length, results };
}

const paths = process.argv.slice(2).filter((arg) => arg !== '--assert-developmental');
if (!paths.length) throw new Error('Usage: node summarize_worker_developmental_memory.cjs <measurement.json>... [--assert-developmental]');
const summary = summarize(paths);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (process.argv.includes('--assert-developmental') && !summary.developmentalMemoryVerified) process.exitCode = 1;
