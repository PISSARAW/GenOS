'use strict';

const { digest, fail } = require('./qualityContract');
const { extractTargetContent } = require('./workerQualityContractEnforcer');
const { runWorkerQuality, requireSatisfied, qualityFailure } = require('./qualityWorkerRuntime');
const { assertActive, meteredReply, modelUri } = require('./qualityRuntimeModelAdapter');
const code = require('./qualityNativeCode');

async function candidateOf(ctx) {
  const captured = ctx.codeWorker ? await code.capture(ctx) : null;
  const report = ctx.evidence.evidenceReport;
  const text = captured ? captured.text : extractTargetContent(report, report.workerArtifact);
  if (!text) throw fail('GQEL_ARTIFACT_INVALID', 'Worker quality requires an inspectable artifact.');
  return { ...ctx, text, code: captured };
}

async function revise(ctx, request) {
  if (ctx.revise) return ctx.revise(request);
  const stages = require('../workerEvidenceBarrierLocal');
  const generation = await stages.runGenerationStage({ ...ctx, qualityRequest: request });
  const evidence = await stages.runEvidenceStage({ ...ctx, generation, result: generation.result,
    codeWorker: generation.codeWorker, budget: generation.budget, agentName: generation.agentName,
    nameMeaning: generation.nameMeaning, skipQuality: true });
  return { ...ctx, generation, evidence };
}

async function restore(ctx, candidate) {
  if (!ctx.codeWorker) return candidate;
  const stages = require('../workerEvidenceBarrierLocal');
  const generation = { ...candidate.generation,
    result: { ...candidate.generation.result, text: code.restoration(candidate) } };
  const evidence = await stages.runEvidenceStage({ ...ctx, generation, result: generation.result,
    codeWorker: true, budget: generation.budget, skipQuality: true });
  const restored = await candidateOf({ ...ctx, generation, evidence });
  if (digest(restored.text) !== digest(candidate.text)) throw fail('GQEL_CODE_CHANGED', 'Restored code differs from the selected candidate.');
  return restored;
}

function generatorFor(state) {
  return async request => {
    await assertActive(state.ctx, request);
    const next = state.first ? state.initial : await candidateOf(await revise(state.ctx, request));
    code.assertScope(state.initial, next);
    state.first = false; state.current = next; state.candidates.set(digest(next.text), next);
    const result = next.generation.result;
    const configured = state.ctx.mission.qualityRuntime?.generatorModel || state.ctx.generationContext.workerModel;
    if (modelUri(result.model) !== modelUri(configured)) throw fail('GQEL_MODEL_MISMATCH', 'Author route differs from its quality contract.');
    state.usage.inputTokens += result.inputTokens;
    state.usage.outputTokens += result.outputTokens;
    state.usage.costUsd += result.costUsd || 0;
    return meteredReply(result, next.text);
  };
}

async function elevateEvidence(ctx) {
  const contract = require('./qualityNativeGeneration').runtimeContract(ctx.mission);
  if (!contract || ctx.skipQuality || ctx.evidence.unresolved || ctx.evidence.noAnswer) return ctx.evidence;
  ctx.mission.executionRunId = ctx.executionRun.id;
  const initial = await candidateOf(ctx), usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
  const state = { ctx, initial, current: initial, first: true, candidates: new Map(), usage };
  const result = await runWorkerQuality({ ...ctx, contract, usage, planScenes: false,
    generator: generatorFor(state), verifier: ctx.codeWorker ? request => code.verify(state.current, request) : undefined });
  requireSatisfied(result);
  let selected = state.candidates.get(result.bestVersion.digest);
  if (!selected) throw fail('GQEL_ARTIFACT_INVALID', 'Selected quality artifact has no native candidate.');
  if (ctx.codeWorker && selected !== state.current) selected = await restore(ctx, selected);
  const report = selected.evidence.evidenceReport;
  report.qualityFeedback = result.qualityFeedback;
  try {
    report.qualityElevationReceipt = await require('./qualityReceiptService').issueQualityReceipt({ db: ctx.db,
      worker: ctx.mission, result, executionRunId: ctx.executionRun.id,
      artifact: report.workerArtifact, report, codeEvidence: selected.code });
  } catch (error) { throw qualityFailure(result, error); }
  require('./qualityCriterionEvidence').attach(ctx.mission, report);
  ctx.generation.result = { ...selected.generation.result, ...result.nativeUsage };
  selected.evidence.consumed = result.nativeUsage.inputTokens + result.nativeUsage.outputTokens;
  return selected.evidence;
}

module.exports = { elevateEvidence, candidateOf };
