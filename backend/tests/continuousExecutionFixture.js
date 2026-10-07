'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const observer = require('../src/services/continuousExecution/observer');
const { migrateAdaptiveState } = require('../src/db/migrations/migrateAdaptiveState');

async function fixture(options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-continuous-'));
  fs.writeFileSync(path.join(directory, 'input.txt'), 'initial assumption');
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  await migrateAdaptiveState(db);
  const continuousObserver = await observer.create({ db, agentId: 'worker', runId: 'run-1', workspaceRoot: directory,
    options: { mode: 'control', files: ['input.txt'], ...options } });
  const events = [];
  const ctx = { db, agentId: 'worker', executionRun: { id: 'run-1' }, normalizedMission: { agentId: 'worker', orchestratorAgentId: 'parent' },
    continuousObserver, state: { missionDomainState: { unverified: true, domainVerdict: 'unverified', hasDomainFailure: false },
      executionQueue: Promise.resolve(), terminalEventSeen: false },
    emitTracked: (...args) => events.push(trackedEvent(args)) };
  return { directory, db, ctx, events, change: (value) => fs.writeFileSync(path.join(directory, 'input.txt'), value),
    close: async () => {
      await observer.close(continuousObserver);
      await db.close();
      if (!path.basename(directory).startsWith('genos-continuous-')) throw new Error('Unexpected fixture directory.');
      fs.rmSync(directory, { recursive: true, force: true });
    } };
}

function trackedEvent([eventType, action, detail, payload, severity]) {
  return { eventType, action, detail, payload, severity };
}

function evidence(patch = {}) {
  return { eventType: 'EVIDENCE_REPORT', payload: { executionRunId: 'run-1', evidenceReport: {
    outcome: 'success', claims: [{ statement: 'The result is valid.', evidence: ['executed probe'] }]
  }, ...patch } };
}

module.exports = { fixture, evidence };
