'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function main() {
  const helperPath = pathToFileURL(path.resolve(__dirname,
    '../../mcp/orchestratorPayloadTransport.js')).href;
  const { bridgePayloadTransport } = await import(helperPath);
  const secret = 'resume-secret-that-must-not-be-an-argv-value';
  const payload = { action: 'dispatch_biological', community_id: 'community-1', resume_token: secret };
  const transport = bridgePayloadTransport({ payload, bridge: 'orchestrator.cjs', executor: 'caller_mcp' });
  assert.deepEqual(transport.args, ['orchestrator.cjs', '--payload-stdin']);
  assert.equal(JSON.parse(transport.stdinText).resume_token, secret);
  const normal = bridgePayloadTransport({ payload: { action: 'dispatch_team' },
    bridge: 'orchestrator.cjs', executor: 'caller_mcp' });
  assert.equal(normal.stdinText, undefined);
  const loader = path.resolve(__dirname, '../bin/detachedSpawn.cjs');
  const script = `if (process.argv.some((arg) => arg.startsWith('{'))) process.exit(2);
    process.stdout.write(require(${JSON.stringify(loader)}).loadArgv(process.argv))`;
  const child = spawnSync(process.execPath, ['-e', script, '--', '--payload-stdin'], {
    input: transport.stdinText, encoding: 'utf8', windowsHide: true
  });

  assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout).resume_token, secret);
  const oversized = spawnSync(process.execPath, ['-e', script, '--', '--payload-stdin'], {
    input: 'x'.repeat(1024 * 1024 + 1), encoding: 'utf8', windowsHide: true
  });
  assert.notEqual(oversized.status, 0);
  assert.match(oversized.stderr, /Payload from stdin exceeds 1 MiB/);
  console.log('Orchestrator continuation payload stdin: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
