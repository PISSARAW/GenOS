'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createManifest } = require('../../src/services/gqwf/manifest');
const { buildManifest } = require('../../src/services/gqwf/executionClosure');
const { sha256 } = require('../../src/services/gqwf/objects');
const metadata = require('../../src/services/gqwf/metadataStore');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { createMessage } = require('../../src/services/gqwfExchange/contract');
const { environmentDigest } = require('../../src/services/gqwfExchange/qualification');

const actor = agentId => ({ agentId, incarnationId: `${agentId}:1`, trustDomain: 'exchange-demo' });
const PRODUCER = actor('producer');
const RECEIVER = actor('receiver');
const SCOPE = { organizationId: 'exchange-demo', projectId: 'two-branches' };
const WORKSPACE = 'exchange-workspace';
const MISSION = 'exchange-mission';
const CONVERSATION = 'exchange-conversation';
const COMMAND = { executable: 'node', arguments: ['verify-candidate.cjs', 'base.json', 'candidate.json'] };
const SCRIPT = "const fs=require('node:fs');const b=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const c=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));if(!Number.isSafeInteger(b.counter)||!Number.isSafeInteger(c.counter)||c.counter<=b.counter)process.exit(1);process.stdout.write('counter increased');\n";
const NODE = { name: 'node', version: process.version, digest: sha256(fs.readFileSync(process.execPath)) };
const POLICY = { policyId: 'native-increase', version: '1', allowedOrigins: ['isolated'], verifierRefs: ['counter-increases'] };

function buildWorld(id, values) {
  const { base, counter, branch } = values;
  const content = { 'base.json': JSON.stringify({ counter: base }), 'candidate.json': JSON.stringify({ counter }),
    'verify-candidate.cjs': SCRIPT, 'branch.txt': branch };
  const blobs = new Map();
  const built = createManifest(Object.entries(content).map(([name, value]) => {
    const bytes = Buffer.from(value); const hash = sha256(bytes); blobs.set(hash, bytes);
    return { path: name, hash, size: bytes.length, mode: 0o644 };
  }));
  const closure = buildManifest({ workspaceId: WORKSPACE, rootHash: built.hash, command: COMMAND,
    runtime: NODE, dependencies: [], environment: [] });
  const closureSerialized = JSON.stringify(closure);
  return { blobs, world: { worldId: `world-${id}`, workspaceId: WORKSPACE,
    origin: { kind: id === 'base' ? 'observed' : 'isolated', sourceRef: `branch:${id}` },
    rootHash: built.hash, manifest: built.manifest, manifestSerialized: built.serialized,
    closureHash: metadata.digest(closureSerialized), closure, closureSerialized } };
}

const WORLDS = { base: buildWorld('base', { base: 0, counter: 0, branch: 'base' }),
  a: buildWorld('a', { base: 0, counter: 1, branch: 'a' }),
  b: buildWorld('b', { base: 0, counter: 2, branch: 'b' }),
  rebased: buildWorld('rebased', { base: 1, counter: 2, branch: 'b' }) };

function query(world) {
  return { scope: SCOPE, missionId: MISSION, conversationId: CONVERSATION,
    worldId: world.worldId, worldDigest: digest(world) };
}

function candidate(id, world, base) {
  const { rootHash: baseHash, generation: baseGeneration } = base;
  return { candidateId: id, worldId: world.worldId, worldDigest: digest(world), rootHash: world.rootHash,
    closureHash: world.closureHash, baseHash, baseGeneration, headName: 'main', environmentDigest: environmentDigest(world),
    predicate: { command: COMMAND, expectedExitCode: 0, expectedOutput: 'counter increased' },
    policy: { policyId: POLICY.policyId, version: POLICY.version }, evidenceRefs: [`producer:${id}`] };
}

function message(type, payload, options = {}) {
  const identity = payload.world?.worldId || payload.worldId || payload.candidate?.candidateId || payload.candidateId;
  const id = options.id || `${options.local ? 'local' : 'remote'}:${identity}:${type}`;
  return createMessage({ messageId: id, operationId: 'exchange-operation', missionId: MISSION,
    conversationId: CONVERSATION, type, sender: PRODUCER, audience: options.local ? PRODUCER : RECEIVER,
    scope: SCOPE, causalRefs: options.causes || [], generations: { incarnation: 1, organization: 1, workspace: 1 },
    authority: { authorityId: 'exchange-authority', generation: 1 }, idempotencyKey: id,
    createdAt: '2026-11-02T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z', payload });
}

function prepare(directory) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'evidence-log.json'), '[]');
}

module.exports = { PRODUCER, RECEIVER, SCOPE, WORKSPACE, MISSION, CONVERSATION, COMMAND,
  SCRIPT, NODE, POLICY, WORLDS, query, candidate, message, prepare };
