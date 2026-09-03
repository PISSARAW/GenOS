const MAX_MEMBERS = 3;

const TECHNICAL_DOMAIN_RULES = [
  {
    domain: 'frontend', role: 'frontend_engineer', modelTier: 'standard',
    signals: [/\bfront[ -]?end\b/i, /\b(?:react|vue|angular)\b/i, /\b(?:interface|ui|ux|css|design system)\b/i]
  },
  {
    domain: 'backend', role: 'backend_engineer', modelTier: 'standard',
    signals: [/\bback[ -]?end\b/i, /\bapi\b/i, /\b(?:serveur|server|node|express|microservice)\b/i]
  },
  {
    domain: 'data', role: 'data_engineer', modelTier: 'standard',
    signals: [/\b(?:data|donnee|donnée|database)\b/i, /\b(?:base de donnees|base de données|sql|sqlite|postgres)\b/i, /\b(?:etl|analytics)\b/i]
  },
  {
    domain: 'security', role: 'security_reviewer', modelTier: 'frontier',
    signals: [/\b(?:securite|sécurité|security)\b/i, /\b(?:auth|oauth|permission|tenant)\b/i, /\b(?:vulnerabilit|threat)\w*\b/i]
  },
  {
    domain: 'quality', role: 'quality_engineer', modelTier: 'standard',
    signals: [/\b(?:test|tests|qa)\b/i, /\b(?:quality|qualite|qualité)\b/i, /\b(?:verification|vérification|benchmark|eval)\w*\b/i]
  },
  {
    domain: 'operations', role: 'operations_engineer', modelTier: 'standard',
    signals: [/\b(?:devops|deploy|deploiement|déploiement)\w*\b/i, /\b(?:docker|kubernetes|ci\/?cd)\b/i, /\b(?:observabil|telemetr|monitoring)\w*\b/i]
  },
  {
    domain: 'ai', role: 'ai_engineer', modelTier: 'frontier',
    signals: [/\b(?:ai|ia|machine learning)\b/i, /\b(?:model|modele|modèle|prompt|agent|rag|llm)s?\b/i]
  },
  {
    domain: 'product', role: 'product_specialist', modelTier: 'standard',
    signals: [/\b(?:product|produit|business|metier|métier)\b/i, /\baccessibilit\w*\b/i, /\b(?:research utilisateur|user research)\b/i]
  },
  {
    domain: 'science', role: 'research_scientist', modelTier: 'frontier',
    signals: [/\b(?:science|scientifique|discovery|découverte|research|recherche|experiment|expérience)\b/i, /\b(?:hypothesis|falsifi|falsification|academic|paper|arxiv)\b/i]
  },
  {
    domain: 'integration', role: 'integration_observer', modelTier: 'standard',
    signals: [/\b(?:integration|intégration|integrate|intégrer|interop)\w*\b/i, /\b(?:fusionner|merge)\b/i]
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
    .sort((left, right) => right.score - left.score || left.index - right.index);
}

function coverage(requiredCapabilities, members) {
  const supplied = new Set(members.flatMap((member) => member.capabilities || []));
  const totalWeight = requiredCapabilities.reduce((total, capability) => total + capability.weight, 0);
  const coveredWeight = requiredCapabilities.reduce(
    (total, capability) => total + (supplied.has(capability.name) ? capability.weight : 0),
    0
  );
  return {
    ratio: totalWeight > 0 ? Number((coveredWeight / totalWeight).toFixed(3)) : 1,
    covered: requiredCapabilities.filter((capability) => supplied.has(capability.name)).map((capability) => capability.name),
    uncovered: requiredCapabilities.filter((capability) => !supplied.has(capability.name)).map((capability) => capability.name)
  };
}

function fictionAnalysis() {
  const members = FICTION_TEAM.map((member) => ({ ...member, capabilities: [...member.capabilities] }));
  return {
    recommended: true,
    artifact: 'fiction',
    primaryDomain: 'creative_writing',
    requiredCapabilities: FICTION_CAPABILITIES.map((capability) => ({ ...capability })),
    detectedDomains: members.map((member) => member.label),
    capabilityCoverage: coverage(FICTION_CAPABILITIES, members),
    members
  };
}

function analyzeMission(mission) {
  const text = String(mission || '');
  if (FICTION_ARTIFACT.test(text) && CREATIVE_ACTION.test(text)) return fictionAnalysis();

  const domains = detectTechnicalDomains(text);
  const selected = domains.slice(0, MAX_MEMBERS);
  const requiredCapabilities = domains.map(({ domain, score }) => ({ name: domain, weight: score }));
  const members = selected.map(({ domain, role, modelTier, score }) => ({
    label: domain,
    hypothesis: `Own the ${domain} competency for the shared mission and return evidence to the orchestrator.`,
    role,
    modelTier,
    capabilities: [domain],
    relevanceScore: score,
    pipelineStage: /reviewer|observer|integration/i.test(role) ? 1 : 0,
    dependsOn: /reviewer|observer|integration/i.test(role)
      ? selected.filter((candidate) => !/reviewer|observer|integration/i.test(candidate.role)).map((candidate) => candidate.domain)
      : []
  }));
  return {
    recommended: domains.length >= 2,
    artifact: null,
    primaryDomain: domains[0]?.domain || null,
    requiredCapabilities,
    detectedDomains: domains.map(({ domain }) => domain),
    capabilityCoverage: coverage(requiredCapabilities, members),
    members
  };
}

function compose({ projectGoal, subSystems, assignedRoles = [], modelTiers = [], available = 3 }) {
  const goal = String(projectGoal || '').trim();
  const systems = [...new Set((Array.isArray(subSystems) ? subSystems : []).map((value) => String(value).trim()).filter(Boolean))];
  if (!goal) throw Object.assign(new Error('A-Team project_goal is required.'), { code: 'A_TEAM_GOAL_REQUIRED' });
  if (systems.length < 2) throw Object.assign(new Error('A-Team requires at least two distinct competency domains.'), { code: 'A_TEAM_MULTIDISCIPLINARY_REQUIRED' });
  if (systems.length > MAX_MEMBERS) throw Object.assign(new Error('A-Team is limited to three active competency domains.'), { code: 'A_TEAM_CAPACITY_EXCEEDED' });
  if (systems.length > available) throw Object.assign(new Error(`A-Team requires ${systems.length} free slots but only ${available} are available.`), { code: 'WORKER_GARAGE_FULL' });
  return systems.map((subSystem, index) => ({
    subSystem,
    role: String(assignedRoles[index] || `${subSystem}_specialist`).trim(),
    modelTier: String(modelTiers[index] || 'standard').trim(),
    mission: `Project goal: ${goal}\nOwned competency domain: ${subSystem}\nWork only on this bounded domain and return evidence plus integration constraints to the orchestrator.`
  }));
}

module.exports = { analyzeMission, compose, detectTechnicalDomains };
