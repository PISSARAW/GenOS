'use strict';

const { createManifest } = require('../../src/services/gqwf/manifest');
const executionClosure = require('../../src/services/gqwf/executionClosure');
const metadata = require('../../src/services/gqwf/metadataStore');
const { sha256 } = require('../../src/services/gqwf/objects');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { createMessage } = require('../../src/services/gqwfExchange/contract');

const NOW = '2026-11-02T10:00:00.000Z';
const actor = (agentId) => ({ agentId, incarnationId: `${agentId}-1`, trustDomain: 'local' });
const bytes = (counter = 1) => Buffer.from(`${JSON.stringify({ counter })}\n`);
const manifest = (counter = 1) => createManifest([{ path: 'counter.json', hash: sha256(bytes(counter)), size: bytes(counter).length, mode: 0o600 }]);

function world(overrides = {}) {
  const built = manifest();
  const workspaceId = 'workspace-1';
  const closure = executionClosure.buildManifest({ workspaceId, rootHash: built.hash,
    command: { executable: 'node', arguments: ['receiver-counter-check.cjs'] },
    runtime: { name: 'node', version: process.version, digest: sha256(Buffer.from(process.version)) },
    dependencies: [], environment: [{ name: 'NODE_ENV', valueHash: sha256(Buffer.from('test')) }] });
  const closureSerialized = JSON.stringify(closure);
  return { worldId: 'world-1', workspaceId, origin: { kind: 'isolated', sourceRef: 'counterfactual-branch-1' },
    rootHash: built.hash, manifest: built.manifest, manifestSerialized: built.serialized,
    closureHash: metadata.digest(closureSerialized), closure, closureSerialized, ...overrides };
}

function candidate(overrides = {}) {
  const value = world();
  const closure = value.closure;
  return { candidateId: 'candidate-1', worldId: value.worldId, worldDigest: digest(value),
    rootHash: value.rootHash, closureHash: value.closureHash, baseHash: manifest(0).hash,
    environmentDigest: digest({ command: closure.command, runtime: closure.runtime,
      dependencies: closure.dependencies, environment: closure.environment }),
    headName: 'main', baseGeneration: 0,
    predicate: { command: closure.command, expectedExitCode: 0 },
    policy: { policyId: 'policy-1', version: '1' }, evidenceRefs: ['counter-check-result-1'], ...overrides };
}

function policy(overrides = {}) {
  return { policyId: 'policy-1', version: '1', allowedOrigins: ['isolated'], verifierRefs: ['receiver-counter-verifier'], ...overrides };
}

function payload(type) {
  const value = world();
  const worldQuery = { worldId: value.worldId, worldDigest: digest(value) };
  if (type === 'OFFER_WORLD') return { world: value };
  if (['NEED_OBJECTS', 'VERIFY_WORLD'].includes(type)) return worldQuery;
  if (type === 'TRANSFER') return { ...worldQuery, hash: sha256(bytes()), bytesBase64: bytes().toString('base64') };
  if (type === 'OFFER_CANDIDATE') return { candidate: candidate() };
  const query = { candidateId: 'candidate-1', candidateDigest: digest(candidate()) };
  if (['REJECT', 'ABORT'].includes(type)) return { ...query, reason: 'Explicit rejection reason' };
  return query;
}

function message(type = 'OFFER_WORLD', overrides = {}) {
  return createMessage({ messageId: `message-${type.toLowerCase()}`, operationId: 'operation-1', missionId: 'mission-1',
    conversationId: 'conversation-1', type, sender: actor('sender'), audience: actor('receiver'),
    scope: { organizationId: 'organization-1', projectId: 'project-1' }, causalRefs: [],
    generations: { incarnation: 1, organization: 1, workspace: 1 }, authority: { authorityId: 'authority-1', generation: 1 },
    idempotencyKey: `key-${type.toLowerCase()}`, createdAt: NOW, expiresAt: '2026-11-02T10:05:00.000Z',
    payload: payload(type), ...overrides }, { now: NOW });
}

module.exports = { NOW, actor, bytes, manifest, world, candidate, policy, payload, message };
