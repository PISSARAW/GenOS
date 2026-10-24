'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const REPORT_ROOT = path.join(__dirname, 'reports');
const ARM_KEYS = ['genos-full', 'static-social-graph', 'llm-with-memory', 'genos-without-relational-physiology', 'genos-social-memory-ablated', 'genos-social-memory-counterfactual'];
const MAX_TOKENS = 700;
const TOKEN_BUDGET = 1200;
const MAX_TURNS = 2;
const ACTIONS = ['propose-collaboration', 'ask-for-update', 'wait-for-reconciliation'];
const helpers = require('./v2-06-runner-model.cjs');
const { parseJsonResponse, generateJson, runDialogueEvent, recordSourceMemories, validateModelOutput, roleForArm, promptMemories, counterfactuals } = helpers;
const { ARMS: REGISTERED_ARMS, INTERVENTION_TRIPLET } = require('../../../../backend/src/services/socialMetacognitionCampaignService');
const EXECUTABLE_ARMS = Object.freeze([]);
const REQUIRED_CAPTURE_FIELDS = Object.freeze(['verifiedInteractionReceipts', 'independentMemoryRows', 'persistedModelSnapshots', 'delayedDecisionReceipts']);
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])); }
function hash(value) { return sha(JSON.stringify(stable(value))); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--readiness-only') { options.readinessOnly = true; continue; }
    if (token === '--pilot') { options.pilot = true; continue; }
    const eq = token.indexOf('='); const name = token.slice(2, eq < 0 ? undefined : eq); const value = eq < 0 ? argv[++i] : token.slice(eq + 1);
    if (!['seed', 'attempt', 'work-dir', 'model', 'revision'].includes(name) || !value) throw new Error('Invalid V2-06 CLI arguments.');
    options[name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  return options;
}
function modelReadiness(provider, model) {
  const status = provider.getModelStatus(model);
  return { configured: status.configured === true, apiKeyConfigured: status.apiKeyConfigured === true,
    provider: status.provider || null, model: status.modelName || null, reasonCode: status.configured ? null : 'MODEL_PROVIDER_NOT_READY' };
}
function safeFailure(error) { const code = String(error?.code || '').toUpperCase(); return /TIMEOUT/i.test(code + error?.message) ? 'MODEL_PROVIDER_TIMEOUT' : /^(MODEL|SOCIAL|DIALOGUE|MEMORY)_[A-Z0-9_]+$/.test(code) ? code : 'V2_06_RUNNER_STEP_FAILED'; }
function writeJson(file, value, reportRoot = REPORT_ROOT) {
  fs.mkdirSync(path.dirname(file), { recursive: true }); const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  fs.writeFileSync(file, bytes, { flag: 'wx' }); return { path: path.relative(reportRoot, file).split(path.sep).join('/'), sha256: sha(bytes) };
}
function addEvidenceRef(list, ref) { if (!list.some((item) => item.path === ref.path)) list.push(ref); }
function seedAttempt(input) {
  const { seed, requested, pilot = false, reportRoot = REPORT_ROOT } = input;
  const root = pilot ? path.join(reportRoot, 'pilot', seed) : path.join(reportRoot, seed);
  fs.mkdirSync(root, { recursive: true });
  const found = fs.readdirSync(root).map((name) => Number(name.match(/^attempt-(\d+)$/)?.[1] || 0));
  const attempt = requested === undefined ? Math.max(0, ...found) + 1 : Number(requested);
  const dir = path.join(root, `attempt-${String(attempt).padStart(3, '0')}`); fs.mkdirSync(dir);
  return { attempt, dir };
}
function artifact({ context, kind, arm, name, data }) {
  const value = { schemaVersion: 1, kind, campaignId: context.campaignId, scenario: 'V2-06', seed: context.seed,
    attempt: context.attempt, caseId: context.caseData.caseId, sourceCommit: context.sourceCommit,
    configHash: context.configHash, arm, ...data };
  const ref = writeJson(path.join(context.dir, name), value, context.reportRoot);
  if (context.refs[arm]) context.refs[arm].push(ref);
  if (context.report) {
    addEvidenceRef(context.report.evidenceRefs, ref);
    if (context.report.arms[arm]) addEvidenceRef(context.report.arms[arm].evidenceRefs, ref);
  }
  return ref;
}
function factors(protocol) { return { contextHash: hash(protocol.delayedDecision.context),
  budgetHash: hash({ tokenBudget: TOKEN_BUDGET, maxTurns: MAX_TURNS, maxTokens: MAX_TOKENS }),
  permissionHash: hash(protocol.delayedDecision.permissionPolicy) }; }
function decisionHash(decision) {
  const { receipt, ...fields } = decision;
  return hash({ ...fields, receiptId: receipt.receiptId, createdAt: receipt.createdAt,
    sourceCommit: receipt.sourceCommit, configHash: receipt.configHash,
    invocationId: receipt.invocationId, promptHash: receipt.promptHash });
}
async function intervention({ db, context, arm, memories }) {
  const runtime = require('../../../../backend/src/services/socialMentalModelRuntimeService');
  const modes = { 'genos-full': 'baseline', 'genos-social-memory-ablated': 'mask-social-memories',
    'genos-social-memory-counterfactual': 'counterfactual-social-memories' };
  const mode = modes[arm]; const selectedMemoryIds = mode === 'baseline' ? [] : memories.map((m) => m.id);
  const replacements = mode === 'counterfactual-social-memories'
    ? counterfactuals(memories, context.protocol, context.sourceEventKeyByMemoryId) : undefined;
  if (!mode) return { beforeMemories: context.entries, afterMemories: context.entries, memories, artifact: null, receipt: null };
  return runtime.createPersistedSocialMemoryIntervention(db, { ...context.scope, ...context.pair,
    interventionId: `${context.seed}-${arm}-${context.attempt}`, arm, seed: context.seed,
    minimumIndependentMemories: context.protocol.minimumIndependentMemories,
    requiredPolarityCounts: context.protocol.requiredPolarityCounts,
    sourceCommit: context.sourceCommit, configHash: context.configHash, mode, selectedMemoryIds, replacementMemories: replacements });
}
async function oneArm({ db, context, arm, index }) {
  const role = roleForArm(arm); const interventionResult = await intervention({ db, context, arm, memories: context.memories });
  const visible = interventionResult.memories; const providerInput = { model: context.model, temperature: context.config.temperature, seed: Number(context.seed.slice(-2)) * 1000 + index * 10,
    agentId: context.pair.subjectAgentId, organizationId: context.scope.organizationId, projectId: context.scope.projectId };
  const sourcePrompt = helpers.sourceModelPrompt({ ...context.pair, memories: promptMemories(visible), absenceReceiptId: interventionResult.receipt?.receiptId || '' });
  const modelInvocation = { invocationId: crypto.randomUUID(), promptHash: sha(JSON.stringify(sourcePrompt)),
    provenance: 'GenOS modelProvider local invocation' };
  const modelResult = await generateJson(context.provider, { ...providerInput, prompt: sourcePrompt });
  const model = modelResult.parsed; validateModelOutput({ model, input: context, visibleMemories: visible, role });
  let modelState = null; let decisionModel = model;
  if (['baseline', 'masked', 'counterfactual'].includes(role)) {
    const runtime = require('../../../../backend/src/services/socialMentalModelRuntimeService');
    const saved = await runtime.persistVerifiedSocialMentalModel(db, { ...context.scope, ...context.pair,
      snapshotId: `${context.seed}-${arm}-model`, revision: index + 1,
      interventionId: interventionResult.receipt.interventionId, model });
    decisionModel = saved.snapshot.model;
    modelState = { snapshotId: saved.snapshot.snapshotId, revision: saved.snapshot.revision,
      modelHash: saved.snapshot.modelHash, sourceMemoryIds: model.sourceMemoryIds };
  }
  const decisionPrompt = helpers.decisionPrompt({ model: decisionModel, delayedContext: context.protocol.delayedDecision.context,
    permissionPolicy: context.protocol.delayedDecision.permissionPolicy,
    decisionPolicy: context.protocol.decisionPolicy || context.caseData.decisionPolicy });
  const decisionInvocation = { invocationId: crypto.randomUUID(), promptHash: sha(JSON.stringify(decisionPrompt)),
    provenance: 'GenOS modelProvider local invocation' };
  const decisionResult = await generateJson(context.provider, { ...providerInput, seed: providerInput.seed + 1, prompt: decisionPrompt });
  const proposed = decisionResult.parsed; const refs = proposed.memoryReferences;
  if (!ACTIONS.includes(proposed.action) || !Array.isArray(refs) || refs.some((id) => !visible.some((m) => m.id === id))) throw Object.assign(new Error('Invalid proposed decision.'), { code: 'MODEL_DECISION_INVALID' });
  const decision = { action: proposed.action, memoryReferences: refs, ...context.sharedFactors };
  const rec = { receiptId: `v2-06:${context.seed}:${arm}:${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(), sourceCommit: context.sourceCommit, configHash: context.configHash,
    invocationId: decisionInvocation.invocationId, promptHash: decisionInvocation.promptHash };
  decision.receipt = { ...rec, hash: decisionHash({ ...decision, receipt: rec }) };
  const decisionOutput = { action: proposed.action, memoryReferences: refs };
  return { role, intervention: interventionResult, model, modelState, decision,
    provider: modelResult.response.provider, servedModel: modelResult.response.servedModel,
    modelResponseId: modelResult.response.usageReceipt?.responseId || null,
    modelInvocation: { ...modelInvocation, parsedOutputHash: sha(JSON.stringify(model)) },
    decisionOutput, decisionProvenance: { provider: decisionResult.response.provider,
      servedModel: decisionResult.response.servedModel, responseId: decisionResult.response.usageReceipt?.responseId || null,
      ...decisionInvocation, parsedOutputHash: sha(JSON.stringify(decisionOutput)) } };
}
function emptyArm(arm) { return { role: roleForArm(arm), status: 'inconclusive', reasonCode: 'NOT_RUN', limitations: ['Arm was not executed.'], model: null, modelState: null, decision: null, interventionReceipt: null, evidenceRefs: [] }; }
function reportBase(c) { return { campaignId: c.campaignId, scenario: 'V2-06', arm: 'genos-full', seed: c.seed,
  ...(c.pilot ? { pilot: true } : {}),
  attempt: c.attempt, sourceCommit: c.sourceCommit, runtimeVersion: helpers.runtimeVersion(), model: c.model, config: c.config,
  configHash: c.configHash, caseId: c.caseData.caseId, caseHash: c.caseHash, sharedFactors: c.sharedFactors,
  status: 'inconclusive', reasonCode: 'RUN_INCOMPLETE', startedAt: c.startedAt, durationMs: 0,
  inputs: { experienceProtocolHash: c.protocolHash }, observed: {}, oracle: { status: 'inconclusive', caseId: c.caseData.caseId, reasons: [] },
  evidenceRefs: [], violations: [], limitations: ['A complete, oracle-valid pilot has not been produced.'], arms: Object.fromEntries(ARM_KEYS.map((a) => [a, emptyArm(a)])) }; }
function persistArmArtifacts(c, arm, result) {
  const refs = c.refs[arm]; const before = result.intervention.beforeMemories; const after = result.intervention.afterMemories;
  const beforeRef = artifact({ context: c, kind: 'persisted-memory-snapshot', arm, name: `${arm}/memory-before.json`, data: { phase: 'before', persisted: true, readBack: true, snapshotId: `${c.seed}-${arm}-before`, memories: before } });
  const afterRef = artifact({ context: c, kind: 'persisted-memory-snapshot', arm, name: `${arm}/memory-after.json`, data: { phase: 'after', persisted: true, readBack: true, snapshotId: `${c.seed}-${arm}-after`, memories: after } });
  const decisionRef = artifact({ context: c, kind: 'decision-receipt', arm, name: `${arm}/decision.json`, data: {
    decision: result.decision, modelOutput: result.decisionOutput, modelProvenance: result.decisionProvenance } });
  const modelOutputRef = artifact({ context: c, kind: 'model-output', arm, name: `${arm}/model-output.json`, data: {
    model: result.model, provider: result.provider, servedModel: result.servedModel,
    responseId: result.modelResponseId, ...result.modelInvocation } });
  if (result.modelState) artifact({ context: c, kind: 'social-model-snapshot', arm, name: `${arm}/model-snapshot.json`, data: {
    snapshotId: result.modelState.snapshotId, revision: result.modelState.revision, modelHash: result.modelState.modelHash,
    sourceMemoryIds: result.model.sourceMemoryIds, model: result.model } });
  if (result.intervention.receipt) {
    artifact({ context: c, kind: 'intervention-receipt', arm, name: `${arm}/intervention.json`, data: { readBack: true,
      artifact: result.intervention.artifact, receipt: result.intervention.receipt, before, after } });
  }
  const ir = result.intervention.receipt;
  const interventionReceipt = ir ? { interventionId: ir.interventionId, mode: result.intervention.artifact.mode,
    removedMemoryIds: result.intervention.artifact.removedMemoryIds, addedMemoryIds: result.intervention.artifact.addedMemoryIds,
    beforeHash: result.intervention.artifact.before.memorySetHash, afterHash: result.intervention.artifact.after.memorySetHash,
    preservedNonSocialMemoryHash: result.intervention.artifact.preservedNonSocialMemoryHash } : null;
  c.report.arms[arm] = { role: result.role, status: 'pass', reasonCode: null,
    limitations: ['Decisions are model proposals, not executed actions.'],
    model: { id: c.model, provider: result.provider, parsedOutput: result.model }, modelState: result.modelState,
    decision: result.decision, interventionReceipt, evidenceRefs: [...new Map(refs.map((r) => [r.path, r])).values()] };
  return [beforeRef, afterRef, decisionRef, modelOutputRef];
}
function completeReport(c) {
  const evaluator = require('../../../../backend/src/services/socialMetacognitionCampaignService');
  const mapped = Object.fromEntries([['baseline', 'genos-full'], ['masked', 'genos-social-memory-ablated'],
    ['counterfactual', 'genos-social-memory-counterfactual']].map(([key, arm]) => [key, {
    model: c.report.arms[arm].model.parsedOutput,
    decision: { ...c.report.arms[arm].decision, receiptId: c.report.arms[arm].decision.receipt.receiptId },
    interventionReceipt: c.report.arms[arm].interventionReceipt || { mode: 'baseline' },
  }]));
  const result = evaluator.evaluateSocialMetacognition({ arms: mapped, expectedActions: c.caseData.expectedActions });
  c.report.status = result.status; c.report.reasonCode = result.status === 'pass' ? null : 'V2_06_ORACLE_NOT_PASSED';
  c.report.oracle = { status: result.status, caseId: c.caseData.caseId, reasons: result.reasons };
  c.report.observed = { armActions: Object.fromEntries(ARM_KEYS.map((arm) => [arm, c.report.arms[arm].decision.action])) };
  c.report.limitations = [...new Set(ARM_KEYS.flatMap((arm) => c.report.arms[arm].limitations))];
  c.report.evidenceRefs = [...new Map(ARM_KEYS.flatMap((arm) => c.report.arms[arm].evidenceRefs).map((ref) => [ref.path, ref])).values()];
}
async function execute(c) {
  const dbModule = require('../../../../backend/src/db'); const dbFile = path.join(c.workDir, `${c.seed}-attempt-${c.attempt}.sqlite`);
  if (fs.existsSync(dbFile)) throw new Error('Temporary database already exists.');
  fs.mkdirSync(c.workDir, { recursive: true }); const db = await dbModule.getDatabase(dbFile);
  try {
    const sources = await recordSourceMemories(db, c);
    const sourcesRef = artifact({ context: c, kind: 'verified-social-memory-sources', arm: 'source-experiences',
      name: 'verified-social-memory-sources.json', data: { protocolHash: c.protocolHash, sources } });
    for (const arm of ARM_KEYS) {
      c.refs[arm].push(sourcesRef);
      addEvidenceRef(c.report.evidenceRefs, sourcesRef);
      addEvidenceRef(c.report.arms[arm].evidenceRefs, sourcesRef);
    }
    const runtime = require('../../../../backend/src/services/socialMentalModelRuntimeService');
    const loaded = await runtime.loadVerifiedSocialMemories(db, { ...c.scope, ...c.pair,
      minimumIndependent: c.protocol.minimumIndependentMemories || 4,
      requiredPolarityCounts: c.protocol.requiredPolarityCounts });
    c.memories = loaded.socialMemories; c.entries = loaded.memories; c.results = {};
    c.sourceEventKeyByMemoryId = new Map(sources.map((source) => [source.memoryId, source.eventKey]));
    const authority = require('../../../../backend/src/services/socialAuthorityCheckRuntimeService');
    const checkId = `socialworld-v2-06:${c.seed}:${c.attempt}:${crypto.randomUUID()}`;
    await authority.beginSocialAuthorityCheck(db, { checkId, ...c.scope,
      subjectAgentIds: [c.pair.subjectAgentId, c.pair.otherAgentId], arm: 'V2-06-seed', seed: c.seed });
    for (let i = 0; i < ARM_KEYS.length; i += 1) {
      const arm = ARM_KEYS[i]; c.results[arm] = await oneArm({ db, context: c, arm, index: i }); persistArmArtifacts(c, arm, c.results[arm]);
    }
    const checked = await authority.completeSocialAuthorityCheck(db, { checkId });
    if (!checked.valid || !checked.readBack) throw Object.assign(new Error('Authority read-back detected a protected state change.'), { code: 'SOCIAL_AUTHORITY_CHECK_FAILED' });
    const authorityRef = artifact({ context: c, kind: 'authority-check', arm: 'seed-authority',
      name: 'authority-check.json', data: { readBack: true, artifact: checked.artifact,
        artifactHash: checked.artifactHash, organizationId: c.scope.organizationId,
        projectId: c.scope.projectId, seed: c.seed, checkId,
        scenarioPermissionHash: c.sharedFactors.permissionHash } });
    for (const arm of ARM_KEYS) {
      c.refs[arm].push(authorityRef);
      addEvidenceRef(c.report.evidenceRefs, authorityRef);
      addEvidenceRef(c.report.arms[arm].evidenceRefs, authorityRef);
    }
    completeReport(c);
  } finally { await dbModule.closeDatabase(); }
}
async function executeOrRecord(context, readiness) {
  context.report.inputs.providerReady = readiness.configured && readiness.apiKeyConfigured;
  if (!readiness.configured || !readiness.apiKeyConfigured) {
    context.report.reasonCode = readiness.reasonCode || 'MODEL_PROVIDER_NOT_READY'; return;
  }
  try { await execute(context); } catch (error) {
    context.report.reasonCode = safeFailure(error); context.report.violations = [context.report.reasonCode];
    context.report.limitations = ['No passing claim is made for incomplete or invalid runtime evidence.'];
  }
}
function loadCampaign(revision) {
  const campaignDir = revision === '2' ? path.resolve(__dirname, '../socialworld-v2-r2') : __dirname;
  const reportRoot = path.join(campaignDir, 'reports'); const manifestFile = path.join(campaignDir, 'manifest.json');
  const manifest = readJson(manifestFile); const protocolFile = path.join(campaignDir, 'V2-06-experiences.json');
  const caseFile = path.join(campaignDir, manifest.scenarios.find((item) => item.id === 'V2-06')?.caseFile || 'V2-06-case.json');
  return { campaignId: manifest.campaignId, manifest, reportRoot, protocolFile, caseFile,
    protocol: readJson(protocolFile), caseData: readJson(caseFile) };
}
function selectSeed(options, manifest) {
  const seed = options.pilot ? `pilot-${crypto.randomUUID()}` : options.seed;
  if (!options.pilot && !manifest.seeds.includes(seed)) throw new Error('Seed must be registered in the campaign manifest.');
  return seed;
}
function validateWorkDirectory(value) {
  if (!value || !path.isAbsolute(value)) throw new Error('--work-dir must be an absolute path outside the repository.');
}
function buildContext(input) {
  const { options, campaign, seed, attempt, dir, startedAt, provider, model } = input;
  const { manifest, protocol, caseData, protocolFile, caseFile, reportRoot } = campaign;
  const workDir = helpers.allocateWorkDirectory(options.workDir, `${manifest.campaignId}-${seed}`, attempt);
  const config = { model, organizationId: `socialworld-v2-06-${seed}`,
    projectId: `socialworld-v2-06-${seed}`, temperature: 0.2, responseFormat: 'json_object',
    timeoutMs: 180000, maxTokens: MAX_TOKENS,
    experienceProtocol: protocol.protocolVersion, budget: { tokenBudget: TOKEN_BUDGET, maxTurns: MAX_TURNS } };
  return { seed, campaignId: campaign.campaignId, reportRoot, pilot: options.pilot === true, attempt, dir, startedAt,
    provider, model, protocol, caseData, workDir,
    sourceCommit: helpers.sourceCommit(), protocolHash: sha(fs.readFileSync(protocolFile)), caseHash: sha(fs.readFileSync(caseFile)),
    config, configHash: hash(config), sharedFactors: factors(protocol),
    seedNumber: options.pilot ? 2026 : Number(seed.slice(-2)),
    pair: { subjectAgentId: `${protocol.participants.subject}-${seed}`, otherAgentId: `${protocol.participants.other}-${seed}` },
    scope: { organizationId: `socialworld-v2-06-${seed}`, projectId: `socialworld-v2-06-${seed}` },
    refs: Object.fromEntries(ARM_KEYS.map((arm) => [arm, []])) };
}
async function runV206(options, provider = require('../../../../backend/src/services/modelProvider')) {
  const campaign = loadCampaign(options.revision); const { reportRoot } = campaign;
  const seed = selectSeed(options, campaign.manifest);
  const model = options.model || process.env.GENOS_DEFAULT_MODEL; const readiness = modelReadiness(provider, model);
  if (options.readinessOnly) return { readiness };
  validateWorkDirectory(options.workDir);
  const { attempt, dir } = seedAttempt({ seed, requested: options.attempt, pilot: options.pilot, reportRoot });
  const startedAt = new Date().toISOString();
  const context = buildContext({ options, campaign, seed, attempt, dir, startedAt, provider, model });
  context.report = reportBase(context); await executeOrRecord(context, readiness);
  context.report.durationMs = Date.now() - Date.parse(startedAt);
  const file = path.join(dir, 'report.json'); fs.writeFileSync(file, `${JSON.stringify(context.report, null, 2)}\n`, { flag: 'wx' });
  return { ...context.report, reportPath: path.relative(reportRoot, file).split(path.sep).join('/') };
}
async function runScenario(input) {
  if (!REGISTERED_ARMS.includes(input.arm)) throw new Error(`Unknown V2-06 arm: ${input.arm}`);
  const capture = input.capture || {};
  const missing = REQUIRED_CAPTURE_FIELDS.filter((field) => !Array.isArray(capture[field]) || capture[field].length === 0);
  const reason = missing.length ? `Missing runtime capture fields: ${missing.join(', ')}` : `V2-06 generic capture execution is not implemented for arm ${input.arm}.`;
  const startedAt = new Date().toISOString();
  const report = { campaignId: 'socialworld-v2', scenario: 'V2-06', arm: input.arm, seed: input.seed,
    attempt: input.attempt, sourceCommit: input.sourceCommit || 'unknown', runtimeVersion: '3', model: null,
    configHash: hash({ caseId: 'socialworld-v2-06-case-01', seed: input.seed }), status: 'inconclusive', startedAt,
    durationMs: 0, inputs: { captureProvided: Boolean(input.capture), registeredArms: REGISTERED_ARMS, interventionTriplet: INTERVENTION_TRIPLET },
    observed: { capturedEvidenceFields: REQUIRED_CAPTURE_FIELDS.filter((field) => Array.isArray(capture[field])) },
    oracle: { recalculable: false, status: 'inconclusive', reason }, evidenceRefs: [], violations: [], limitations: [reason] };
  return { report, evidence: { scenario: 'V2-06', arm: input.arm, seed: input.seed,
    captureAccepted: false, missingCaptureFields: missing,
    note: 'No synthetic memory, model or decision records are promoted to runtime evidence.' }, comparison: {} };
}
async function main() {
  try {
    const options = parseArgs(process.argv.slice(2)); const provider = require('../../../../backend/src/services/modelProvider');
    if (options.readinessOnly) { const r = modelReadiness(provider, options.model); process.stdout.write(`${JSON.stringify({ ready: r.configured && r.apiKeyConfigured, provider: r.provider, model: r.model })}\n`); return; }
    if ((!options.seed && !options.pilot) || (options.seed && options.pilot) || !options.workDir) throw new Error('Provide either --seed or --pilot, plus --work-dir.');
    const result = await runV206(options); process.stdout.write(`${JSON.stringify({ seed: result.seed, attempt: result.attempt, status: result.status, reasonCode: result.reasonCode, reportPath: result.reportPath })}\n`);
    if (result.status !== 'pass') process.exitCode = 2;
  } catch (error) { process.stderr.write(`${safeFailure(error)}\n`); process.exitCode = 2; }
}
if (require.main === module) main();
module.exports = { runV206, parseArgs, modelReadiness, parseJsonResponse, safeFailure, REGISTERED_ARMS,
  EXECUTABLE_ARMS, INTERVENTION_TRIPLET, runScenario, ...helpers, stableHash: hash };
