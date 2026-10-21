import assert from 'node:assert/strict';
import { bridgePayloadTransport } from './orchestratorPayloadTransport.js';

const token = 'private-continuation-token';
const continuation = bridgePayloadTransport({ bridge: 'genos-orchestrate.cjs',
  executor: 'caller_mcp', payload: { action: 'dispatch_biological',
    community_id: 'community-1', resume_token: token } });
assert.deepEqual(continuation.args, ['genos-orchestrate.cjs', '--payload-stdin']);
assert.equal(JSON.parse(continuation.stdinText).resume_token, token);
assert.equal(continuation.args.some((arg) => arg.includes(token)), false);

const ordinary = bridgePayloadTransport({ bridge: 'genos-orchestrate.cjs',
  executor: 'caller_mcp', payload: { action: 'dispatch_team' } });
assert.deepEqual(ordinary.args, ['genos-orchestrate.cjs', '--payload-stdin']);
assert.equal(JSON.parse(ordinary.stdinText).action, 'dispatch_team');
const emptyCommunity = bridgePayloadTransport({ bridge: 'genos-orchestrate.cjs',
  executor: 'caller_mcp', payload: { action: 'dispatch_biological', community_id: '', resume_token: token } });
assert.deepEqual(emptyCommunity.args, ['genos-orchestrate.cjs', '--payload-stdin']);
assert.equal(emptyCommunity.args.some((arg) => arg.includes(token)), false);
console.log('Orchestrator payload transport: PASS');
