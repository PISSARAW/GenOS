'use strict';

const assert = require('node:assert/strict');
const sessions = require('../src/services/topologySessionStore');
const graphStore = require('../src/services/aTeam/workGraph/workGraphStore');
const runtime = require('../src/services/aTeam/aTeamRuntime');
const teamRunStore = require('../src/services/aTeam/teamRunStore');
const { coordinateRepair } = require('../src/services/aTeam/adaptation/repairCoordinatorService');

function persistRecord(records, record) {
  const current = records.get(record.id);
  if (record.revision === undefined) {
    if (current) throw Object.assign(new Error('duplicate'), { code: 'TOPOLOGY_SESSION_CONFLICT' });
    records.set(record.id, { id: record.id, topology: record.topology, revision: 0, state: record.state });
    return { id: record.id, revision: 0 };
  }
  if (!current || current.revision !== record.revision) throw Object.assign(new Error('revision'), { code: 'TOPOLOGY_SESSION_CONFLICT' });
  const revision = current.revision + 1;
  records.set(record.id, { id: record.id, topology: record.topology, revision, state: record.state });
  return { id: record.id, revision };
}

async function withStore(runTest) {
  const original = { save: sessions.save, load: sessions.load, remove: sessions.remove };
  const records = new Map();
  sessions.save = async (_db, record) => persistRecord(records, record);
  sessions.load = async (_db, id) => records.get(id) || null;
  sessions.remove = async (_db, id) => records.delete(id);
  try { await runTest(); } finally { Object.assign(sessions, original); }
}

async function markInitialGraphComplete(db, graphId) {
  const graph = await graphStore.load(db, graphId);
  graph.nodes = graph.nodes.map((node) => ({ ...node, status: 'COMPLETED' }));
  return graphStore.update({ db, workGraphId: graphId, revision: graph.revision, graph });
}

async function run() {
  await withStore(async () => {
    const db = {};
    const created = await runtime.createRun({
      db, missionId: 'coordinator-mission', idempotencyKey: 'repair-graph', goal: 'Replace API specialist',
      status: 'RUNNING', phase: 'EXECUTION', members: [
        { memberId: 'api-old', agentId: 'worker-api-old', domain: 'api', status: 'ACTIVE', capabilities: ['api'], ownedResponsibilities: ['api'] },
        { memberId: 'web', agentId: 'worker-web', domain: 'web', status: 'ACTIVE', capabilities: ['web'], ownedResponsibilities: ['web'], dependsOn: ['api'] }
      ]
    });
    await markInitialGraphComplete(db, created.graph.workGraphId);
    let invalidated;
    let resumed;
    const input = {
      db, teamRunId: created.run.teamRunId, repairId: 'replace-api-1', budget: 4, availableSlots: 1,
      repairPlan: { status: 'REPLACE', failedMemberId: 'worker-api-old', replacement: { agentId: 'candidate-api', domain: 'api', capabilities: ['api'], estimatedCost: 2 }, estimatedCost: 2 },
      reserveCandidate: async () => ({ accepted: true }),
      launchWorker: async () => ({ workerId: 'worker-api-new', status: 'ACTIVE' }),
      invalidateEvidence: async (request) => { invalidated = request.affectedNodeIds; return { accepted: true, invalidatedEvidenceIds: ['evidence-api-v1'] }; },
      resumeAffectedBranch: async (request) => { resumed = request.affectedNodeIds; return { accepted: true }; }
    };
    const result = await coordinateRepair(input);
    assert.equal(result.status, 'RUNNING');
    assert.ok(invalidated.includes('work:web:0'));
    assert.ok(resumed.includes('work:web:0'));
    const graph = await graphStore.load(db, result.workGraphId);
    assert.equal(graph.nodes.find((node) => node.nodeId === 'work:web:0').status, 'BLOCKED');
    const receipt = result.execution.repairReceipts.find((entry) => entry.repairId === input.repairId);
    assert.equal(receipt.evidenceInvalidated, true);
    assert.ok(receipt.resumedNodeIds.includes('work:web:0'));
    const replay = await coordinateRepair(input);
    assert.equal(replay.revision, result.revision);
    assert.equal((await teamRunStore.load(db, result.teamRunId)).status, 'RUNNING');
  });
  console.log('A-Team repair recompiles the WorkGraph, invalidates and resumes only affected branches.');
}

run().catch((error) => { console.error(error); process.exit(1); });
