const config = require('../config/orchestratorConfig');
const { analyzeMissionCapabilities } = require('./aTeam/capabilities/missionCapabilityAnalyzer');
const { findCapabilityGaps } = require('./aTeam/capabilities/capabilityGapService');
const { measureCapabilityCoverage } = require('./aTeam/capabilities/capabilityCoverageService');
const teamFormationOptimizer = require('./aTeam/teamFormation/teamFormationOptimizer');
const knowledgeRouting = require('./aTeam/memory/knowledgeRoutingService');
const DEFAULT_MAX_MEMBERS = 3;

function maxMembers() {
  return config.maxAteamMembers();
}
// `priority` breaks ties when several domains share the same signal score.
// Lower value wins. It is explicit so that reordering this array can never
// silently change which specialists make the cut.
const TECHNICAL_DOMAIN_RULES = [
  {
    domain: 'mathematics', role: 'mathematician', modelTier: 'frontier', priority: 5,
    signals: [
      /\bmaths?\b/i,
      /\bmath[eé]matiques?\b/i,
      /\b(?:équation|equation|inéquation|inequation)s?\b/i,
      /\b(?:intégrale|integrale|dérivée|derivee|dérivation|derivation)s?\b/i,
      /\b(?:algèbre|algebre|calculus|théorème|theoreme|matrice|vecteur|géométrie|geometrie|probabilité|probabilite|polynôme|polynome|limite)s?\b/i
    ]
  },
  {
    domain: 'frontend', role: 'frontend_engineer', modelTier: 'standard', priority: 10,
    signals: [/\bfront[ -]?end\b/i, /\b(?:react|vue|angular)\b/i, /\b(?:interface|ui|ux|css|design system)\b/i]
  },
  {
    domain: 'backend', role: 'backend_engineer', modelTier: 'standard', priority: 20,
    signals: [/\bback[ -]?end\b/i, /\bapi\b/i, /\b(?:serveur|server|node|express|microservice)\b/i]
  },
  {
    domain: 'data', role: 'data_engineer', modelTier: 'standard', priority: 30,
    signals: [/\b(?:data|donnee|donnée|database)\b/i, /\b(?:base de donnees|base de données|sql|sqlite|postgres)\b/i, /\b(?:etl|analytics)\b/i]
  },
  {
    domain: 'security', role: 'security_reviewer', modelTier: 'frontier', priority: 40,
    signals: [/\b(?:securite|sécurité|security)\b/i, /\b(?:auth|oauth|permission|tenant)\b/i, /\b(?:vulnerabilit|threat)\w*\b/i]
  },
  {
    domain: 'quality', role: 'quality_engineer', modelTier: 'standard', priority: 50,
    signals: [/\b(?:test|tests|qa)\b/i, /\b(?:quality|qualite|qualité)\b/i, /\b(?:verification|vérification|benchmark|eval)\w*\b/i]
  },
  {
    domain: 'operations', role: 'operations_engineer', modelTier: 'standard', priority: 60,
    signals: [/\b(?:devops|deploy|deploiement|déploiement)\w*\b/i, /\b(?:docker|kubernetes|ci\/?cd)\b/i, /\b(?:observabil|telemetr|monitoring)\w*\b/i]
  },
  {
    domain: 'ai', role: 'ai_engineer', modelTier: 'frontier', priority: 70,
    signals: [/\b(?:ai|ia|machine learning)\b/i, /\b(?:model|modele|modèle|prompt|agent|rag|llm)s?\b/i]
  },
  {
    domain: 'product', role: 'product_specialist', modelTier: 'standard', priority: 80,
    signals: [/\b(?:product|produit|business|metier|métier)\b/i, /\baccessibilit\w*\b/i, /\b(?:research utilisateur|user research)\b/i]
  },
  {
    domain: 'science', role: 'research_scientist', modelTier: 'frontier', priority: 90,
    signals: [/\b(?:science|scientifique|discovery|découverte|research|recherche|experiment|expérience)\b/i, /\b(?:hypothesis|falsifi|falsification|academic|paper|arxiv)\b/i]
  },
  {
    domain: 'integration', role: 'integration_observer', modelTier: 'standard', priority: 100,
    signals: [/\b(?:integration|intégration|integrate|intégrer|integrer|interop)\w*\b/i, /\b(?:fusionner|merge)\b/i]
  }
];

const FICTION_ARTIFACT = /\b(?:histoire|nouvelle|roman|récit|recit|fiction|conte|scénario|scenario|short story)\b/i;
const CREATIVE_ACTION = /\b(?:écri\w*|ecri\w*|rédig\w*|redig\w*|compose\w*|imagine\w*|raconte\w*|invent\w*|creative writing)\b/i;

const FICTION_CAPABILITIES = [
  { name: 'literary_voice', weight: 0.25 },
  { name: 'character_psychology', weight: 0.20 },
  { name: 'dramaturgy', weight: 0.20 },
  { name: 'twist_design', weight: 0.15 },
  { name: 'literary_criticism', weight: 0.20 }
];

const FICTION_TEAM = [
  {
    label: 'literary_creation',
    role: 'literary_author',
    modelTier: 'frontier',
    capabilities: ['literary_voice', 'character_psychology'],
    hypothesis: 'Create the fiction with a distinctive voice, psychologically specific characters, and scene-level emotional truth.',
    pipelineStage: 0,
    dependsOn: []
  },
  {
    label: 'dramaturgy',
    role: 'dramaturg',
    modelTier: 'frontier',
    capabilities: ['dramaturgy', 'twist_design'],
    hypothesis: 'Review the author dossier, then own conflict, pacing, narrative architecture, and the causal preparation of the ending.',
    pipelineStage: 1,
    dependsOn: ['literary_creation']
  },
  {
    label: 'literary_criticism',
    role: 'literary_critic',
    modelTier: 'standard',
    capabilities: ['literary_criticism'],
    hypothesis: 'Judge the author and dramaturgy dossiers for prose, interpretive depth, restraint, and emotional credibility without rewriting the author.',
    pipelineStage: 2,
    dependsOn: ['literary_creation', 'dramaturgy']
  }
];

function countMatches(text, signals) {
  return signals.reduce((score, pattern) => score + (pattern.test(text) ? 1 : 0), 0);
}

function detectTechnicalDomains(text) {
  return TECHNICAL_DOMAIN_RULES
    .map((rule, index) => ({ ...rule, score: countMatches(text, rule.signals), index }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.priority - right.priority || left.index - right.index);
}

function fictionAnalysis() {
  const members = FICTION_TEAM.map((member) => ({ ...member, capabilities: [...member.capabilities] }));
  const required = FICTION_CAPABILITIES.map((capability) => ({
    ...capability,
    capability: capability.name,
    criticality: 'normal',
    evidenceRequired: true
  }));
  return {
    recommended: true,
    artifact: 'fiction',
    primaryDomain: 'creative_writing',
    requiredCapabilities: required,
    detectedDomains: members.map((member) => member.label),
    capabilityCoverage: measureCapabilityCoverage({ requirements: required, members, analysisCoverage: 1 }),
    capabilityGaps: findCapabilityGaps(required, members),
    members
  };
}

function isObserverRole(role) {
  return /reviewer|observer|integration/i.test(role || '');
}

function buildMember(candidate, selected) {
  const { domain, role, modelTier, score } = candidate;
  const dependsOn = isObserverRole(role)
    ? selected.filter((item) => !isObserverRole(item.role)).map((item) => item.domain)
    : [];
  return {
    label: domain,
    hypothesis: `Own the ${domain} competency for the shared mission and return evidence to the orchestrator.`,
    role,
    modelTier,
    capabilities: [domain],
    authority: { owns: [domain], mayModify: [domain], mayPropose: [], mustConsult: [], mayRead: [], cannotOverride: [] },
    relevanceScore: score,
    pipelineStage: isObserverRole(role) ? 1 : 0,
    dependsOn
  };
}

function requiredCapabilities(domains) {
  return domains.map(({ domain, score }) => ({ name: domain, weight: score }));
}

function buildMembers(selected) {
  return selected.map((candidate) => buildMember(candidate, selected));
}

function technicalResult(selectedDomains, members, extra = {}) {
  const required = extra.requiredCapabilities || requiredCapabilities(selectedDomains);
  const capabilityCoverage = measureCapabilityCoverage({
    requirements: required,
    members,
    analysisCoverage: extra.missionCoverage ?? null
  });
  const capabilityGaps = findCapabilityGaps(required, members);
  return {
    recommended: selectedDomains.length >= 2,
    artifact: null,
    primaryDomain: selectedDomains[0]?.domain || null,
    requiredCapabilities: required,
    detectedDomains: selectedDomains.map(({ domain }) => domain),
    // Detected-but-not-staffed domains are surfaced instead of silently dropped:
    // "no domain may be ignored without justification".
    overflowDomains: [],
    capabilityGaps,
    totalDetected: Number.isFinite(extra.totalDetected) ? extra.totalDetected : selectedDomains.length,
    capabilityCoverage,
    members
  };
}

function technicalAnalysis(domains, analysis) {
  const selected = domains.slice(0, maxMembers());
  const requirements = analysis.requirements.map((requirement) => ({
    ...requirement,
    name: requirement.capability
  }));
  return technicalResult(selected, buildMembers(selected), {
    requiredCapabilities: requirements,
    missionCoverage: analysis.missionCoverage,
    totalDetected: domains.length
  });
}

function analyzeMission(mission) {
  const text = (typeof mission === 'string' ? mission : '').normalize('NFD').replace(/\p{M}/gu, '');
  if (FICTION_ARTIFACT.test(text) && CREATIVE_ACTION.test(text)) return fictionAnalysis();
  const domains = detectTechnicalDomains(text);
  const analysis = analyzeMissionCapabilities(text);
  return technicalAnalysis(domains, analysis);
}

function normalizeDependencies(dependencies) {
  if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) return {};
  const normalized = {};
  for (const [subSystem, list] of Object.entries(dependencies)) {
    const key = String(subSystem || '').trim();
    if (!key) continue;
    normalized[key] = [...new Set((Array.isArray(list) ? list : [list]).map((value) => String(value || '').trim()).filter(Boolean))];
  }
  return normalized;
}

function prepareComposition({ projectGoal, subSystems, assignedRoles = [], modelTiers = [], dependencies = {}, available = 3 } = {}) {
  const goal = String(projectGoal || '').trim();
  const systems = [...new Set((Array.isArray(subSystems) ? subSystems : []).map((value) => String(value).trim()).filter(Boolean))];
  const roles = Array.isArray(assignedRoles) ? assignedRoles : [];
  const tiers = Array.isArray(modelTiers) ? modelTiers : [];
  const deps = normalizeDependencies(dependencies);
  const capacity = maxMembers();
  const freeSlots = Number.isFinite(Number(available)) ? Number(available) : capacity;
  return { goal, systems, roles, tiers, deps, capacity, freeSlots };
}

function validateComposition({ goal, systems, capacity, freeSlots }) {
  if (!goal) throw Object.assign(new Error('A-Team project_goal is required.'), { code: 'A_TEAM_GOAL_REQUIRED' });
  if (systems.length < 2) throw Object.assign(new Error('A-Team requires at least two distinct competency domains.'), { code: 'A_TEAM_MULTIDISCIPLINARY_REQUIRED' });
  if (systems.length > capacity) throw Object.assign(new Error(`A-Team is limited to ${capacity} active competency domains.`), { code: 'A_TEAM_CAPACITY_EXCEEDED' });
  if (systems.length > freeSlots) throw Object.assign(new Error(`A-Team requires ${systems.length} free slots, but worker garage is full (slots: ${capacity - freeSlots}/${capacity} used — wait or increase MAX_ACTIVE_WORKERS).`), { code: 'WORKER_GARAGE_FULL' });
}

const CREATIVE_DEFAULT_DEPS = Object.freeze({
  editing: ['creative_writing'],
  critique: ['creative_writing', 'editing']
});

function creativeDefaults(systems) {
  const out = {};
  for (const [domain, deps] of Object.entries(CREATIVE_DEFAULT_DEPS)) {
    if (!systems.includes(domain)) continue;
    const known = deps.filter((dep) => systems.includes(dep));
    if (known.length) out[domain] = known;
  }
  return out;
}

function memberDependencies(composition, member, producers) {
  const explicit = composition.deps[member.subSystem];
  if (Array.isArray(explicit)) return explicit.filter((domain) => domain !== member.subSystem);
  // An observer (integration/review) consumes every producing domain; it must
  // run after them, so the handoff graph is never empty when an observer exists.
  if (isObserverRole(member.role)) return producers.filter((domain) => domain !== member.subSystem);
  return [];
}

function buildAssignment(composition, member, context) {
  const { goal } = composition;
  const dependsOn = memberDependencies(composition, member, context.producers);
  const observer = isObserverRole(member.role);
  return {
    subSystem: member.subSystem,
    label: member.subSystem,
    role: member.role,
    modelTier: member.modelTier,
    capabilities: [member.subSystem],
    authority: { owns: [member.subSystem], mayModify: [member.subSystem], mayPropose: [], mustConsult: [], mayRead: [], cannotOverride: [] },
    relevanceScore: Number(member.relevanceScore) || 1,
    pipelineStage: observer || dependsOn.length ? 1 : 0,
    dependsOn,
    mission: `Project goal: ${goal}\nOwned competency domain: ${member.subSystem}\nWork only on this bounded domain and return evidence plus integration constraints to the orchestrator.`
  };
}

function compose(options = {}) {
  const composition = prepareComposition(options);
  validateComposition(composition);
  composition.deps = { ...creativeDefaults(composition.systems), ...composition.deps };
  const members = composition.systems.map((subSystem, index) => ({
    subSystem,
    role: String(composition.roles[index] || `${subSystem}_specialist`).trim(),
    modelTier: String(composition.tiers[index] || 'standard').trim()
  }));
  const producers = members.filter((member) => !isObserverRole(member.role)).map((member) => member.subSystem);
  return members.map((member, index) => buildAssignment(composition, member, { index, producers }));
}

function memberLabel(member) {
  return member.label || member.subSystem || member.role || null;
}

// Groups members into pipeline stages so a consumer stage (for example the
// integration observer) is ordered after every producing stage it depends on.
function planStages(members) {
  const list = Array.isArray(members) ? members.filter(Boolean) : [];
  const maxStage = list.reduce((max, member) => Math.max(max, Number(member.pipelineStage) || 0), 0);
  const stages = [];
  for (let stage = 0; stage <= maxStage; stage += 1) {
    stages.push(list.filter((member) => (Number(member.pipelineStage) || 0) === stage).map(memberLabel).filter(Boolean));
  }
  return { stages, order: stages.flat() };
}

function orderByStage(members) {
  return [...(Array.isArray(members) ? members : [])].sort((left, right) => (Number(left.pipelineStage) || 0) - (Number(right.pipelineStage) || 0));
}

function dependencyPrompt(prompt, dependsOn) {
  const dependencies = [...new Set((Array.isArray(dependsOn) ? dependsOn : []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (!dependencies.length) return prompt;
  return `${prompt}\nUpstream domains to consume before finalizing: ${dependencies.join(', ')}.`;
}

module.exports = {
  get MAX_MEMBERS() {
    return maxMembers();
  },
  maxMembers,
  analyzeMission,
  optimizeFormation: teamFormationOptimizer.optimizeTeam,
  routeKnowledgeNeed: knowledgeRouting.routeKnowledgeNeed,
  compose,
  detectTechnicalDomains,
  isObserverRole,
  planStages,
  orderByStage,
  dependencyPrompt
};
