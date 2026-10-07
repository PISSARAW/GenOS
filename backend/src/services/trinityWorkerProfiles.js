'use strict';

const kinds = require('./agents/workerKindService');
const native = require('./agents/workerExecutorRegistry');

const RECIPES = new Set(['direct', 'planned', 'self_correcting', 'adversarial']);
const TECHNICAL = /\b(?:architecture|microservices|cqrs|event[ -]sourcing|messagerie|distributed|distribu[ée]|software|logiciel|database|algorithme|algorithm|code|backend)\b/i;
const ROLES = ['basic_implementation', 'interview_plan_implementation', 'self_correcting_implementation'];
const HYPOTHESES = [
  'Produce an independent technical candidate with explicit assumptions, constraints and acceptance checks.',
  'Produce a technical candidate from an explicit requirements, invariants and implementation plan.',
  'Produce an independent technical candidate, then falsify and revise it with reproducible checks.'
];

function error(code, message, details = {}) {
  return Object.assign(new Error(message), { code, ...details });
}

function missionDomain(ctx) {
  const misplacedCreative = ctx.domain === 'creative_writing' && TECHNICAL.test(String(ctx.mission || ctx.goal || ''));
  return misplacedCreative ? 'software_engineering' : ctx.domain;
}

function repairMember(member, index, ctx) {
  if (missionDomain(ctx) !== 'software_engineering' || member.domain !== 'creative_writing') return member;
  const contract = require('./trinityMissionContractService');
  const evidenceOffset = String(member.hypothesis || '').indexOf('Report evidenceVector');
  const evidence = evidenceOffset < 0 ? '' : member.hypothesis.slice(evidenceOffset);
  return { ...member, role: ROLES[index % 3], domain: 'software_engineering', artifact: 'technical',
    hypothesis: `${HYPOTHESES[index % 3]} ${contract.promptInstruction(contract.contractFor(ctx.mission || ctx.goal))} ${evidence}` };
}

function scientificRole(member) {
  if (member.factorialCell) return 'independent_factorial_replicate';
  if (member.role === 'adversarial_reviewer') return 'falsifier';
  return { direct: 'independent_candidate', structured: 'structured_candidate', falsification: 'self_critic' }[member.chamber] || 'independent_candidate';
}

function modelRouteKey(uri) {
  try {
    return require('./modelProvider').configuredModel(uri);
  } catch (cause) {
    throw error('TRINITY_MODEL_ROUTE_INVALID', 'A valid explicit configured model URI is required.', { cause });
  }
}

function describe(member) {
  return {
    schema: 'trinity.worker-profile/v1', scientificRole: scientificRole(member),
    topologyRole: member.role, workerKind: member.workerKind || null,
    domain: member.domain || null, cognitiveRecipe: member.requestedCognitiveRecipe || member.cognitiveRecipe || null,
    cognitiveRecipeBasis: 'requested_strategy', observedRecipe: null,
    requiredCapabilities: requiredCapabilities(member),
    methodId: member.methodContract?.methodId || 'prompt_defined',
    requestedRuntime: { modelUri: member.localModel || null, modelTier: member.modelTier || null },
    observedRuntime: { status: 'unknown', provider: null, model: null },
    factorialCell: member.factorialCell || null
  };
}

function requiredCapabilities(member) {
  const lists = [member.workerAssignment?.requiredCapabilities, member.workerRequirements?.requiredCapabilities];
  if (lists.some(list => list !== undefined && !Array.isArray(list))) {
    throw error('TRINITY_WORKER_CAPABILITIES_INVALID', 'Required capabilities must be an explicit array.');
  }
  if (lists.some(list => Array.isArray(list) && list.some(value => typeof value !== 'string' || !value.trim()))) {
    throw error('TRINITY_WORKER_CAPABILITIES_INVALID', 'Required capabilities must contain non-empty capability names.');
  }
  return [...new Set(lists.flatMap(list => list || []))];
}

function apply(members, ctx) {
  return members.map((member, index) => repairMember(member, index, ctx));
}

function requiredTools(member) {
  const tools = member.workerRequirements?.requiredTools || [];
  if (!Array.isArray(tools) || tools.some(tool => typeof tool !== 'string' || !tool.trim())) {
    throw error('TRINITY_REQUIRED_TOOLS_INVALID', 'Required tools must be explicit non-empty tool names.');
  }
  return [...new Set(tools)];
}

function assertTools(member, options) {
  const lease = options.toolLeaseByWorld ? options.toolLeaseByWorld[member.worldNumber] : options.toolLease;
  const allowed = new Set(Array.isArray(lease) ? lease : []);
  const missing = requiredTools(member).filter(tool => !allowed.has(tool));
  if (missing.length) throw error('TRINITY_WORKER_TOOLS_UNAVAILABLE', 'Required worker tools are not leased.', { role: member.role, missingTools: missing });
}

function assertCapabilities(member) {
  const available = kinds.KIND_CAPABILITIES[member.workerKind];
  if (!available) throw error('TRINITY_WORKER_KIND_REQUIRED', 'Trinity prelaunch requires a resolved registered WorkerKind.');
  const required = requiredCapabilities(member);
  const missing = required.filter(capability => !available.includes(capability));
  if (missing.length) throw error('TRINITY_WORKER_CAPABILITY_MISMATCH', 'WorkerKind cannot satisfy the requested capabilities.', { missingCapabilities: missing });
  kinds.assertMethodCompatibility(member.workerKind, member.methodContract);
}

function assertRecipe(member) {
  const recipe = member.requestedCognitiveRecipe || member.cognitiveRecipe;
  if (!RECIPES.has(recipe)) throw error('TRINITY_RECIPE_UNSUPPORTED', 'Trinity worker recipe is not supported.');
  if (member.factorialCell && recipe !== member.factorialCell.factors.approach) {
    throw error('TRINITY_FACTORIAL_RECIPE_MISMATCH', 'The actual recipe must match the factorial treatment.');
  }
}

function assertMember(member, options) {
  assertCapabilities(member);
  assertRecipe(member);
  assertTools(member, options);
  require('./agents/workerRuntimeLimitsService').assertWorkerExecutorAvailable(member);
  if (member.workerRequirements?.nativeRequired && !native.hasNativeMethod(member.workerKind, member.methodContract?.methodId)) {
    throw error('WORKER_EXECUTOR_UNAVAILABLE', 'The requested native method is not registered.');
  }
  return describe(member);
}

function assertFactorial(members) {
  const cells = members.filter(member => member.factorialCell);
  if (!cells.length) return;
  const models = new Set(cells.map(member => member.localModel ? modelRouteKey(member.localModel) : null).filter(Boolean));
  if (models.size < 2) throw error('TRINITY_FACTORIAL_MODEL_ROUTES_REQUIRED', 'Factorial model treatments require two distinct explicit model routes.');
  const tiers = new Map();
  for (const member of cells) {
    if (!member.localModel) throw error('TRINITY_FACTORIAL_MODEL_ROUTES_REQUIRED', 'Every factorial treatment requires a model route.');
    const tier = member.factorialCell.factors.modelTier;
    const previous = tiers.get(tier);
    const route = modelRouteKey(member.localModel);
    if (previous && previous !== route) throw error('TRINITY_FACTORIAL_MODEL_TIER_CONFLICT', 'A model tier must identify the same route for every replicate.');
    tiers.set(tier, route);
  }
}

function assertDiversity(members) {
  if (members[0]?.variantSelection?.experimentalDesign?.diversityPolicy !== 'heterogeneous') return;
  const receipt = require('./trinityDifferentiationService').diversityReceipt(members, members.map(member => member.localModel));
  if (!receipt.passes) throw error('TRINITY_DIVERSITY_BELOW_THRESHOLD', 'Requested model routes do not satisfy the heterogeneous diversity gate.', { diversity: receipt });
}

function assertPrelaunch(members, options = {}) {
  assertFactorial(members);
  assertDiversity(members);
  return { valid: true, profiles: members.map(member => assertMember(member, options)), observedRuntimeVerified: false };
}

module.exports = { apply, describe, missionDomain, assertPrelaunch, modelRouteKey };
