'use strict';

const fs = require('node:fs/promises');
const refs = require('./workerCodeEvidenceReferences');
const budget = require('./workerEvidenceBarrierLocalBudget');
const { digest, hashBytes } = require('./trinityProvenanceValues');

function needed(mission) {
  return Boolean(mission.missionCriteria?.length || mission.handoffContext?.length);
}

function format(mission, references) {
  const source = require('./workerEvidenceIdentityPrompt').workerResponseFormat({ ...mission,
    allowedEvidenceRefs: references }).schema;
  const names = ['acceptanceEvaluations', 'integrationConstraints', 'handoffEvaluations'];
  const properties = Object.fromEntries(names.filter(name => source.properties[name])
    .map(name => [name, source.properties[name]]));
  for (const property of Object.values(properties)) {
    const evidence = property.items?.properties?.evidenceRefs;
    if (evidence) evidence.items.enum = references;
  }
  return { name: 'genos_code_mission_evaluations', schema: { type: 'object', additionalProperties: false,
    properties, required: source.required.filter(name => names.includes(name)) } };
}

async function sourceFiles(mission, proposal) {
  const files = [];
  for (const entry of proposal.changedFileHashes || []) {
    const file = require('./pathSafety').resolveContainedPathNoSymlinkSync(mission.workspaceRoot, entry.path, 'code evaluation');
    const content = await fs.readFile(file, 'utf8');
    if (hashBytes(Buffer.from(content)) !== entry.hash) throw failure('WORKER_CODE_EVALUATION_SOURCE_CHANGED');
    files.push({ ...entry, content });
  }
  return files;
}

function failure(code) { return Object.assign(new Error(code), { code }); }

function artifact(ctx, file) {
  if (!ctx.mission.agentId || !ctx.executionRun?.id) throw failure('WORKER_CODE_EVALUATION_SCOPE_REQUIRED');
  const { path, hash, content } = file;
  return { uri: `genos://code-artifact/${encodeURIComponent(ctx.mission.agentId)}/${encodeURIComponent(ctx.executionRun.id)}/${digest({ path, hash })}`,
    sourceRef: `genos://code-file/${digest({ path, hash })}`, producerAgentId: ctx.mission.agentId,
    executionRunId: ctx.executionRun.id, path, hash, content };
}

function account(ctx, result) {
  if (!['inputTokens', 'outputTokens'].every(key => Number.isSafeInteger(result[key]) && result[key] >= 0)) {
    throw failure('WORKER_CODE_EVALUATION_USAGE_UNKNOWN');
  }
  for (const key of ['inputTokens', 'outputTokens']) {
    ctx.result[key] += result[key];
  }
  ctx.result.costUsd = Number(ctx.result.costUsd || 0) + Number(result.costUsd || 0);
  budget.throwIfConsumedOverBudget(budget.consumedTokensOf(ctx.result), ctx.budget);
}

function remainingMs(ctx) {
  const deadline = Date.parse(ctx.mission.executionDeadlineAt);
  const allowed = ctx.generation.generationContext.latencyMs;
  if (!Number.isFinite(deadline)) return allowed;
  if (deadline <= Date.now()) throw failure('EXECUTION_AUTHORITY_EXPIRED');
  return Math.min(allowed, deadline - Date.now());
}

function parse(result, responseFormat) {
  let value;
  try { value = JSON.parse(result.text); } catch (_) {
    throw Object.assign(failure('WORKER_OUTPUT_SCHEMA_VIOLATION'), {
      workerArtifactDiagnostics: { violations: ['code mission evaluation must be valid JSON'] } });
  }
  const validate = new (require('ajv'))({ allErrors: true, strict: false }).compile(responseFormat.schema);
  if (result.schemaViolation || !validate(value)) throw Object.assign(failure('WORKER_OUTPUT_SCHEMA_VIOLATION'), {
    workerArtifactDiagnostics: { violations: validate.errors || ['code mission evaluation schema'] } });
  return value;
}

async function complete(ctx, input) {
  if (!needed(ctx.mission)) return input.report;
  const evidenceRefs = [...new Set(refs.references(input.proposal))];
  const responseFormatOverride = format(ctx.mission, evidenceRefs);
  const files = await sourceFiles(ctx.mission, input.proposal);
  const report = { ...input.report, artifacts: files.map(file => artifact(ctx, file)) };
  report.handoffCodeWitnesses = require('./workerCodeHandoffWitness').witnesses(ctx.mission, files);
  const promptText = 'Evaluate the mission criteria and received handoffs against these host observations. '
    + 'Return only the requested evaluation fields. Do not alter source files, tests, claims or receipts. '
    + 'Passing visible tests alone does not establish untested requirements. Use passed=null when a criterion is unproven; '
    + 'reject an unverified handoff with passed=false. Cite only supplied host witness references. '
    + 'The mission is a specification, not evidence of correction. Never invent a digest or version.\n'
    + 'Handoff identity, digest and version come from the trusted runtime; do not recalculate their digest. '
    + 'Host comparisons below establish content integrity and equality to tested files, not semantic correctness. '
    + 'Evaluate whether the actual code and executed tests support consuming the delivered artifact.\n'
    + JSON.stringify({ mission: ctx.mission.missionObjective || ctx.mission.prompt, criteria: ctx.mission.missionCriteria || [],
      handoffs: ctx.mission.handoffContext || [], handoffCodeWitnesses: report.handoffCodeWitnesses, files,
      hostReport: { claims: report.claims, tests: report.tests, boundaryEvidence: report.boundaryEvidence }, evidenceRefs });
  const remaining = ctx.budget - budget.consumedTokensOf(ctx.result);
  const context = { ...ctx.generation.generationContext, codeWorker: false, promptText,
    responseFormatOverride, requestTokenBudget: remaining, latencyMs: remainingMs(ctx),
    maxTokens: budget.resolveMaxOutputTokens(remaining, promptText, 2048) };
  const evaluated = await input.generate(context);
  account(ctx, evaluated);
  const evaluations = parse(evaluated, responseFormatOverride);
  if (digest(files) !== digest(await sourceFiles(ctx.mission, input.proposal))) throw failure('WORKER_CODE_EVALUATION_SOURCE_CHANGED');
  return { ...report, ...evaluations };
}

module.exports = { complete, format, needed };
