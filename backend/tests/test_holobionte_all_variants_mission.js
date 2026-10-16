'use strict';

if (!process.env.GENOS_DB_PATH) {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  process.env.GENOS_DB_PATH = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'genos-holobionte-all-variants-')), 'fallback.db');
}

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const variants = require('../src/services/holobionte/variants');
const maturity = require('../src/services/holobionte/variants/variantMaturityService');
const controller = require('../src/services/holobionte/variants/variantRuntimeController');
const catalog = require('../src/services/morphogenesis/registry/variantCatalog');
const { runVariantMission } = require('../src/services/holobionte/variants/variantMissionExecutor');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const { migrateHolobiontContracts } = require('../src/db/migrations/migrateHolobiontContracts');
const { migrateHolobiontMemory } = require('../src/db/migrations/migrateHolobiontMemory');
const { migrateHolobiontLedger } = require('../src/db/migrations/migrateHolobiontLedger');
const { migrateHolobiontImmunePlane } = require('../src/db/migrations/migrateHolobiontImmunePlane');
const { migrateHolobiontVariantEvents } = require('../src/db/migrations/migrateHolobiontVariantEvents');
const store = require('../src/services/holobionte/holobiontStore');
const snapshotService = require('../src/services/topologySnapshotService');
const adapter = require('../src/services/topologySnapshots/holobionte');

snapshotService.registerAdapter('holobionte', adapter);

const FIT = { capabilities: ['stable-core', 'diversity', 'cloud-core', 'edge-symbionts',
  'cloud-proxy', 'persistent-memory', 'verified-trials', 'tool-sandbox', 'edge-sync', 'provenance-verification'],
localEngineAvailable: true, immunePlaneAvailable: true, successionAvailable: true };

const BUDGET = { tokens: 1000, costUsd: 1, latencyMs: 60000, events: 10 };

function edgeLease() {
  return { leaseId: 'lease-1', deviceId: 'edge-1', capabilities: ['camera'],
    expiresAt: new Date(Date.now() + 60000).toISOString() };
}

function toolManifest() {
  return { name: 'calculator', version: '1.0', permissions: ['compute'],
    inputSchema: { type: 'object', properties: { a: { type: 'number' } }, required: ['a'] },
    outputSchema: { type: 'object', properties: { result: { type: 'number' } } } };
}

const OPERATION_BUILDERS = {
  organelle: () => ({ operation: 'assessOrganelle',
    runtimeInput: { dependencyGraph: { nodes: [{ id: 'core', core: true }, { id: 'leaf' }],
      edges: [{ source: 'leaf', target: 'core' }] }, evidenceRefs: ['graph:mission'] } }),
  'adaptive-microbiome': () => ({ operation: 'assessEcology',
    runtimeInput: { diversity: 3, diversityFloor: 2,
      fitnessHistory: [{ score: 0.7, evidenceRefs: ['fit:1'] }, { score: 0.75, evidenceRefs: ['fit:2'] }] } }),
  'immune-critical': () => ({ operation: 'reviewImmuneThreat',
    runtimeInput: { threatModels: [{ id: 'tm', riskScore: 0.2, indicators: ['known'], evidenceRefs: ['tm:1'] }],
      dangerSignals: ['known'], independentVerifierIds: ['v1', 'v2'],
      verifyThreatModel: () => true, symbiontId: 'symbiont-1', resultHash: 'sha256:mission' } }),
  'local-first': () => ({ operation: 'planPlacement',
    runtimeInput: { availableEngines: ['local'], dataClasses: ['PUBLIC'] } }),
  regenerative: () => ({ operation: 'planRegeneration',
    runtimeInput: { damageScore: 0.2, evidenceRefs: ['damage:mission'] } }),
  'cloud-core/edge-symbionts': () => ({ operation: 'planPlacement',
    runtimeInput: { variantId: 'cloud-core/edge-symbionts', availableEngines: ['cloud'],
      edgeConnected: true, edgeLease: edgeLease(), requiredEdgeCapability: 'camera', verifyEdgeLease: () => true } }),
  'edge-core/cloud-symbionts': () => ({ operation: 'planPlacement',
    runtimeInput: { variantId: 'edge-core/cloud-symbionts', availableEngines: ['local'] } }),
  'memory-rich': () => ({ operation: 'planMemory',
    runtimeInput: { memories: [{ id: 'mem-1', conceptKey: 'concept', value: 'fact',
      fitness: 0.5, evidenceRefs: ['mem:mission'] }] } }),
  'competitive-partner': () => ({ operation: 'selectCompetitivePartner',
    runtimeInput: { budget: { tokens: 1000 }, protectedGroups: ['protected'],
      candidates: [{ id: 'cand-a', score: 0.9, diversityGroup: 'protected',
        budget: { tokens: 1000 }, evidenceRefs: ['trial:a'] },
      { id: 'cand-b', score: 0.7, diversityGroup: 'protected',
        budget: { tokens: 1000 }, evidenceRefs: ['trial:b'] }], verifyTrial: () => true } }),
  procedural: () => ({ operation: 'planRecruitment',
    runtimeInput: { requiredCapabilities: ['parse'], availableCapabilities: ['parse'] } }),
  tool: () => ({ operation: 'validateToolManifest',
    runtimeInput: { manifest: toolManifest(), leasedPermissions: ['compute'], toolLease: {
      toolName: 'calculator', expiresAt: new Date(Date.now() + 60000).toISOString() },
    verifyLease: () => true, verifyHealth: () => true, isRevoked: () => false } }),
  'cloud-core/edge-sync': () => ({ operation: 'reconcileEdgeEvents',
    runtimeInput: { authorityZones: ['A'], verifyProvenance: () => true,
      events: [{ eventId: 'edge-1', authorityZone: 'A', conflictKey: 'state',
        vectorClock: { A: 1 }, provenance: { evidenceRefs: ['edge:mission'] } }] } })
};

function operationFor(variant) {
  return (OPERATION_BUILDERS[variant] || OPERATION_BUILDERS['cloud-core/edge-sync'])();
}

function missionInput(variant, index) {
  const step = operationFor(variant);
  const missionId = `holobionte-${index}-${variant.replace(/[^a-z]/gi, '-')}`;
  return { missionId, hostId: `host-${index}`, variantId: variant, fitContext: FIT,
    executionBudget: BUDGET, evidenceRefs: [`proof:${missionId}`],
    verifyEvaluationEvidence: async ({ evidenceRefs }) => evidenceRefs.length > 0,
    verifyMission: async () => ({ verdict: 'PASS', verifierIds: ['verifier-a', 'verifier-b'],
      assertions: [{ id: 'mission-evidence', status: 'PASS', evidenceRefs: [`proof:${missionId}`] }] }),
    verifierIds: ['verifier-a', 'verifier-b'],
    variantOperations: [{ operation: step.operation, runtimeInput: step.runtimeInput }] };
}

function testComposition() {
  const entries = catalog.topologyVariants('holobionte');
  assert.equal(entries.length, 12);
  for (const name of variants.names) {
    const policy = variants.getVariant(name);
    const fit = policy.analyzeFit(FIT);
    assert.equal(fit.compatible, true, name);
    const assessment = maturity.maturityFor(policy);
    assert.equal(assessment.maturity, 'implemented', `${name}: ${assessment.reasons.join(',')}`);
    const entry = entries.find((item) => item.variantId === policy.name);
    assert.ok(entry, name);
    assert.equal(entry.maturity, 'implemented', policy.name);
    assert.ok((controller.OPERATIONS[policy.name] || []).length > 0, policy.name);
  }
}

async function migrate(db) {
  await migrateHolobiontSessions(db);
  await migrateHolobiontContracts(db);
  await migrateHolobiontMemory(db);
  await migrateHolobiontLedger(db);
  await migrateHolobiontImmunePlane(db);
  await migrateHolobiontVariantEvents(db);
}

async function testExecution(db) {
  const telemetry = { emitEvent: () => ({}) };
  const policies = variants.names.map((name) => variants.getVariant(name));
  for (const [index, policy] of policies.entries()) {
    const input = missionInput(policy.name, index);
    const result = await runVariantMission(db, { ...input, telemetry });
    assert.equal(result.verdict, 'PASS', policy.name);
    assert.equal(result.workflow.status, 'COMPLETED', policy.name);
    assert.equal(result.topology.variant, policy.name, policy.name);
    assert.ok(result.evidenceRefs.includes(`proof:${input.missionId}`), policy.name);
  }
}

async function snapshotDb() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec('CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);'
    + ' CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT);');
  await migrateHolobiontSessions(db);
  await migrateHolobiontContracts(db);
  await migrateHolobiontLedger(db);
  await migrateHolobiontMemory(db);
  await db.run('INSERT INTO workspaces VALUES (?, ?, ?)', 'workspace-1', 'org-1', 'project-1');
  await db.run('INSERT INTO agents VALUES (?, ?)', 'host-1', 'workspace-1');
  return db;
}

async function testSnapshots() {
  const db = await snapshotDb();
  try {
    const policies = variants.names.map((name) => variants.getVariant(name));
    for (const [index, policy] of policies.entries()) {
      const sessionId = `snapshot-${index}`;
      const session = await store.createSession(db, { holobiontId: sessionId, hostId: 'host-1',
        workspaceId: 'workspace-1', projectId: 'project-1', scope: 'WORKSPACE' });
      const revision = await store.appendEvent(db, { holobiontId: session.holobiontId,
        expectedRevision: session.revision, eventType: 'VARIANT_SELECTED',
        payload: { variantId: policy.name, selectionReceipt: { receiptId: `sel-${index}`, variantId: policy.name },
          policy: { placement: {} } } });
      await store.updateLifecycleStatus(db, { holobiontId: session.holobiontId,
        expectedRevision: revision, status: 'QUIESCENT', eventType: 'QUIESCENT' });
      const context = { db, topologyId: 'holobionte', variantId: policy.name,
        sessionId, agentId: 'host-1', workspaceId: 'workspace-1', workerKind: 'bounded_worker',
        scope: { clause: 'w.organization_id = ? AND w.project_id = ?', params: ['org-1', 'project-1'] } };
      const manifest = await snapshotService.capture(context);
      assert.equal(manifest.boundary.status, 'QUIESCENT', policy.name);
      const component = manifest.components.find((item) => item.id === 'variant-policy');
      assert.equal(component.reference.variant, policy.name, policy.name);
      assert.equal((await snapshotService.preflightRestore({ ...context, manifest })).allowed, true, policy.name);
    }
  } finally {
    await db.close();
  }
}

async function main() {
  testComposition();
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrate(db);
    await testExecution(db);
  } finally {
    await db.close();
  }
  await testSnapshots();
  console.log('Holobiont all-variants mission (composition + execution + snapshot): PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
