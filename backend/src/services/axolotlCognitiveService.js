'use strict';
const store = require('./axolotlStateStore');
const learning = require('./axolotlRegenerationLearning');
const nursery = require('./axolotlNurseryService');
const costs = require('./axolotlRegenerationCostService');

function owned(db, input) { return require('./axolotlRegenerationService').ownedSession(db, input); }

async function prepare(input) {
  return store.transaction(input.db, async (tx) => {
    const session = await owned(tx, input);
    if (session.status !== 'planned') throw store.error('AXOLOTL_LEARNING_SESSION_LOCKED');
    const record = learning.scopedCandidates(session, { candidates: input.candidates === undefined ? sourceCandidates(session) : input.candidates });
    const saved = await store.write(tx, { kind: 'session', id: session.id, expectedVersion: session.version, value: { ...session, learning: record } });
    return { success: true, sessionId: session.id, learning: saved.learning };
  });
}

function sourceCandidates(session) {
  return session.preserved.filter((item) => item.kind === 'knowledge' && session.cognitiveScope.includes(item.key))
    .map((item, index) => ({ id: `reconstruct_${index}`, key: item.key, content: item.value,
      sourceRefs: [{ reference: item.ref || 'preserved_snapshot', digest: store.hash(item) }] }));
}

async function experiment(db, ctx) {
  const result = await nursery.evaluate({ topology: ctx.topology, contract: ctx.session.functionalContract,
    budget: { ...ctx.budget, durationMs: ctx.session.deadline - Date.now() } });
  const evidence = { sessionId: ctx.session.id, runId: ctx.session.runId, subjectHash: store.hash(ctx.topology),
    contractHash: store.hash(ctx.session.functionalContract), candidateId: ctx.candidate?.id || null,
    contentHash: ctx.candidate?.contentHash || null, result };
  const evidenceRef = await store.putEvidence(db, evidence);
  return { result, evidenceRef };
}

function improvement({ previous, outcome, candidate, contract }) {
  const targeted = contract.probes.filter((probe) => probe.kind === 'recall' && probe.key === candidate.key);
  const covered = targeted.every((probe) => outcome.probes.some((result) => result.id === probe.id && result.passed));
  const noRegression = previous.probes.filter((probe) => probe.passed).every((probe) => outcome.probes.some((next) => next.id === probe.id && next.passed));
  return targeted.length > 0 && covered && noRegression && outcome.checks.every((check) => check.passed);
}

async function persistProgress(db, ctx) {
  return store.transaction(db, async (tx) => {
    const current = await owned(tx, { sessionId: ctx.session.id, orchestratorId: ctx.session.orchestratorId });
    if (current.runId !== ctx.session.runId || current.status !== 'executing') throw store.error('AXOLOTL_EXECUTION_SUPERSEDED');
    await store.write(tx, { kind: 'session', id: current.id, expectedVersion: current.version,
      value: { ...current, learning: ctx.record, experimentCost: ctx.cost } });
  });
}

async function evaluate(db, session, original) {
  const record = session.learning || learning.scopedCandidates(session, { candidates: sourceCandidates(session) });
  let topology = store.clone(original);
  let remaining = { ...session.budget };
  const baseline = await experiment(db, { session, topology, budget: remaining });
  let previous = baseline.result;
  let cost = costs.accumulate(null, baseline.result);
  remaining.events -= baseline.result.events;
  record.experiments.push({ candidateId: null, evidenceRef: baseline.evidenceRef, passed: baseline.result.passed });
  await persistProgress(db, { session, record, cost });
  for (const candidate of record.candidates) {
    const trial = store.clone(topology);
    Object.defineProperty(trial.knowledge, candidate.key, { value: store.clone(candidate.content), enumerable: true, writable: true, configurable: true });
    const outcome = await experiment(db, { session, topology: trial, candidate, budget: remaining });
    cost = costs.accumulate(cost, outcome.result);
    remaining.events -= outcome.result.events;
    const accepted = improvement({ previous, outcome: outcome.result, candidate, contract: session.functionalContract });
    candidate.status = accepted ? 'tested_candidate' : 'rejected_candidate';
    candidate.evidence = [outcome.evidenceRef];
    candidate.reason = accepted ? null : 'Probe ciblée en échec ou régression du contrat.';
    record.experiments.push({ candidateId: candidate.id, evidenceRef: outcome.evidenceRef, accepted });
    if (accepted) { topology = trial; previous = outcome.result; }
    await persistProgress(db, { session, record, cost });
  }
  record.status = 'evaluated';
  return { topology, learning: record, cost, remaining };
}

async function promotionProof(db, session, candidate) {
  if (session.status !== 'completed' || !['supported_candidate', 'promoted'].includes(candidate.status)) throw store.error('COGNITIVE_CANDIDATE_UNSUPPORTED');
  const final = await store.evidence(db, session.evidenceRef);
  const trial = await store.evidence(db, candidate.evidence[0]);
  verifyProofScope({ final, trial, session });
  verifyProofContent({ final, trial, session, candidate });
  return { final, trial };
}

function verifyProofScope({ final, trial, session }) {
  if (final.sessionId !== session.id || trial.sessionId !== session.id || final.runId !== session.runId || trial.runId !== session.runId) throw store.error('COGNITIVE_EVIDENCE_SCOPE_MISMATCH');
  const contractHash = store.hash(session.functionalContract);
  if (final.contractHash !== contractHash || trial.contractHash !== contractHash) throw store.error('COGNITIVE_EVIDENCE_CONTRACT_MISMATCH');
}

function verifyProofContent({ final, trial, session, candidate }) {
  if (!final.result.passed || !final.result.isolated || !trial.result.isolated || trial.contentHash !== candidate.contentHash) throw store.error('COGNITIVE_EVIDENCE_REJECTED');
  if (final.subjectHash !== store.hash(session.newTopology) || store.hash(session.newTopology.knowledge[candidate.key]) !== candidate.contentHash) throw store.error('COGNITIVE_EVIDENCE_SUBJECT_MISMATCH');
}

async function promote(input) {
  return store.transaction(input.db, async (tx) => {
    const session = await owned(tx, input);
    const candidate = session.learning?.candidates.find((item) => item.id === input.candidateId);
    if (!candidate) throw store.error('COGNITIVE_CANDIDATE_NOT_FOUND');
    await promotionProof(tx, session, candidate);
    const active = await store.read(tx, { kind: 'topology', id: session.orchestratorId });
    if (active.sessionId !== session.id || store.hash(active.topology) !== store.hash(session.newTopology)) throw store.error('COGNITIVE_TOPOLOGY_SUPERSEDED');
    if (candidate.traitId) return { success: true, traitId: candidate.traitId, promotionLevel: 0, duplicate: true };
    const traitId = `axolotl_trait_${store.hash([session.id, candidate.id])}`;
    const data = { kind: 'axolotl_regeneration_candidate', key: candidate.key, content: candidate.content,
      contentHash: candidate.contentHash, sourceRefs: candidate.sourceRefs, evidenceRefs: [...candidate.evidence, session.evidenceRef],
      coveredProbes: session.functionalContract.probes.map((probe) => probe.id), active: true };
    await tx.run(`INSERT INTO learned_traits (id,trait_name,trait_description,source_agent_id,context_id,trait_data_json,promotion_level,confidence,usage_count,created_at,updated_at)
      VALUES (?,?,?,?,?,?,0,0.5,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      traitId, candidate.key, JSON.stringify(candidate.content), session.orchestratorId, session.id, JSON.stringify(data));
    candidate.status = 'promoted';
    candidate.traitId = traitId;
    await store.write(tx, { kind: 'session', id: session.id, expectedVersion: session.version, value: session });
    return { success: true, traitId, promotionLevel: 0, evidenceRefs: data.evidenceRefs };
  });
}

module.exports = { prepare, evaluate, promote, promotionProof };
