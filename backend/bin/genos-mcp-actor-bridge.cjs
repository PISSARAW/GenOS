#!/usr/bin/env node
'use strict';

const actor = require('../src/services/mcpActorCapability');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function main() {
  const [phase, toolName, actionId, success, outputHash] = process.argv.slice(2);
  const token = process.env.GENOS_MCP_ACTOR_TOKEN;
  const workspaceRoot = process.env.GENOS_WORKSPACE_ROOT;
  if (!token || !workspaceRoot || !process.env.GENOS_DB_PATH) {
    throw new Error('MCP_ACTOR_CONTEXT_REQUIRED');
  }
  const db = await open({ filename: process.env.GENOS_DB_PATH, driver: sqlite3.Database });
  try {
    await db.exec('PRAGMA busy_timeout = 30000');
    if (phase === 'begin') {
      process.stdout.write(JSON.stringify(await actor.begin(db, { token, workspaceRoot, toolName })));
    } else if (phase === 'finish') {
      const settled = await actor.finish(db, { token, actionId,
        success: success === 'true', outputHash });
      if (!settled.matched) throw new Error('MCP_ACTOR_RECEIPT_MISMATCH');
      process.stdout.write(JSON.stringify(settled));
    } else throw new Error('MCP_ACTOR_PHASE_INVALID');
  } finally { await db.close(); }
}

main().catch(error => {
  process.stderr.write(`${error.code || error.message}\n`);
  process.exitCode = 1;
});
