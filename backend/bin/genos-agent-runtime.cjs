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
const MAX_STDIN_BYTES = 1024 * 1024;
let stdinTooLarge = false;
process.stdin.on('data', (chunk) => {
  if (stdinTooLarge) return;
  if (raw.length + chunk.length > MAX_STDIN_BYTES) {
    stdinTooLarge = true;
    console.error(`Mission stdin exceeds ${MAX_STDIN_BYTES}-byte limit.`);
    process.exitCode = 1;
    try { process.stdin.destroy(); } catch (_) {}
    return;
  }
  raw = Buffer.concat([raw, chunk]);
});
process.stdin.on('end', async () => {
  if (stdinTooLarge) return;
  await runSession(raw);
});
