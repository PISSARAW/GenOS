const TRINITY_MEMBERS = [
  {
    label: 'basic_world',
    hypothesis: 'Implement the raw need without relying on an interview-derived plan.',
    role: 'basic_implementation',
    modelTier: 'standard'
  },
  {
    label: 'planned_world',
    hypothesis: 'Implement from the requirements and plan produced by the user interview.',
    role: 'interview_plan_implementation',
    modelTier: 'frontier'
  },
  {
    label: 'ai_corrected_world',
    hypothesis: 'Implement independently, then challenge and correct the result with evidence.',
    role: 'self_correcting_implementation',
    modelTier: 'frontier'
  }
];

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
  return {
    recommended: explicitlyRequested || interviewForPlan,
    explicitlyRequested,
    interviewForPlan,
    decision: explicitlyRequested ? 'launch' : interviewForPlan ? 'consider_after_interview' : 'not_applicable',
    members: TRINITY_MEMBERS.map((member) => ({ ...member }))
  };
}

function compose(mission) {
  const goal = String(mission || '').trim();
  if (!goal) throw Object.assign(new Error('Trinity mission is required.'), { code: 'TRINITY_MISSION_REQUIRED' });
  return TRINITY_MEMBERS.map((member, index) => ({
    ...member,
    worldNumber: index + 1,
    mission: `Trinity shared mission: ${goal}\nWorld strategy: ${member.hypothesis}\nReturn implementation evidence and integration constraints to the orchestrator.`
  }));
}

module.exports = { analyzeMission, compose };
