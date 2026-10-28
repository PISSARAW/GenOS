'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

const LEDGER_PATH = process.env.OMEGA_TEMPORAL_LEDGER;
const LEDGER_DIRECTORY = LEDGER_PATH ? `${LEDGER_PATH}.scopes` : null;
let activityQueue = Promise.resolve();

function ledgerFile(scope) {
  if (!LEDGER_DIRECTORY) throw new Error('OMEGA_TEMPORAL_LEDGER is required.');
  if (typeof scope !== 'string' || !scope) throw new Error('Activity scope is required.');
  const digest = crypto.createHash('sha256').update(scope).digest('hex');
  return path.join(LEDGER_DIRECTORY, `${digest}.json`);
}

function readLedger(scope) {
  const filename = ledgerFile(scope);
  if (!fs.existsSync(filename)) return { completed: {}, effects: {}, failed: {} };
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function persistLedger(scope, ledger) {
  const filename = ledgerFile(scope);
  const temporary = `${filename}.${process.pid}.tmp`;
  fs.mkdirSync(LEDGER_DIRECTORY, { recursive: true });
  fs.writeFileSync(temporary, JSON.stringify(ledger));
  fs.renameSync(temporary, filename);
}

function applyTask(input) {
  const ledger = readLedger(input.scope);
  const taskKey = `${input.scope}/${input.taskId}`;
  ledger.completed[taskKey] = true;
  if (input.effectKey) ledger.effects[`${input.scope}/${input.effectKey}`] = true;
  const fail = input.failOnce && !ledger.failed[taskKey];
  if (fail) ledger.failed[taskKey] = true;
  persistLedger(input.scope, ledger);
  if (fail) throw new Error('Injected crash after durable effect.');
  return { taskId: input.taskId };
}

async function completeTask(input) {
  let release;
  const previous = activityQueue;
  activityQueue = new Promise((resolve) => { release = resolve; });
  await previous;
  try {
    return applyTask(input);
  } finally {
    release();
  }
}

exports.completeTask = completeTask;
