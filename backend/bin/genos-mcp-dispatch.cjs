#!/usr/bin/env node
'use strict';

const { dispatchTool } = require('../src/services/mcpToolRegistry');

async function dispatchRequest(request) {
  const development = require('../src/services/mcpDevelopmentTools');
  const args = request.arguments === undefined ? {} : request.arguments;
  if (!development.isDevelopmentTool(request.name)) return dispatchTool(request.name, args);
  const output = await development.executeDevelopmentTool(request.name, args);
  return { kind: 'development', result: { success: true, output } };
}

async function main() {
  let request;
  try {
    request = JSON.parse(process.argv[2] || '{}');
  } catch (_) {
    process.stderr.write('MCP dispatch request must be valid JSON.\n');
    process.exitCode = 2;
    return;
  }
  request.name = String(request.name || '');
  const { kind, result } = await dispatchRequest(request);
  if (kind === 'unsupported' || !result?.success) {
    process.stderr.write(JSON.stringify({ kind, result }) + '\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write(JSON.stringify(result.output ?? result) + '\n');
}

main().catch((error) => {
  process.stderr.write(`${error.message || 'MCP dispatch failed.'}\n`);
  process.exitCode = 1;
}).finally(() => require('../src/db').closeDatabase());
