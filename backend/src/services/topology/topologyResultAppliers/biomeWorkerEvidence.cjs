'use strict';

const reader = require('../workerResultReader.cjs');
const { digest } = require('../../biologicalIntegrity');
const nativeGate = require('../../epistemic/nativeOracleGate');
const nativeProof = require('../../epistemic/nativeOracleProof');
const { semanticReceiptAccepted } = require('../../biologicalWorkerReceiptService');

async function checkedRecord(db, scope, member) {
  if (member.status !== 'completed' || !member.executionRunId) return null;
  const saved = await reader.readEvidence(db, { missionId: scope.missionId,
    member, executionRunId: member.executionRunId });
  const receipt = saved.receipt;
  if (!acceptedReceipt(saved)) return null;
  const agent = await db.get(`SELECT a.metadata_json FROM agents a JOIN mission_agents ma
    ON ma.agent_id=a.id WHERE a.id=? AND ma.mission_id=?`, member.workerId, scope.missionId);
  if (JSON.parse(agent?.metadata_json || '{}').topologySessionId !== scope.sessionId) return null;
  const request = { runId: receipt.runId, agentId: member.workerId, event: saved.event.event };
  const verification = await nativeGate.historical(db, request);
  if (!verification || verification.acceptance.hash !== receipt.semanticVerification.acceptanceHash) return null;
  await nativeProof.assertCompletedEvidence(db, { proof: verification.proof,
    request, report: receipt.evidence.report });
  return { binding: saved.binding, receipt, reference: `sha256:${digest(receipt)}`, role: member.role };
}

function acceptedReceipt(saved) {
  const receipt = saved.receipt;
  return saved.valid && receipt?.result?.verified === true && receipt.result.status === 'completed'
    && receipt.budgetAssessment?.satisfied === true
    && semanticReceiptAccepted(receipt.semanticVerification);
}

async function load(db, scope) {
  if (new Set(scope.members.map(member => member.workerId)).size !== scope.members.length) return null;
  const records = [];
  for (const member of scope.members) {
    const record = await checkedRecord(db, scope, member);
    if (!record) return null;
    records.push(record);
  }
  return records;
}

function capability(record) { return `biome-worker:${record.binding.workerId}`; }

function opportunity(record) {
  return { id: record.binding.workerId, descriptor: record.role || record.binding.genome.role,
    opportunityScore: 1, evidenceRefs: [record.reference],
    requiredCapabilities: [capability(record)] };
}

function individual(record) {
  const genome = record.binding.genome;
  return { individualId: record.binding.workerId, role: record.role || genome.role,
    genome, capabilities: [capability(record)],
    cognitiveRecipe: genome.strategyContract,
    phenotype: { focus: genome.workerContract?.mission?.objective || genome.role } };
}

function measurements(records, ecology) {
  const populationResults = [];
  const populationCommands = [];
  for (const record of records) {
    const individualId = record.binding.workerId;
    const population = ecology.populations.find(item => item.individuals.some(i => i.individualId === individualId));
    if (!population) throw Object.assign(new Error('Verified worker has no ecological population.'), { code: 'BIOME_WORKER_POPULATION_MISSING' });
    const evidenceRefs = [record.reference];
    populationResults.push({ id: record.receipt.runId, individualId,
      populationId: population.populationId, productivity: 1,
      evidenceRefs, artifact: record.receipt.evidence.report });
    populationCommands.push({ type: 'adapt', populationId: population.populationId, individualId,
      patch: { focus: `Retain independently verified output of run ${record.receipt.runId}` }, evidenceRefs });
  }
  return { populationResults, populationCommands };
}

module.exports = { load, individual, opportunity, measurements };
