'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { GqwfExchange } = require('../../src/services/gqwfExchange/exchange');
const { CandidatePromotion } = require('../../src/services/gqwfExchange/promotion');
const { createMessage } = require('../../src/services/gqwfExchange/contract');
const { environmentDigest } = require('../../src/services/gqwfExchange/qualification');
const { createFabric } = require('../../src/services/gqwf');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const closureService = require('../../src/services/gqwf/executionClosure');
const storage = require('../../src/services/gqwf/storage');

const NOW = '2026-11-02T18:00:00.000Z';
const SCOPE = { organizationId: 'promotion-org', projectId: 'promotion-project' };
const ACTOR = { agentId: 'producer', incarnationId: 'producer-1', trustDomain: 'local' };
const AUDIENCE = { agentId: 'receiver', incarnationId: 'receiver-1', trustDomain: 'local' };
const POLICY = { policyId: 'isolated-syntax-check', version: '1', allowedOrigins: ['isolated', 'observed'], verifierRefs: ['native-node-check'] };
const rawHash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const runtimeHash = rawHash(fs.readFileSync(process.execPath));
let sequence = 0;

function message(type, payload, overrides = {}) {
  sequence += 1;
  return createMessage({ messageId: `promotion-message:${sequence}`, idempotencyKey: `promotion-key:${sequence}`,
    operationId: 'promotion-operation', missionId: 'mission-1', conversationId: 'conversation-1',
    type, sender: ACTOR, audience: AUDIENCE, scope: SCOPE, causalRefs: [],
    generations: { incarnation: 1, organization: 1, workspace: 1 }, authority: { authorityId: 'promotion-grant', generation: 1 },
    createdAt: NOW, expiresAt: '2026-11-03T18:00:00.000Z', payload, ...overrides }, { now: NOW });
}

async function registerWorld(fixture, world) {
  let previous = message('OFFER_WORLD', { world });
  await fixture.exchange.apply(previous);
  const bound = { worldId: world.worldId, worldDigest: digest(world) };
  for (const type of ['NEED_OBJECTS', 'VERIFY_WORLD']) {
    const next = message(type, bound, { causalRefs: [previous.messageId] });
    await fixture.exchange.apply(next); previous = next;
  }
}

async function world(fixture, input) {
  const { rootHash, id, origin = 'isolated' } = input;
  const command = { executable: process.execPath, arguments: ['--check', 'candidate.js'] };
  const manifest = await storage.root(fixture.exchange.db, 'workspace-1', rootHash);
  const closure = closureService.buildManifest({ workspaceId: 'workspace-1', rootHash, command,
    runtime: { name: 'node', version: process.version, digest: runtimeHash }, dependencies: [],
    environment: Object.entries(fixture.environment).map(([name, value]) => ({ name, valueHash: rawHash(value) })) });
  const closureSerialized = JSON.stringify(closure);
  const result = { worldId: id, workspaceId: 'workspace-1', origin: { kind: origin, sourceRef: `source:${id}` },
    rootHash, manifest, manifestSerialized: JSON.stringify(manifest), closure,
    closureHash: rawHash(closureSerialized), closureSerialized };
  await registerWorld(fixture, result);
  return result;
}

async function candidateWorld(fixture, input) {
  const view = await fixture.fabric.createView({ workspaceId: 'workspace-1', baseHash: fixture.baseHash });
  await fixture.fabric.writeFile({ workspaceId: 'workspace-1', viewId: view.id,
    path: 'candidate.js', content: input.content, expectedVersion: 0 });
  const sealed = await fixture.fabric.sealView({ workspaceId: 'workspace-1', viewId: view.id, expectedVersion: 1 });
  return world(fixture, { rootHash: sealed.rootHash, id: input.id });
}

function candidate(world, base, id = world.worldId) {
  return { candidateId: id, worldId: world.worldId, worldDigest: digest(world), rootHash: world.rootHash,
    closureHash: world.closureHash, baseHash: base.rootHash, baseGeneration: base.generation, headName: 'main',
    environmentDigest: environmentDigest(world), predicate: { command: world.closure.command, expectedExitCode: 0 },
    policy: { policyId: POLICY.policyId, version: POLICY.version }, evidenceRefs: [] };
}

async function actualProbe(fixture, request) {
  const env = request.world.closure.environment.map(entry => ({ name: entry.name, valueHash: rawHash(fixture.environment[entry.name] || '') }));
  if (digest(env) !== digest(request.world.closure.environment) || request.world.closure.runtime.digest !== runtimeHash) {
    throw new Error('Fixture execution environment changed.');
  }
  const file = request.world.manifest.files.find(entry => entry.path === 'candidate.js');
  const bytes = await fixture.exchange.cas.read(file);
  const directory = fs.mkdtempSync(path.join(fixture.directory, 'verify-'));
  try {
    fs.writeFileSync(path.join(directory, 'candidate.js'), bytes);
    const result = spawnSync(request.candidate.predicate.command.executable,
      request.candidate.predicate.command.arguments, { cwd: directory, env: fixture.environment, timeout: 5000 });
    if (result.error) throw result.error;
    if (result.status !== request.candidate.predicate.expectedExitCode) throw new Error('Independent receiver predicate failed.');
    fixture.probes += 1;
    return { exitCode: result.status, testedRoot: request.world.rootHash, environmentDigest: request.candidate.environmentDigest };
  } finally {
    if (path.dirname(path.resolve(directory)) !== path.resolve(fixture.directory)) throw new Error('Unsafe verification cleanup.');
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function verifyEvidence(fixture, request) {
  const subject = digest([request.candidate, request.world, request.currentHead, request.policy]);
  if (request.stage === 'REQUEST_EVIDENCE') fixture.evidence.set(subject, await actualProbe(fixture, request));
  if (!fixture.evidence.has(subject)) throw new Error('No independent evidence applies to this exact candidate/base/policy.');
  return { status: 'validated', requestDigest: digest(request), receiptDigest: digest(fixture.evidence.get(subject)), verifierRef: 'native-node-check' };
}

async function setup(directory, overrides = {}) {
  fs.mkdirSync(directory, { recursive: true });
  const workspace = path.join(directory, 'workspace'); fs.mkdirSync(workspace);
  fs.writeFileSync(path.join(workspace, 'candidate.js'), 'module.exports = 1;\n');
  const exchange = new GqwfExchange({ workspaceRoot: workspace, dbPath: path.join(directory, 'exchange.sqlite'),
    authorize: async () => true, clock: () => NOW });
  await exchange.ready; await exchange.assertSafeCas();
  await exchange.db.run('INSERT INTO workspaces(id,path,organization_id,project_id) VALUES (?,?,?,?)',
    'workspace-1', workspace, SCOPE.organizationId, SCOPE.projectId);
  const fabric = createFabric(exchange.db);
  const base = await fabric.importBase({ workspaceId: 'workspace-1' });
  const environment = Object.fromEntries(['SystemRoot', 'WINDIR'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  environment.NODE_OPTIONS = '';
  const fixture = { directory, workspace, exchange, fabric, baseHash: base.rootHash, probes: 0, evidence: new Map(), environment };
  fixture.promotion = new CandidatePromotion({ db: exchange.db, workspaceId: 'workspace-1', policy: POLICY,
    authorize: async () => true, authorizePromotion: async () => true,
    verifiedWorld: query => exchange.verifiedWorld(query), assertSafeCas: () => exchange.assertSafeCas(),
    verifyEvidence: request => verifyEvidence(fixture, request), clock: () => NOW, ...overrides });
  fixture.baseWorld = await world(fixture, { rootHash: base.rootHash, id: 'base-world', origin: 'observed' });
  await fixture.promotion.initializeHead({ scope: SCOPE, name: 'main', rootHash: base.rootHash });
  fixture.close = () => exchange.close();
  return fixture;
}

async function offer(fixture, value, overrides = {}) {
  const envelope = message('OFFER_CANDIDATE', { candidate: value }, overrides);
  await fixture.promotion.apply(envelope);
  return envelope;
}

async function advance(fixture, value, step) {
  const { previous, type } = step;
  const envelope = message(type, { candidateId: value.candidateId, candidateDigest: digest(value) },
    { causalRefs: [previous.messageId] });
  const result = await fixture.promotion.apply(envelope);
  return { envelope, result };
}

async function prepare(fixture, value) {
  let previous = await offer(fixture, value);
  for (const type of ['REQUEST_EVIDENCE', 'PREPARE_PROMOTION']) previous = (await advance(fixture, value, { previous, type })).envelope;
  return previous;
}

module.exports = { NOW, SCOPE, ACTOR, AUDIENCE, POLICY, message, setup, candidateWorld, candidate, offer, advance, prepare };
