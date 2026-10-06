'use strict';

const { withTransaction } = require('../../../db');
const meristem = require('./epistemicMeristem');
const store = require('./capabilityEvidenceStore');
const artifacts = require('./runtimeArtifacts');

function occupation(value) {
  const contract = meristem.experiment(value);
  if (!contract.intervention || !contract.sourceRefs.length || !contract.tools.length) {
    throw new Error('EXPERIMENT_INTERVENTION_SOURCES_TOOLS_REQUIRED');
  }
  if (contract.replicationOf && contract.verifierId !== contract.independentVerifierId) throw new Error('REPLICATION_VERIFIER_MISMATCH');
  return contract;
}

async function openWave(db, input) {
  if (!input.waveId || !input.scopeId) throw new Error('WAVE_SCOPE_REQUIRED');
  const contracts = input.candidates.map(occupation);
  for (const contract of contracts) {
    if (!(await Promise.all(contract.sourceRefs.map(input.resolveArtifact))).every(Boolean)) throw new Error('EXPERIMENT_SOURCES_UNRESOLVED');
  }
  const ids = contracts.map((item) => item.experimentId);
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error('DISTINCT_EXPERIMENTS_REQUIRED');
  const coverageReceipts = await store.loadVerifiedCoverage(db, input);
  const ranked = meristem.rankExperiments({ candidates: contracts, coverageReceipts, inhibitionWeight: input.inhibitionWeight });
  const selected = allocate(ranked, input.budget);
  await db.run(`INSERT INTO morph_experiment_waves (wave_id, scope_id, contracts_json, state)
    VALUES (?, ?, ?, 'OPEN')`, [input.waveId, input.scopeId, JSON.stringify(selected)]);
  return { waveId: input.waveId, contracts: selected, ranked, state: 'OPEN' };
}

function allocate(ranked, budget) {
  if (!Number.isFinite(budget) || budget < 0) throw new Error('FINITE_EXPERIMENT_BUDGET_REQUIRED');
  const selected = [];
  let remaining = budget;
  for (const item of ranked) {
    if (item.experiment.cost > remaining) continue;
    selected.push(item.experiment);
    remaining -= item.experiment.cost;
  }
  if (!selected.length) throw new Error('EXPERIMENT_BUDGET_EXHAUSTED');
  return selected;
}

async function verifiedResult(contract, result, resolver) {
  const proof = await resolver(result.verificationRef);
  const content = proof?.content;
  if (proof?.kind !== 'experiment-verification' || content?.valid !== true
    || content.experimentId !== contract.experimentId || content.verifierId !== contract.verifierId) {
    throw new Error('EXPERIMENT_VERIFICATION_BINDING_INVALID');
  }
  if (!contract.discriminatingOutcomes.includes(content.outcome)) throw new Error('UNDECLARED_EXPERIMENT_OUTCOME');
  if (JSON.stringify(content.evidenceRefs) !== JSON.stringify(result.evidenceRefs)) throw new Error('EXPERIMENT_EVIDENCE_MISMATCH');
  return { outcome: content.outcome, dissent: content.dissent || [] };
}

async function sealWave(db, input) {
  return withTransaction(db, async (tx) => {
    const row = await tx.get('SELECT * FROM morph_experiment_waves WHERE wave_id = ? AND scope_id = ?', [input.waveId, input.scopeId]);
    if (!row) throw new Error('WAVE_NOT_FOUND');
    if (row.state === 'SEALED') return JSON.parse(row.receipt_json);
    const contracts = JSON.parse(row.contracts_json);
    if (input.results.length !== contracts.length) throw new Error('COMPLETE_WAVE_REQUIRED');
    const results = [];
    for (const contract of contracts) {
      const result = input.results.find((item) => item.experimentId === contract.experimentId);
      if (!result) throw new Error('EXPERIMENT_RESULT_REQUIRED');
      const verified = await verifiedResult(contract, result, input.resolveArtifact);
      await store.recordCoverage(tx, { ...result, experiment: contract, scopeId: input.scopeId,
        receiptId: `${input.waveId}:${contract.experimentId}`, status: 'VERIFIED', verifierId: contract.verifierId,
        resolveArtifact: input.resolveArtifact });
      results.push({ experimentId: contract.experimentId, ...verified });
    }
    const receipt = { waveId: input.waveId, scopeId: input.scopeId, state: 'SEALED', results };
    receipt.artifactRef = await artifacts.put(tx, { scopeId: input.scopeId, kind: 'sealed-experiment-wave', content: receipt });
    await tx.run("UPDATE morph_experiment_waves SET state = 'SEALED', receipt_json = ? WHERE wave_id = ?", [JSON.stringify(receipt), input.waveId]);
    return receipt;
  });
}

async function runWave(db, input, adapters) {
  const wave = await openWave(db, input);
  const results = [];
  for (const contract of wave.contracts) {
    const world = await adapters.createIsolatedWorld({ waveId: input.waveId, contract });
    const executed = await adapters.execute({ world, contract });
    const verified = await adapters.verify({ world, contract, executed });
    results.push({ experimentId: contract.experimentId, ...verified });
  }
  return sealWave(db, { ...input, results });
}

function nicheAssignments(wave) {
  return wave.contracts.map((contract) => ({ nicheId: `experiment:${contract.experimentId}`,
    hypothesisId: contract.hypothesisId, intervention: contract.intervention,
    requiredCapabilities: contract.tools, sourceRefs: contract.sourceRefs,
    verifierId: contract.verifierId, allocatedCost: contract.cost }));
}

module.exports = { openWave, sealWave, runWave, nicheAssignments, occupation };
