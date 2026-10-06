'use strict';

const { evaluateGeneralization } = require('./poetBridgeService');
const phenotype = require('./phenotypicDevelopmentService');
const programs = require('./nceProcedureProgram');
const creative = require('./creativePhenotypeVectorService');
const { environmentFingerprint } = require('./poetExecutionEvidence');

function enabledFeatures(input) {
  return Object.fromEntries(['play', 'culture', 'phenotype', 'poet']
    .map((key) => [key, input.features?.[key] !== false]));
}

function artifactsFor(input, features) {
  const supplied = input.artifacts || [];
  const discovered = features.play ? programs.candidatePrograms().map((procedure) => ({
    id: `play-${programs.digest(procedure)}`, agentId: input.agentId,
    provenance: { createdBy: input.agentId, source: 'bounded-play-search' },
    content: { procedure }, active: true,
  })) : [];
  const artifacts = [...supplied, ...discovered];
  if (artifacts.length > 32) throw new Error('NCE candidate budget exceeded (32)');
  return artifacts.map(validateArtifact);
}

function validateArtifact(artifact) {
  if (!artifact?.id || !artifact.agentId || artifact.active === false ||
      artifact.provenance?.createdBy !== artifact.agentId) throw new Error('NCE artifact provenance required');
  return { ...structuredClone(artifact), content: {
    procedure: programs.validateProgram(artifact.content?.procedure),
  } };
}

function procedureAgent(agentId, procedure) {
  return { id: `${agentId}:${programs.digest(procedure)}`, executor: 'nce-procedure', procedure };
}

async function stateFor(input, db) {
  await db.run(`INSERT OR IGNORE INTO agents
    (id, name, role, status, execution_mode) VALUES (?, ?, ?, ?, ?)`,
  input.agentId, input.agentId, 'nce-experimental-subject', 'idle', 'worker');
  const persisted = await phenotype.loadPhenotypeState(null, db, input.agentId);
  if (persisted) return persisted;
  return { id: `pheno_agent_${input.agentId}`, agentId: input.agentId, genomeId: `agent:${input.agentId}`,
    currentPhenotype: {}, branches: [], atrophies: [], history: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

async function requestDigest(input, context) {
  const fingerprints = {
    training: await Promise.all(input.split.training.map(environmentFingerprint)),
    heldOut: await Promise.all(input.split.heldOut.map(environmentFingerprint)),
  };
  return programs.digest({ agentId: input.agentId, features: context.features,
    artifacts: context.artifacts, fingerprints, timeoutMs: input.timeoutMs ?? 30000,
    contracts: [...input.split.training, ...input.split.heldOut].map((environment) => ({
      command: environment.verifierCommand, protectedPaths: environment.protectedPaths,
      artifactPath: environment.artifactPath })) });
}

function replayReceipt(state, input, requestHash) {
  const previous = state.nceReceipts?.find((item) => item.runId === input.runId);
  if (!previous) return null;
  if (previous.requestHash !== requestHash) throw new Error('NCE runId reused with a different request');
  return { ...previous, replayed: true };
}

async function runCausalCycle(input, db) {
  if (!db?.run || !db?.get || !input.agentId || !input.runId) throw new Error('NCE requires database, agentId and runId');
  validateRequest(input);
  const features = enabledFeatures(input);
  const context = { features, artifacts: artifactsFor(input, features) };
  const state = await stateFor(input, db);
  const requestHash = await requestDigest(input, context);
  const replay = replayReceipt(state, input, requestHash);
  if (replay) return replay;
  const receipt = await measureCycle(input, { ...context, state, requestHash });
  receipt.phenotypeBefore = require('./phenotypeVectorService').phenotypeVector(state.currentPhenotype, state);
  if (receipt.promoted) integrateProcedure(state, receipt);
  receipt.phenotypeAfter = require('./phenotypeVectorService').phenotypeVector(state.currentPhenotype, state);
  receipt.transitionEvidenceRef = programs.digest({ measurement: receipt.evidenceRef,
    before: receipt.phenotypeBefore, after: receipt.phenotypeAfter, procedure: receipt.procedure });
  state.creativeVector = creative.fromExperiment(receipt);
  state.nceReceipts = [...(state.nceReceipts || []), receipt];
  await phenotype.savePhenotypeState(state, db);
  return { ...receipt, stateId: state.id, revision: state.revision };
}

function validateRequest(input) {
  if (typeof input.agentId !== 'string' || typeof input.runId !== 'string' ||
      !input.agentId.trim() || !input.runId.trim()) throw new Error('NCE identities must be non-empty strings');
  for (const partition of ['training', 'heldOut']) {
    const tasks = input.split?.[partition];
    if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > 20) {
      throw new Error('NCE partitions must contain 1..20 tasks');
    }
  }
}

function candidatesFor(input, ctx) {
  const initial = ctx.state.learnedProcedure || programs.program();
  let procedures = ctx.artifacts.map((artifact) => artifact.content.procedure);
  if (!ctx.features.culture || !ctx.features.phenotype) procedures = [];
  if (!ctx.features.poet) procedures = procedures.slice(0, 1);
  const unique = new Map([initial, ...procedures].map((value) => [programs.digest(value), value]));
  return [...unique.values()].map((value) => procedureAgent(input.agentId, value));
}

async function measureCycle(input, ctx) {
  const started = Date.now();
  const initial = ctx.state.learnedProcedure || programs.program();
  const options = { timeoutMs: input.timeoutMs ?? 30000 };
  const after = await evaluateGeneralization(candidatesFor(input, ctx), input.split, options);
  // Selection is already frozen before the initial procedure sees held-out tasks.
  const before = await evaluateGeneralization([procedureAgent(input.agentId, initial)], input.split, options);
  const measured = before.measured && after.measured;
  const winner = candidatesFor(input, ctx).find((agent) => agent.id === after.selectedAgentId);
  const selectedHash = programs.digest(winner.procedure);
  const selectedArtifact = ctx.artifacts.find((artifact) => programs.digest(artifact.content.procedure) === selectedHash);
  const delta = measured ? after.heldOut.successRate - before.heldOut.successRate : null;
  return sealReceipt({ input, ctx, started, before, after, measured, winner, selectedArtifact, delta });
}

function sealReceipt(ctx) {
  const { input, before, after, measured, delta } = ctx;
  const candidateHashes = ctx.ctx.artifacts.map((artifact) => programs.digest(artifact.content.procedure));
  const receipt = { schema: 'genos.nce.causal-cycle.v1', runId: input.runId,
    agentId: input.agentId, requestHash: ctx.ctx.requestHash, features: ctx.ctx.features,
    measured, before, after, delta, procedure: ctx.winner.procedure,
    artifact: ctx.selectedArtifact || null, durationMs: Date.now() - ctx.started,
    novelty: Number(!ctx.ctx.state.nceReceipts?.some((item) =>
      programs.digest(item.procedure) === programs.digest(ctx.winner.procedure))),
    diversity: candidateHashes.length ? new Set(candidateHashes).size / candidateHashes.length : 0,
    promoted: measured && delta > 0 && after.training.successRate >= before.training.successRate
      && ctx.ctx.features.culture && ctx.ctx.features.phenotype,
    causalOrder: ['training-selection', 'frozen-held-out', 'baseline-control', 'phenotype-commit'],
  };
  receipt.evidenceRef = programs.digest(receipt);
  return receipt;
}

function integrateProcedure(state, receipt) {
  const hash = programs.digest(receipt.procedure);
  const actions = phenotype.developFromEnvironment(state, { requiredCapabilities: [`nce-procedure:${hash}`] });
  state.learnedProcedure = structuredClone(receipt.procedure);
  state.proceduralRepertoire = { ...state.proceduralRepertoire,
    [hash]: { procedure: structuredClone(receipt.procedure), evidenceRef: receipt.evidenceRef } };
  updateTradition(state, receipt);
  state.history.push({ action: 'verified-cultural-transfer', runId: receipt.runId,
    artifactId: receipt.artifact?.id, evidenceRef: receipt.evidenceRef,
    programHash: hash, actions, timestamp: new Date().toISOString() });
}

function updateTradition(state, receipt) {
  const source = receipt.artifact;
  if (!source) return;
  const root = source.provenance.rootArtifactId || source.id;
  const lineage = [...(source.lineage || [source.agentId]), state.agentId];
  const adopted = { id: `culture-${programs.digest([source.id, state.agentId, receipt.runId])}`,
    agentId: state.agentId, active: true, content: { procedure: structuredClone(receipt.procedure) },
    lineage, provenance: { createdBy: state.agentId, rootArtifactId: root, transmittedFrom: source.id,
      evidenceRef: receipt.evidenceRef } };
  state.culturalTraditions = { ...state.culturalTraditions,
    [root]: { rootArtifactId: root, members: [...new Set(lineage)], artifact: adopted } };
  receipt.transmittedArtifact = adopted;
}

module.exports = { runCausalCycle };
