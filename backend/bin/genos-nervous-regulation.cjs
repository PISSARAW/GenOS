#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { scopeKey, identifier } = require('../src/services/nervous/contract');
const bridge = require('../src/services/nervous/runtimeBridge');
const policies = require('../src/services/nervous/regulationPolicy');
const { RegulationJournal } = require('../src/services/nervous/regulationJournal');

function argumentsOf(args) {
  const [command, managerId, inputFile] = args;
  if (!['sample','episodes','calibrate','enroll'].includes(command) || !managerId) {
    throw new Error('Usage: genos-nervous-regulation.cjs sample|episodes|calibrate|enroll MANAGER [SIGNED_POLICY.json]');
  }
  identifier(managerId, 'managerId');
  const required = command === 'enroll' ? 3 : 2;
  if (args.length !== required) throw new Error('Invalid GNS regulation arguments');
  return { command, managerId, inputFile };
}

async function execute(db, args) {
  const { command, managerId, inputFile } = argumentsOf(args);
  if (command === 'enroll') return enroll(db, { managerId, inputFile });
  const scope = await policies.managerScope(db, managerId);
  if (command === 'sample') return require('../src/services/nervous/regulationRuntime').sampleManager(db, managerId);
  const runtime = await bridge.getRuntime(db);
  const journal = await new RegulationJournal(runtime.store).initialize();
  const episodes = await journal.episodes(scope, managerId);
  if (command === 'episodes') return { scope, episodes };
  const policy = await policies.current(db, managerId);
  if (!policy) throw new Error('No current signed GNS policy');
  return require('../src/services/nervous/regulationForecast').calibrate(policy, episodes);
}

async function enroll(db, input) {
  if (!input.inputFile || fs.statSync(input.inputFile).size > 65536) throw new Error('Signed policy JSON required (max 64 KiB)');
  const policy = JSON.parse(fs.readFileSync(input.inputFile, 'utf8'));
  if (policy.managerId !== input.managerId) throw new Error('GNS_MANAGER_MISMATCH');
  const actual = await policies.managerScope(db, input.managerId);
  if (scopeKey(actual) !== scopeKey(policy.scope)) throw new Error('SCOPE_MISMATCH');
  return policies.enroll(db, policy);
}

async function main() {
  const args = process.argv.slice(2);
  argumentsOf(args);
  const { getDatabase, closeDatabase } = require('../src/db');
  try { console.log(JSON.stringify(await execute(await getDatabase(), args), null, 2)); }
  finally { await bridge.shutdown(); await closeDatabase(); }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { execute, argumentsOf };
