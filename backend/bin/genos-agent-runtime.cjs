#!/usr/bin/env node
/**
 * GenOS mission runtime bridge.
 * Reads one framed protobuf (or legacy JSON) mission from stdin, delegates the implementation to Codex CLI,
 * and emits one normalized NDJSON event per meaningful Codex lifecycle event.
 */
const { runSession } = require('./agent-runtime-session.cjs');
const cliHelp = require('./cliHelp.cjs');

if (cliHelp.checkHelp(process.argv, 'genos-agent-runtime.cjs')) return;

let raw = Buffer.alloc(0);
process.stdin.on('data', (chunk) => { raw = Buffer.concat([raw, chunk]); });
process.stdin.on('end', async () => {
  await runSession(raw);
});
