'use strict';

const crypto = require('crypto');
const { workerToolLeaseForCapabilities, emit } = require('../agentOrchestrationState');
const { generateAgentIdentity } = require('../agentIdentityService');
const { createConscienceState, formatConsciencePrompt } = require('../agentConscienceService');
const { buildWorkerSelf, formatWorkerSelfPrompt } = require('../workerSelfService');
const { createIsolatedWorkspace } = require('../agentWorkspaceLifecycleService');
const { localWorkerRoute } = require('../agentModelRoutingService');
const { restrictProvidedLease, normalizeToolName } = require('../toolLeasePolicy');
const { workerGenesForAssignment } = require('../agentDnaStore');
const { evolveWorkerGenome } = require('../agentEvolutionService');
const { resolveGenotype } = require('../morphogenesis/genotypeResolverService');
const { formatPhenotypePrompt } = require('../cognitivePhenotypeService');
const { buildExpressionContext } = require('./agentExpressionContextService');
const { initClinicalState } = require('../medical/clinicalStateService');
const { surveillanceScan } = require('../medical/immuneSurveillanceService');
const workerKinds = require('./workerKindService');

function uuid() { return crypto.randomUUID(); }
function safeArray(v) { return Array.isArray(v) ? v : []; }

function intersectLease(dnaTools, baseLease) {
  if (!Array.isArray(dnaTools) || dnaTools.length === 0) return baseLease;
  const allowed = new Set(dnaTools.map((t) => String(t)));
  return baseLease.filter((t) => allowed.has(String(t)));
}

function stripOrchestrate(lease) { return lease.filter((t) => normalizeToolName(t) !== 'genosorchestrate'); }

function agentIdFor(parent, request) {
  if (request.agentId) return request.agentId;
  if (parent.id) return `${parent.id}-w${uuid().slice(0, 8)}`;
  return `agent-${uuid().slice(0, 12)}`;
}

function safeParent(ctx, request) {
  return ctx.parent || request.parent || {};
}

function strategyFields(strategy) {
  const primary = strategy.primary || 'tree-search';
  return { primary, strategy: primary };
}

function computeCognitiveBudget(parent, request, workerCount) {
  const count = Math.max(1, workerCount || 1);
  const share = request.budget?.cognitiveShare || 0.6;
  return ((parent.cognitive_budget || 100) * share) / count;
}

async function buildDna(ctx) {
  const { db, parent, request } = ctx;
  const scope = {
    organizationId: parent?.organization_id || request?.workspace?.organizationId,
    projectId: parent?.project_id || request?.workspace?.projectId
  };
  const requirements = {
    domain: request.role,
    traits: safeArray(request.capabilityManifest?.owned),
    constraints: safeArray(request.phenotype?.constraints),
    mission: request.mission?.prompt || ''
  };
  try {
    const decision = await resolveGenotype({ requirements, availableGenomes: [], db });
    if (decision.action === 'reuse' && decision.genomeRef) {
      const assignment = {
        role: request.role,
        capabilities: safeArray(request.capabilityManifest?.owned),
        mission: request.mission?.prompt || '',
        genomeRef: decision.genomeRef,
        preferredName: request.phenotype?.preferredName,
        tools: safeArray(request.phenotype?.tools)
      };
      return await workerGenesForAssignment(db, { ...assignment, agentId: parent?.id }, scope);
    }
  } catch (_) { /* Fall through to legacy path */ }
  const assignment = {
    role: request.role,
    capabilities: safeArray(request.capabilityManifest?.owned),
    mission: request.mission?.prompt || '',
    genomeRef: request.phenotype?.genomeRef,
    preferredName: request.phenotype?.preferredName,
    tools: safeArray(request.phenotype?.tools)
  };
  try { return await workerGenesForAssignment(db, { ...assignment, agentId: parent?.id }, scope); }
  catch (_) { return null; }
}

function dnaAuthority(sel) {
  if (!sel) return null;
  return { genes: sel.genes, genomeRef: sel.genomeRef, dnaGenomeRef: sel.genomeRef, genomeContentHash: sel.genomeContentHash, source: 'agent_dna_authority', predictedFitness: null };
}

function dnaPromptBlock(sel) {
  if (!sel?.genes?.role) return null;
  const { genes } = sel;
  const p = [`Inherited DNA phenotype — role: ${genes.role}, strategy: ${genes.strategy}.`];
  if (genes.prompt) p.push(`DNA prompt brief: ${genes.prompt}`);
  if (Array.isArray(genes.tools) && genes.tools.length) p.push(`DNA tools: ${genes.tools.join(', ')}.`);
  if (Array.isArray(genes.capabilities) && genes.capabilities.length) p.push(`DNA capabilities: ${genes.capabilities.join(', ')}.`);
  return p.join(' ');
}

async function buildSelf(ctx) {
  const { db, agentId, request } = ctx;
  try {
    const ws = await buildWorkerSelf(db, {
      agentId, workerRole: request.role,
      workerContext: { mission: request.mission?.prompt, hypothesis: request.mission?.hypothesis, capabilities: request.capabilityManifest?.owned }
    });
    return formatWorkerSelfPrompt(ws);
  } catch (_) { return ''; }
}

function restrictByTools(dnaSelection, base) {
  if (dnaSelection?.genes?.tools) return intersectLease(dnaSelection.genes.tools, base);
  return base;
}

function restrictByPhenotype(request, base) {
  if (request.phenotype?.tools?.length) return intersectLease(request.phenotype.tools, base);
  return base;
}

function computeLease(ctx) {
  const { request, dnaSelection, providedLease } = ctx;
  const caps = safeArray(request.capabilityManifest?.owned);
  const base = workerToolLeaseForCapabilities(request.role, caps);
  const afterDna = restrictByTools(dnaSelection, base);
  const afterPheno = restrictByPhenotype(request, afterDna);
  const final = providedLease ? restrictProvidedLease(providedLease, afterPheno) : afterPheno;
  return request.workerContract?.authority?.execute === false ? [] : stripOrchestrate(final);
}

function promptMissionLines(mission) {
  const lines = [];
  if (mission.prompt || mission.currentTask) lines.push(mission.prompt || mission.currentTask);
  else lines.push('Autonomous task execution');
  if (mission.label) lines.push(`Assigned branch: ${mission.label}.`);
  if (mission.hypothesis) lines.push(`Hypothesis: ${mission.hypothesis}.`);
  return lines;
}

function promptBudgetLine(request) {
  if (!request.budget) return null;
  return `Budget allocation: ${request.budget.tokens || 'unconstrained'} tokens.`;
}

function buildPrompt(ctx) {
  const { identity, conscience, selfBlock, request, dnaSelection } = ctx;
  const mission = request.mission || {};
  const phenotype = request.phenotype || {};
  const lines = [identity.introduction, selfBlock || null, formatConsciencePrompt(conscience)];
  lines.push(...promptMissionLines(mission));
  lines.push(`Worker kind: ${request.workerKind}. ${workerKinds.promptRule(request.workerKind)}`);
  lines.push(workerKinds.evidenceRule(request.workerContract));
  const dnaBlock = dnaPromptBlock(dnaSelection);
  if (dnaBlock) lines.push(dnaBlock);
  if (request.capabilityManifest?.owned?.length) lines.push(`Owned capabilities: ${request.capabilityManifest.owned.join(', ')}.`);
  if (phenotype.cognitiveRecipe) lines.push(formatPhenotypePrompt(phenotype.cognitiveRecipe));
  if (phenotype.artifact === 'creative') lines.push('Creative evidence must include artifact=\"creative\", artifactText, and creativeEvaluation with a 0..1 rubric for craft, coherence, originality, emotionalImpact, and constraintCoverage; include revisions and criticEvidence when available.');
  const budgetLine = promptBudgetLine(request);
  if (budgetLine) lines.push(budgetLine);
  return lines.filter(Boolean).join('\n');
}

function useVfsWorkspace(request, role) {
  if (request.mission?.vfsWorkspace === true) return true;
  return !/coder|developer|implementation/i.test(role);
}

async function setupWorkspace(ctx) {
  const { agentId, parent, request } = ctx;
  const sourceWorkspace = parent?.workspace_path || request?.workspace?.root;
  const role = request.role || 'worker';
  const isVfs = useVfsWorkspace(request, role);
  try {
    return await createIsolatedWorkspace(sourceWorkspace, agentId, {
      capsuleRoot: request.mission?.capsuleRoot, vfs: request.mission?.executionPolicy?.allowFileEdits !== true || isVfs
    });
  } catch (_) { return null; }
}

function authorityConstraints(ap) {
  return {
    constraints: ap.constraints || {},
    maxBlastRadius: ap.maxBlastRadius || 0.4,
    allowFileEdits: ap.allowFileEdits === true,
    allowNetworkAccess: ap.allowNetworkAccess || false
  };
}

function setupAuthority(ctx) {
  const { request, agentId, lease } = ctx;
  const ap = request.authorityProfile || {};
  const workerContract = request.workerContract;
  const ac = authorityConstraints({ ...ap, allowFileEdits: ap.allowFileEdits === true && workerContract?.authority?.write === true });
  return {
    agentId, executionMode: 'worker', role: request.role, workerKind: request.workerKind, workerContract, toolLease: lease,
    parentAgentId: request.parentAgentId,
    scope: { organizationId: request.workspace?.organizationId, projectId: request.workspace?.projectId },
    constraints: ac.constraints, maxBlastRadius: ac.maxBlastRadius,
    allowFileEdits: ac.allowFileEdits, allowNetworkAccess: ac.allowNetworkAccess,
    evidenceContract: request.evidenceContract || null, strategyContract: request.strategyContract || null,
    topologyMembership: request.topologyMembership || null, relations: request.relations || [],
    permittedToolSet: new Set(lease.map(normalizeToolName)),
    maxTokenBudget: request.budget?.tokens || ap.maxTokenBudget || 0
  };
}

function descriptorIdentity(d) {
  return { agentId: d.agentId, name: d.identity.name, nameMeaning: d.identity.name_meaning, introduction: d.identity.introduction, role: d.request.role, executionMode: 'worker', parentAgentId: d.request.parentAgentId, parentName: d.request.parent?.name || null };
}

function descriptorRuntime(d) {
  const mission = d.request.mission || {};
  const parent = d.request.parent || {};
  return {
    prompt: d.prompt, toolLease: d.lease, workspaceRoot: d.workspaceRoot, workspaceProvisioned: Boolean(d.workspaceRoot),
    localModel: d.route?.selectedModel || null, localRoutingPolicy: d.route?.policy || null, localRoutingCriteria: d.route?.criteria || null,
    localRuntime: Boolean(mission.localRuntime || mission.executor === 'local'),
    modelTier: d.request.modelTier || parent.model_tier || 'standard', agentType: parent.agent_type || 'GenOS'
  };
}

function descriptorGenome(d) {
  return {
    cognitiveRecipe: d.request.phenotype?.cognitiveRecipe || null, genome: d.evolution?.genes || null,
    genomeRef: d.evolution?.genomeRef || d.evolution?.dnaGenomeRef || null,
    phenotypeHash: d.dnaSelection ? crypto.createHash('sha256').update(JSON.stringify(d.dnaSelection.genes)).digest('hex').slice(0, 16) : null,
    dnaAuthority: Boolean(d.dnaSelection), predictedFitness: d.evolution?.predictedFitness || null
  };
}

function descriptorMission(d) {
  const mission = d.request.mission || {};
  const phenotype = d.request.phenotype || {};
  return {
    prompt: mission.prompt || mission.currentTask || null,
    label: mission.label || null,
    hypothesis: mission.hypothesis || null,
    artifact: mission.artifact || phenotype.artifact || null
  };
}

function descriptorContracts(d) {
  const strategy = strategyFields(d.request.strategyContract || {});
  const mission = descriptorMission(d);
  return {
    budget: d.request.budget || null, authorityProfile: d.authorityProfile,
    workerKind: d.request.workerKind, workerContract: d.request.workerContract,
    topologyMembership: d.request.topologyMembership || null, relations: d.request.relations || [],
    evidenceContract: d.request.evidenceContract || null,
    strategyContract: strategy, mission
  };
}

function descriptorMetadata(d) {
  const parent = d.request.parent || {};
  return {
    conscienceState: { dissonanceLevel: d.conscience.dissonanceLevel, eurekaMoments: d.conscience.eurekaMoments, currentBudget: d.conscience.currentBudget, isApoptotic: d.conscience.isApoptotic },
    executor: d.request.mission?.executor || null, provider: d.request.mission?.provider || null,
    isolationMode: parent.isolation_mode || 'Branch', fleetId: parent.fleet_id || null, workspaceId: parent.workspace_id || null,
    generatedAt: new Date().toISOString()
  };
}

function descriptorExpressionContext(d) {
  const ec = d.expressionContext;
  if (!ec) return { expressionContext: null };
  return {
    expressionContext: {
      agentId: ec.agentId, phenotype: ec.phenotype, capabilities: ec.capabilities,
      budget: ec.budget, uncertainty: ec.uncertainty, currentPressure: ec.currentPressure, builtAt: ec.builtAt
    }
  };
}

function composeDescriptor(ctx) {
  return {
    ...descriptorIdentity(ctx),
    ...descriptorRuntime(ctx),
    ...descriptorGenome(ctx),
    ...descriptorContracts(ctx),
    ...descriptorMetadata(ctx),
    ...descriptorExpressionContext(ctx)
  };
}

async function tryEvolveFallback(parent, request, db) {
  try { return await evolveWorkerGenome(parent || {}, { role: request.role }, { strategy: request.strategyContract?.primary || 'tree-search', db }); }
  catch (_) { return null; }
}

async function tryRoute(ctx) {
  const { db, parent, request } = ctx;
  try { return await localWorkerRoute({ db, agentId: parent.id, role: request.role, modelTier: request.modelTier || parent.model_tier, tenant: { organizationId: parent.organization_id || request.workspace?.organizationId, projectId: parent.project_id || request.workspace?.projectId } }); }
  catch (_) { return { selectedModel: null, policy: null, criteria: null }; }
}

function emitIncarnation(params) {
  const { parent, identity, role, summary } = params;
  const message = `Agent '${identity.name}' incarnated as ${role}.`;
  try { emit(parent.id || 'system', 'AGENT_INCARNATED', 'INCARNATION', message, summary, 'info'); }
  catch (_) {}
}

async function initClinicalAndScan(db, agentId) {
  try {
    await initClinicalState(db, agentId);
    await surveillanceScan(db, agentId, {});
  } catch (_) { /* medical runtime best-effort */ }
}

async function incarnateAgent(opts) {
  if (!opts || !opts.request || !opts.request.role) throw new Error('incarnateAgent requires opts.request.role');
  const request = { ...opts.request };
  request.workerKind = workerKinds.resolveWorkerKind(request.workerKind, request.role);
  request.workerContract = workerKinds.buildWorkerContract(request.workerKind, {
    ...request.mission, orchestratorAgentId: request.parentAgentId,
    scope: request.mission?.scope || request.workspace?.root || request.workspace?.projectId
  });
  const c = opts.ctx || {};
  const db = c.db;
  const parent = safeParent(c, request);
  const agentId = agentIdFor(parent, request);
  const dnaSelection = await buildDna({ db, parent, request });
  let evolution = dnaAuthority(dnaSelection);
  if (!evolution) evolution = await tryEvolveFallback(parent, request, db);
  const selfBlock = await buildSelf({ db, agentId, request });
  const lease = computeLease({ request, dnaSelection, providedLease: request.providedLease });
  const identity = generateAgentIdentity({ preferredName: request.phenotype?.preferredName, role: request.role, excludeNames: c.usedNames || [], stableKey: agentId });
  const cognitiveBudget = computeCognitiveBudget(parent, request, c.workerCount);
  const conscience = createConscienceState({ currentBudget: cognitiveBudget, baselineBudget: cognitiveBudget });
  const prompt = buildPrompt({ identity, conscience, selfBlock, request, lease, dnaSelection });
  const workspaceRoot = await setupWorkspace({ agentId, parent, request });
  const authorityProfile = setupAuthority({ request, agentId, lease });
  const route = await tryRoute({ db, parent, request });
  let expressionContext = null;
  try {
    expressionContext = await buildExpressionContext({
      agentId, db, parentOrchestrator: parent,
      mission: request.mission, assignment: request
    });
  } catch (_) { expressionContext = null; }
  const descriptor = composeDescriptor({ agentId, identity, request, lease, workspaceRoot, authorityProfile, evolution, dnaSelection, route, prompt, conscience, expressionContext });
  const incSummary = { agentId, role: request.role, workerKind: request.workerKind, leaseCount: lease.length };
  emitIncarnation({ parent, identity, role: request.role, summary: incSummary });
  await initClinicalAndScan(db, agentId);
  return descriptor;
}

module.exports = { incarnateAgent, buildDna, computeLease, setupAuthority, setupWorkspace, initClinicalState, surveillanceScan };
