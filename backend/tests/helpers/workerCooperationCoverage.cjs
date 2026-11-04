'use strict';

async function inspect(context) {
  const { db, id, report } = context;
  const genomes = [];
  for (const stage of report.stages) {
    const binding = stage.runId && await require('../../src/services/biologicalWorkerStore').binding(db, stage.runId);
    genomes.push({ kind: stage.kind, runId: stage.runId,
      cognitive: stage.kind !== 'recovery_worker',
      admitted: Boolean(binding?.genome?.dna),
      genomeRef: binding?.genome?.dna?.genomeRef || null,
      contentHash: binding?.genome?.dna?.contentHash || null,
      clinical: binding?.clinicalAdmission?.checked === true,
      verified: stage.receipt?.result?.verified === true });
  }
  const table = await db.get("SELECT name FROM sqlite_master WHERE name='mission_protocol_receipts'");
  const protocols = table ? await db.all(`SELECT DISTINCT protocol FROM mission_protocol_receipts
    WHERE run_id IN (SELECT id FROM strategy_execution_runs WHERE agent_id=?
      OR agent_id IN (SELECT id FROM agents WHERE parent_agent_id=?))`, id, id) : [];
  const checks = coverageChecks(context, genomes);
  const lease = await db.get('SELECT state,owner_pid,generation FROM mission_execution_authority WHERE mission_id=?', id);
  checks.exclusiveController = lease?.state === 'running' && lease.owner_pid === process.pid;
  return { schema: 'genos.worker-cooperation-coverage/v1', checks,
    satisfied: Object.values(checks).every(Boolean), genomes, controllerLease: lease,
    protocols: protocols.map(row => row.protocol),
    scope: 'Sequential observation-gated mission; collective topologies and unrelated capabilities are not activated.' };
}

function coverageChecks(context, genomes) {
  const { report } = context;
  return {
    nativeBootstrap: Boolean(report.nativeController?.body && context.control?.ctx.protocolBinding),
    admittedGenomes: genomes.filter(item => item.cognitive).every(item => item.admitted),
    clinicalAdmission: nonemptyEvery(genomes, item => item.clinical),
    boundedToolLeases: nonemptyEvery(report.stages, leaseBound),
    recoveryQuiescence: nonemptyEvery(report.stages, stage => stage.quiescent === true),
    nativeWorkerProofs: nonemptyEvery(genomes, item => item.verified),
    routedPlanner: Boolean(report.planning?.identity && report.planning?.cognitive?.execution?.status === 'emitted'),
    rootCompletion: Boolean(report.nativeCompletion?.dossierDigest),
    missionClosure: report.nativeCompletion?.missionStatus === 'completed'
  };
}

function nonemptyEvery(items, predicate) { return items.length > 0 && items.every(predicate); }

function leaseBound(stage) {
  return Array.isArray(stage.factoryToolLease) && Array.isArray(stage.runtimeAuthority?.toolLease)
    && stage.runtimeAuthority.toolLease.every(tool => stage.factoryToolLease.includes(tool));
}

module.exports = { inspect };
