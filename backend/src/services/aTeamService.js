const DOMAIN_RULES = [
  ['frontend', /\b(front[ -]?end|react|vue|angular|interface|ui|ux|css|design system)\b/i, 'frontend_engineer'],
  ['backend', /\b(back[ -]?end|api|serveur|server|node|express|service|microservice)\b/i, 'backend_engineer'],
  ['data', /\b(data|donnee|donnée|database|base de donnees|base de données|sql|sqlite|postgres|etl|analytics)\b/i, 'data_engineer'],
  ['security', /\b(securite|sécurité|security|auth|oauth|permission|tenant|vulnerabilit|threat)\b/i, 'security_reviewer'],
  ['quality', /\b(test|tests|qa|quality|qualite|qualité|verification|vérification|benchmark|eval)\b/i, 'quality_engineer'],
  ['operations', /\b(devops|deploy|deploiement|déploiement|docker|kubernetes|ci\/?cd|observabil|telemetr|monitoring)\b/i, 'operations_engineer'],
  ['ai', /\b(ai|ia|machine learning|model|modele|modèle|prompt|agent|rag|llm)\b/i, 'ai_engineer'],
  ['product', /\b(product|produit|business|metier|métier|accessibilit|research utilisateur|user research)\b/i, 'product_specialist']
];

function analyzeMission(mission) {
  const text = String(mission || '');
  const domains = DOMAIN_RULES
    .filter(([, pattern]) => pattern.test(text))
    .map(([domain, , role]) => ({ domain, role }));
  const selected = domains.slice(0, 3);
  if (selected.length === 2) selected.push({ domain: 'integration', role: 'integration_observer' });
  return {
    recommended: domains.length >= 2,
    detectedDomains: domains.map(({ domain }) => domain),
    members: selected.map(({ domain, role }) => ({
      label: domain,
      hypothesis: `Own the ${domain} competency for the shared mission and return evidence to the orchestrator.`,
      role,
      modelTier: /security|ai/.test(domain) ? 'frontier' : 'standard'
    }))
  };
}

function compose({ projectGoal, subSystems, assignedRoles = [], modelTiers = [], available = 3 }) {
  const goal = String(projectGoal || '').trim();
  const systems = [...new Set((Array.isArray(subSystems) ? subSystems : []).map((value) => String(value).trim()).filter(Boolean))];
  if (!goal) throw Object.assign(new Error('A-Team project_goal is required.'), { code: 'A_TEAM_GOAL_REQUIRED' });
  if (systems.length < 2) throw Object.assign(new Error('A-Team requires at least two distinct competency domains.'), { code: 'A_TEAM_MULTIDISCIPLINARY_REQUIRED' });
  if (systems.length > 3) throw Object.assign(new Error('A-Team is limited to three active competency domains.'), { code: 'A_TEAM_CAPACITY_EXCEEDED' });
  if (systems.length > available) throw Object.assign(new Error(`A-Team requires ${systems.length} free slots but only ${available} are available.`), { code: 'WORKER_GARAGE_FULL' });
  return systems.map((subSystem, index) => ({
    subSystem,
    role: String(assignedRoles[index] || `${subSystem}_specialist`).trim(),
    modelTier: String(modelTiers[index] || 'standard').trim(),
    mission: `Project goal: ${goal}\nOwned competency domain: ${subSystem}\nWork only on this bounded domain and return evidence plus integration constraints to the orchestrator.`
  }));
}

module.exports = { analyzeMission, compose };
