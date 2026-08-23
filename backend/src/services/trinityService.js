const DOMAIN_PROFILES = [
  {
    domain: 'creative_writing', artifact: 'creative',
    signals: [/\b(?:histoire|nouvelle|roman|récit|recit|fiction|conte|scénario|scenario|poème|poeme|creative writing|story)\b/i],
    roles: ['direct_author', 'planned_author', 'self_correcting_literary_author'],
    hypotheses: [
      'Create the work directly from the raw artistic brief, preserving voice and productive ambiguity.',
      'Create the work from an explicit dramatic and stylistic plan derived from the brief.',
      'Create independently, then revise against literary craft, emotional impact, coherence, and constraint coverage.'
    ]
  },
  {
    domain: 'security', artifact: 'technical',
    signals: [/\b(?:security|sécurité|securite|vulnerability|vulnérabilit|threat|auth|oauth|permission|exploit)\w*\b/i],
    roles: ['baseline_security_engineer', 'threat_model_engineer', 'adversarial_security_engineer'],
    hypotheses: [
      'Implement the raw security need with the smallest auditable change.',
      'Implement from a threat model, explicit invariants, and an attack-surface plan.',
      'Implement independently, then attack, falsify, and correct the result with reproducible evidence.'
    ]
  },
  {
    domain: 'data', artifact: 'technical',
    signals: [/\b(?:data|donnée|donnee|database|sql|etl|analytics|dataset)\w*\b/i],
    roles: ['baseline_data_engineer', 'planned_data_engineer', 'data_validation_engineer'],
    hypotheses: [
      'Implement the raw data need with explicit schema and migration constraints.',
      'Implement from a data-flow, integrity, and rollback plan.',
      'Implement independently, then challenge correctness with boundary datasets and reconciliation checks.'
    ]
  },
  {
    domain: 'product_design', artifact: 'design',
    signals: [/\b(?:ui|ux|interface|design system|accessibilit|frontend|react|vue|css)\w*\b/i],
    roles: ['baseline_product_designer', 'planned_product_designer', 'usability_critic'],
    hypotheses: [
      'Implement the raw interface need with minimal assumptions.',
      'Implement from a user-flow, hierarchy, accessibility, and interaction plan.',
      'Implement independently, then correct the result against usability, accessibility, and visual-consistency evidence.'
    ]
  }
];

const DEFAULT_PROFILE = {
  domain: 'software_engineering', artifact: 'technical',
  roles: ['basic_implementation', 'interview_plan_implementation', 'self_correcting_implementation'],
  hypotheses: [
    'Implement the raw need without relying on an interview-derived plan.',
    'Implement from the requirements and plan produced by the user interview.',
    'Implement independently, then challenge and correct the result with evidence.'
  ]
};

function domainProfile(mission) {
  const text = String(mission || '');
  return DOMAIN_PROFILES.find((profile) => profile.signals.some((signal) => signal.test(text))) || DEFAULT_PROFILE;
}

function membersFor(profile) {
  return ['basic_world', 'planned_world', 'ai_corrected_world'].map((label, index) => ({
    label,
    hypothesis: profile.hypotheses[index],
    role: profile.roles[index],
    modelTier: index === 0 ? 'standard' : 'frontier',
    domain: profile.domain,
    artifact: profile.artifact,
    pipelineStage: 0
  }));
}

function analyzeMission(mission) {
  const text = String(mission || '');
  const explicitlyRequested = [
    /(?:^|\b)(?:launch|use|using|run|start|activate|invoke|deploy|want|with)\s+(?:the\s+)?trinity\b/i,
    /(?:^|\b)(?:lance|lancer|utilise|utiliser|active|activer|invoque|invoquer|déploie|deploie|déployer|deployer|veux|souhaite)\s+(?:le\s+mode\s+)?trinity\b/i,
    /\b(?:trinity mode|mode trinity)\b/i,
    /\bavec\s+trinity\b/i,
    /^\s*trinity\b/i
  ].some((pattern) => pattern.test(text));
  const interviewForPlan = [
    /\binterview\s+me\b[\s\S]{0,100}\b(plan|roadmap|specification|requirements?)\b/i,
    /\bask\s+me\b[\s\S]{0,80}\bquestions?\b[\s\S]{0,100}\b(plan|roadmap|specification|requirements?)\b/i,
    /\b(interviewe|interroge)[ -]?moi\b[\s\S]{0,100}\b(plan|feuille de route|cahier des charges|besoins?)\b/i,
    /\bpose[ -]?moi\b[\s\S]{0,80}\bquestions?\b[\s\S]{0,100}\b(plan|feuille de route|cahier des charges|besoins?)\b/i
  ].some((pattern) => pattern.test(text));
  const profile = domainProfile(text);
  return {
    recommended: explicitlyRequested || interviewForPlan,
    explicitlyRequested,
    interviewForPlan,
    decision: explicitlyRequested ? 'launch' : interviewForPlan ? 'consider_after_interview' : 'not_applicable',
    domain: profile.domain,
    artifact: profile.artifact,
    members: membersFor(profile)
  };
}

function compose(mission) {
  const goal = String(mission || '').trim();
  if (!goal) throw Object.assign(new Error('Trinity mission is required.'), { code: 'TRINITY_MISSION_REQUIRED' });
  const analysis = analyzeMission(goal);
  return analysis.members.map((member, index) => ({
    ...member,
    worldNumber: index + 1,
    mission: `Trinity shared mission: ${goal}\nDomain: ${analysis.domain}\nWorld strategy: ${member.hypothesis}\nReturn domain-appropriate evidence and integration constraints to the orchestrator.`
  }));
}

module.exports = { analyzeMission, compose, domainProfile };
