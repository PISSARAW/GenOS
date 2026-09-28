#!/usr/bin/env node
'use strict';

const { dispatchTool } = require('../src/services/mcpToolRegistry');

async function main() {
  let request;
  try {
    request = JSON.parse(process.argv[2] || '{}');
  } catch (_) {
    process.stderr.write('MCP dispatch request must be valid JSON.\n');
    process.exitCode = 2;
    return;
  }
  const name = String(request.name || '');
  const { kind, result } = await dispatchTool(name, request.arguments || {});
  if (kind === 'unsupported' || !result?.success) {
    process.stderr.write(JSON.stringify({ kind, result }) + '\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write(JSON.stringify(result.output) + '\n');
}

main().catch((error) => {
  process.stderr.write(`${error.message || 'MCP dispatch failed.'}\n`);
  process.exitCode = 1;
});
