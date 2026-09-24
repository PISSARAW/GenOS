'use strict';

const RULES = [
  { capability: 'frontend', signals: [/\b(front[ -]?end|react|vue|angular|interface|ui|ux|css)\b/i] },
  { capability: 'backend', signals: [/\b(back[ -]?end|api|serveur|server|node|express|microservice)\b/i] },
  { capability: 'data', signals: [/\b(data|donn[eé]es?|database|sql|sqlite|postgres|etl|analytics)\b/i] },
  { capability: 'security', signals: [/\b(s[eé]curit[eé]|security|auth|oauth|permission|tenant|vulnerabilit[eé])\w*\b/i] },
  { capability: 'quality', signals: [/\b(test|tests|qa|quality|qualit[eé]|verification|v[eé]rification|benchmark|eval)\w*\b/i] },
  { capability: 'operations', signals: [/\b(devops|deploy|d[eé]ploiement|docker|kubernetes|ci\/?cd|observabilit[eé]|monitoring)\w*\b/i] },
  { capability: 'ai', signals: [/\b(ai|ia|machine learning|model|mod[eè]le|prompt|agent|rag|llm)s?\b/i] },
  { capability: 'product', signals: [/\b(product|produit|business|m[eé]tier|accessibilit[eé]|user research)\w*\b/i] },
  { capability: 'science', signals: [/\b(science|scientifique|research|recherche|experiment|exp[eé]rience|hypothesis|falsifi\w*|paper|arxiv)\b/i] },
  { capability: 'integration', signals: [/\b(integration|int[eé]gration|interop|fusionner|merge)\w*\b/i] },
  { capability: 'mathematics', signals: [/\b(math|maths|math[eé]matique|[eé]quation|alg[eè]bre|calculus|th[eé]or[eè]me|matrice|vecteur|probabilit[eé])\w*\b/i] }
];

function normalize(text) {
  return String(text || '').normalize('NFD').replace(/\p{M}/gu, '');
}

function analyzeMissionCapabilities(mission) {
  const text = normalize(mission);
  const requirements = RULES.map((rule) => {
    const matchedSignals = rule.signals.filter((signal) => signal.test(text)).length;
    return matchedSignals ? {
      capability: rule.capability,
      weight: matchedSignals,
      criticality: matchedSignals > 1 ? 'high' : 'normal',
      evidenceRequired: true,
      source: 'mission_signal'
    } : null;
  }).filter(Boolean);
  return {
    requirements,
    recognizedSignals: requirements.length,
    supportedCapabilities: RULES.length,
    // This ratio reports whether the analyzer extracted any explicit needs;
    // staffing, runtime availability and proof are measured independently.
    missionCoverage: requirements.length > 0 ? 1 : 0
  };
}

module.exports = { analyzeMissionCapabilities };
