#!/usr/bin/env node
'use strict';

const { scopeOf } = require('../src/services/nervous/contract');
const COMMANDS = new Set(['status', 'effects', 'backfill']);

function argumentsOf(argv) {
  const [command, organizationId, projectId, cursor = '0'] = argv;
  if (!COMMANDS.has(command) || argv.length > 4) {
    throw new Error('Usage: node backend/bin/genos-nervous.cjs <status|effects|backfill> <organizationId> <projectId> [afterId]');
  }
  const afterId = Number(cursor);
  if (!Number.isSafeInteger(afterId) || afterId < 0) throw new Error('Invalid backfill cursor');
  return { command, scope: scopeOf({ organizationId, projectId }), afterId };
}

async function inspect(db, request, bridge) {
  if (request.command === 'backfill') return bridge.backfill(db, request);
  const runtime = await bridge.getRuntime(db);
  if (request.command === 'effects') return runtime.store.effects(request.scope);
  return runtime.snapshot(request.scope);
}

async function main(argv) {
  const request = argumentsOf(argv);
  if (process.env.GENOS_NERVOUS_ENABLED !== '1') throw new Error('Set GENOS_NERVOUS_ENABLED=1 explicitly');
  const database = require('../src/db');
  const bridge = require('../src/services/nervous/runtimeBridge');
  try {
    const db = await database.getDatabase();
    console.log(JSON.stringify(await inspect(db, request, bridge), null, 2));
  } finally {
    await bridge.shutdown();
    await database.closeDatabase();
  }
}

if (require.main === module) main(process.argv.slice(2)).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = { argumentsOf, inspect, main };
