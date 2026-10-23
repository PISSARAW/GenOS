'use strict';

const TECHNICAL_DOMAIN_RULES = [
  {
    domain: 'mathematics', role: 'mathematician', modelTier: 'frontier', priority: 5,
    signals: [
      /\bmaths?\b/i,
      /\bmath[eé]matiques?\b/i,
      /\b(?:équation|equation|inéquation|inequation)s?\b/i,
      /\b(?:dérivée|derivee|dérivation|derivation)s?\b/i,
      /\b(?:intégrale|integrale)s?\s+(?:de|du|d['’])\b/i,
      /\b(?:algèbre|algebre|calculus|théorème|theoreme|matrice|vecteur|géométrie|geometrie|probabilité|probabilite|polynôme|polynome|limite)s?\b/i
    ]
  },
  {
    domain: 'frontend', role: 'frontend_engineer', modelTier: 'standard', priority: 10,
    signals: [/\bfront[ -]?end\b/i, /\b(?:react|vue|angular)\b/i, /\b(?:interface|ui|ux|css|design system)\b/i,
      /\b(?:clavier|lecteur d[’']?ecran|navigation accessible|parcours utilisateur)\b/i]
  },
  {
    domain: 'backend', role: 'backend_engineer', modelTier: 'standard', priority: 20,
    signals: [/\bback[ -]?end\b/i, /\bapi\b/i, /\b(?:serveur|server|node|express|microservice)\b/i,
      /\b(?:commande|reprendre|reprise|rejouer|tentative)\b/i]
  },
  {
    domain: 'data', role: 'data_engineer', modelTier: 'standard', priority: 30,
    signals: [/\b(?:data|donnee|donnée|database)\b/i, /\b(?:base de donnees|base de données|sql|sqlite|postgres)\b/i,
      /\b(?:etl|analytics|stock|inventaire|ventes|lignes|lots|consolider)\b/i]
  },
  {
    domain: 'security', role: 'security_reviewer', modelTier: 'frontier', priority: 40,
    signals: [/\b(?:securite|sécurité|security)\b/i, /\b(?:auth|oauth|permission|tenant)\b/i,
      /\b(?:vulnerabilit|threat)\w*\b/i, /\b(?:debit|acc[eè]s|authentification)\b/i]
  },
  {
    domain: 'quality', role: 'quality_engineer', modelTier: 'standard', priority: 50,
    signals: [/\b(?:test|tests|qa)\b/i, /\b(?:quality|qualite|qualité)\b/i,
      /\b(?:verification|vérification|benchmark|eval|regression|bloquer)\w*\b/i]
  },
  {
    domain: 'operations', role: 'operations_engineer', modelTier: 'standard', priority: 60,
    signals: [/\b(?:devops|deploy|deploiement|déploiement)\w*\b/i, /\b(?:docker|kubernetes|ci\/?cd)\b/i,
      /\b(?:observabil|telemetr|monitoring|panne|incident|timeout|r[eé]seau|chaque nuit)\w*\b/i]
  },
  {
    domain: 'ai', role: 'ai_engineer', modelTier: 'frontier', priority: 70,
    signals: [/\b(?:ai|ia|machine learning)\b/i, /\b(?:model|modele|modèle|prompt|agent|rag|llm)s?\b/i]
  },
  {
    domain: 'product', role: 'product_specialist', modelTier: 'standard', priority: 80,
    signals: [/\b(?:product|produit|business|metier|métier)\b/i, /\baccessibilit\w*\b/i,
      /\b(?:research utilisateur|user research|utilisateurs?|usage)\b/i]
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

module.exports = TECHNICAL_DOMAIN_RULES;
