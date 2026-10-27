'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LEDGER_PATH = process.env.OMEGA_TEMPORAL_LEDGER;
let activityQueue = Promise.resolve();

function readLedger() {
  if (!LEDGER_PATH || !fs.existsSync(LEDGER_PATH)) return { completed: {}, effects: {}, failed: {} };
  return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
}

function persistLedger(ledger) {
  const temporary = `${LEDGER_PATH}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(temporary, JSON.stringify(ledger));
  fs.renameSync(temporary, LEDGER_PATH);
}

function applyTask(input) {
  const ledger = readLedger();
  const taskKey = `${input.scope}/${input.taskId}`;
  ledger.completed[taskKey] = true;
  if (input.effectKey) ledger.effects[`${input.scope}/${input.effectKey}`] = true;
  const fail = input.failOnce && !ledger.failed[taskKey];
  if (fail) ledger.failed[taskKey] = true;
  persistLedger(ledger);
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
