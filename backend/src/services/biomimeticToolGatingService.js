/**
 * Biomimetic Upstream Tool Gating Service (Thalamus & Selective Disinhibition)
 *
 * Protects 7B and lightweight LLMs from false affordances (tool distraction/hallucination)
 * and prompt context saturation by applying biological gating before injecting or forcing tool schemas:
 *
 * 1. Level 1: Membrane Potential Threshold (All-or-None / Tout ou Rien)
 *    - Resting potential: -70.0 mV, Threshold: -55.0 mV.
 *    - Purely conversational/expository queries cause hyperpolarization (IPSP / GABAergic inhibition).
 *    - Action/execution/system queries cause depolarization (EPSP / Glutamatergic excitation).
 * 2. Level 2: Thalamic Guardrail (Binary Cognitive Filter)
 *    - For queries in the sub-threshold ambiguous zone (-62 mV to -55 mV), evaluates a strict
 *      binary gating decision to prevent leaky tool exposure.
 * 3. Level 3: Basal Ganglia Selective Disinhibition (Recrutement Sélectif)
 *    - Instead of injecting all 20+ tool schemas, recruits and disinhibits only the functional
 *      clusters (striatal pathways) that match the detected action intent.
 */

const RESTING_POTENTIAL_MV = -70.0;
const DEFAULT_THRESHOLD_MV = -55.0;
const HYPERPOLARIZATION_MIN_MV = -85.0;
const ACTION_POTENTIAL_MAX_MV = 30.0;

// Striatal Affordance Clusters: groups tools by functional domain
const AFFORDANCE_CLUSTERS = Object.freeze({
  snapshot_persistence: {
    name: 'snapshot_persistence',
    keywords: ['snapshot', 'sauvegarde', 'sauvegarder', 'restore', 'restaurer', 'replay', 'rejouer', 'capsule', 'fork', 'branche', 'merge'],
    tools: ['genos_snapshot', 'genos_replay', 'genos_capsule_create', 'genos_merge', 'genos_v2_init', 'genos_v2_fork']
  },
  orchestration_coordination: {
    name: 'orchestration_coordination',
    keywords: ['orchestrer', 'déléguer', 'deleguer', 'worker', 'ouvrier', 'inbox', 'publish', 'publier', 'organisation', 'topology', 'topologie', 'progrès', 'progress'],
    tools: ['genos_orchestrate', 'genos_delegate_worker', 'genos_worker_publish', 'genos_worker_inbox', 'genos_change_organization', 'genos_organization_state', 'genos_report_progress']
  },
  strategy_primitives: {
    name: 'strategy_primitives',
    keywords: ['stratégie', 'strategie', 'strategy', 'primitive', 'trinity', 'a-team', 'ateam', 'mcts', 'stdp', 'adaptation'],
    tools: ['genos_change_strategy', 'genos_execute_primitive', 'genos_trinity_launch', 'genos_a_team_preview']
  },
  audit_inspection: {
    name: 'audit_inspection',
    keywords: ['audit', 'auditer', 'inspect', 'inspecter', 'biomimicry', 'biomimétisme', 'biological_mode', 'mode_biologique', 'conformité', 'compliance', 'crypsis', 'camouflage', 'mimétisme', 'mimetisme', 'mimicry'],
    tools: ['genos_audit', 'genos_biomimicry', 'genos_biological_mode', 'genos_inspect']
  },
  diagnostics_remediation: {
    name: 'diagnostics_remediation',
    keywords: ['diagnose', 'diagnostic', 'diagnostiquer', 'run', 'exécuter', 'executer', 'lancer', 'diff', 'évaluer', 'evaluer', 'failure', 'échec', 'echec', 'hypothese', 'hypothèse'],
    tools: ['genos_diagnose', 'genos_run', 'genos_diff', 'genos_evaluate_trajectories', 'genos_search_failures', 'genos_hypothesis_evidence']
  }
});

// Lexical patterns indicating pure dialogue / conceptual thinking (IPSP - Hyperpolarizing)
const CONVERSATIONAL_INHIBITORS = [
  /^(bonjour|salut|hello|hi|hey|coucou|bonsoir)\b/i,
  /^(qu'est-ce que|qu'est ce que|c'est quoi|qu'est-ce qu'|définis|explique|explique-moi|peux-tu m'expliquer)\b/i,
  /^(what is|what are|explain|can you explain|tell me about|how does|why is|why does)\b/i,
  /\b(en théorie|théoriquement|conceptuellement|au sens figuré|dans l'absolu|philosophie)\b/i,
  /\b(résume|résume-moi|fais un résumé de ce texte|reformule|traduis ce texte)\b/i,
  /\b(merci|au revoir|bonne journée|à bientôt|super merci)\b/i
];

// Lexical patterns indicating concrete system action / tool need (EPSP - Depolarizing)
const ACTION_EXCITATORS = [
  /\b(lance|lancer|exécute|execute|exécuter|déploie|deploy|crée|cree|créer|sauvegarde|snapshot)\b/i,
  /\b(enregistre|persiste|modifie|écris dans|écrire dans|supprime|efface|delete|fork|branche)\b/i,
  /\b(appelle l'outil|utilise l'outil|use tool|call tool|tool call|mcp|invoque|invoquer)\b/i,
  /\b(recherche dans les fichiers|analyse le repo|explore le workspace|teste|test|tests|run test|tester)\b/i,
  /\b(délègue|delegue|dispatch|change d'organisation|change de stratégie|lance trinity|a-team)\b/i,
  /\b(audite le snapshot|génère un audit|replay la session|rejoue)\b/i,
  /\b(regarde|cherche|inspecte|vérifie|verifie|trouve)\b/i,
  /\b(fichier|fichiers|file|files|repo|repository|workspace|patch|diff)\b/i
];

/**
 * Computes membrane potential (Vm) in millivolts from prompt text.
 * Resting: -70 mV.
 * Depolarizing stimuli (action keywords) raise Vm toward +30 mV.
 * Hyperpolarizing stimuli (dialogue/explanation keywords) lower Vm toward -85 mV.
 */
function calculateMembranePotential(query, options = {}) {
  const text = String(query || '').trim();
  if (!text) {
    return {
      membranePotentialMv: RESTING_POTENTIAL_MV,
      restingPotentialMv: RESTING_POTENTIAL_MV,
      thresholdMv: options.thresholdMv || DEFAULT_THRESHOLD_MV,
      isDepolarized: false,
      depolarizationDelta: 0,
      classification: 'SILENT_INPUT'
    };
  }

  const thresholdMv = typeof options.thresholdMv === 'number' ? options.thresholdMv : DEFAULT_THRESHOLD_MV;
  let voltage = RESTING_POTENTIAL_MV;

  // Evaluate inhibitory influences (GABAergic / IPSP)
  let inhibitoryCount = 0;
  for (const pattern of CONVERSATIONAL_INHIBITORS) {
    if (pattern.test(text)) {
      inhibitoryCount += 1;
    }
  }

  // Evaluate excitatory influences (Glutamatergic / EPSP)
  let excitatoryCount = 0;
  for (const pattern of ACTION_EXCITATORS) {
    if (pattern.test(text)) {
      excitatoryCount += 1;
    }
  }

  // Affordance cluster hits
  let clusterMatches = 0;
  const lower = text.toLowerCase();
  for (const cluster of Object.values(AFFORDANCE_CLUSTERS)) {
    if (cluster.keywords.some((kw) => lower.includes(kw))) {
      clusterMatches += 1;
    }
  }

  // Voltage integration equation
  const epsp = excitatoryCount * 12.0 + clusterMatches * 6.0;
  const ipsp = inhibitoryCount * 15.0;

  voltage = voltage + epsp - ipsp;

  // Physiological bounds clamp
  voltage = Math.max(HYPERPOLARIZATION_MIN_MV, Math.min(ACTION_POTENTIAL_MAX_MV, voltage));
  const isDepolarized = voltage >= thresholdMv;

  return {
    membranePotentialMv: Number(voltage.toFixed(2)),
    restingPotentialMv: RESTING_POTENTIAL_MV,
    thresholdMv,
    isDepolarized,
    depolarizationDelta: Number((voltage - thresholdMv).toFixed(2)),
    excitatoryCount,
    inhibitoryCount,
    clusterMatches,
    classification: isDepolarized ? 'ACTION_POTENTIAL' : (voltage < -75.0 ? 'HYPERPOLARIZED' : 'SUB_THRESHOLD')
  };
}

/**
 * Level 1: Ultra-fast Chemoreceptor / Receptor Gate (<1 ms, 0 token)
 */
function evaluateChemoreceptorGate(query, options = {}) {
  const potential = calculateMembranePotential(query, options);
  const startHr = process.hrtime.bigint();
  const elapsedMicros = Math.max(1, Math.round(Number(process.hrtime.bigint() - startHr) / 1000));

  return {
    level: 1,
    gate: potential.isDepolarized ? 'OPEN' : 'CLOSED',
    requiresTools: potential.isDepolarized,
    membranePotentialMv: potential.membranePotentialMv,
    thresholdMv: potential.thresholdMv,
    latencyMicros: elapsedMicros,
    classification: potential.classification
  };
}

/**
 * Level 2: Thalamic Guardrail (Binary Cognitive Filter for Twilight/Ambiguous queries)
 * Resolves sub-threshold queries located in the ambiguous zone [-62 mV, -55 mV].
 */
function evaluateThalamicGuardrail(query, options = {}) {
  const potential = calculateMembranePotential(query, options);

  // If clearly hyperpolarized (<= -72 mV, e.g. active dialogue inhibitors), definitely NO tool needed
  if (potential.membranePotentialMv <= -72.0) {
    return {
      level: 2,
      passed: false,
      reason: 'HYPERPOLARIZED_INHIBITION',
      requiresTools: false,
      decision: 'NO_TOOL_REQUIRED'
    };
  }

  // If clearly depolarized (>= threshold), definitely YES
  if (potential.isDepolarized) {
    return {
      level: 2,
      passed: true,
      reason: 'SUPRA_THRESHOLD_ACTIVATION',
      requiresTools: true,
      decision: 'TOOL_EXECUTION_REQUIRED'
    };
  }

  // Ambiguous twilight zone (-72 mV to -55 mV): apply thalamic deterministic discriminator
  const text = String(query || '').toLowerCase();
  const hasConcreteTarget = /\b(dans|sur|pour|avec|fichier|repo|repository|code|snapshot|id|branche|agent)\b/.test(text);
  const hasVerbImp = /\b(fais|fais-moi|peux-tu|va|lance|regarde|cherche|vérifie|verifie|check|trouve)\b/.test(text);
  const isActionIntent = hasConcreteTarget && hasVerbImp;

  return {
    level: 2,
    passed: isActionIntent,
    reason: isActionIntent ? 'THALAMIC_AMBIGUITY_RESOLVED_YES' : 'THALAMIC_AMBIGUITY_RESOLVED_NO',
    requiresTools: isActionIntent,
    decision: isActionIntent ? 'TOOL_EXECUTION_REQUIRED' : 'NO_TOOL_REQUIRED'
  };
}

/**
 * Level 3: Basal Ganglia Selective Disinhibition (Recrutement Sélectif)
 * Given a set of candidate tools, selects and disinhibits ONLY the tools that match
 * the query's affordances, preventing attention saturation in 7B models.
 */
function selectAffordantTools(query, candidateTools = [], options = {}) {
  const text = String(query || '').toLowerCase();
  const candidates = Array.isArray(candidateTools) ? candidateTools : [];
  if (!candidates.length) return [];

  const matchedTools = new Set();

  for (const cluster of Object.values(AFFORDANCE_CLUSTERS)) {
    const hitsCluster = cluster.keywords.some((kw) => text.includes(kw));
    if (hitsCluster) {
      for (const t of cluster.tools) {
        if (candidates.includes(t)) {
          matchedTools.add(t);
        }
      }
    }
  }

  // If matched tools is non-empty, return only those
  if (matchedTools.size > 0) {
    return Array.from(matchedTools);
  }

  // If general action was required but no specific cluster was hit,
  // return a safe conservative minimal kernel (first 3 matching candidates) rather than all 20+
  const fallbackLimit = options.fallbackLimit || 4;
  return candidates.slice(0, fallbackLimit);
}

/**
 * Unified Biomimetic Upstream Gating Pipeline:
 * Evaluates Level 1, Level 2 and Level 3 in sequence.
 *
 * @param {string} query - The user prompt or task description.
 * @param {string[]} candidateTools - Allowed tools or complete catalog.
 * @param {object} options - Options (thresholdMv, forceTools, bypassGating).
 * @returns {object} Full gating evaluation result.
 */
function evaluateToolGating(query, candidateTools = [], options = {}) {
  if (options.bypassGating === true || process.env.GENOS_DISABLE_TOOL_GATING === '1') {
    return {
      gatingActive: false,
      requiresTools: true,
      disinhibitedTools: Array.isArray(candidateTools) ? candidateTools : [],
      membranePotentialMv: 0.0,
      gateState: 'BYPASSED',
      reason: 'Gating explicitly bypassed'
    };
  }

  const level1 = evaluateChemoreceptorGate(query, options);

  let requiresTools = false;
  let gatingLevelUsed = 1;
  let decisionReason = level1.classification;

  if (level1.gate === 'OPEN') {
    requiresTools = true;
  } else if (level1.membranePotentialMv >= -62.0) {
    // Twilight zone: elevate to Thalamic Guardrail (Level 2)
    const level2 = evaluateThalamicGuardrail(query, options);
    gatingLevelUsed = 2;
    requiresTools = level2.requiresTools;
    decisionReason = level2.reason;
  } else {
    requiresTools = false;
    decisionReason = 'CONVERSATIONAL_HYPERPOLARIZATION';
  }

  // Level 3: Selective Disinhibition
  let disinhibitedTools = [];
  if (requiresTools) {
    disinhibitedTools = selectAffordantTools(query, candidateTools, options);
  }

  return {
    gatingActive: true,
    requiresTools,
    gatingLevelUsed,
    decisionReason,
    gateState: requiresTools ? 'ACTION_POTENTIAL' : 'HYPERPOLARIZED',
    membranePotentialMv: level1.membranePotentialMv,
    thresholdMv: level1.thresholdMv,
    disinhibitedTools,
    candidateCount: candidateTools.length,
    disinhibitedCount: disinhibitedTools.length,
    suppressedCount: candidateTools.length - disinhibitedTools.length,
    shieldScore: Number(((candidateTools.length - disinhibitedTools.length) / Math.max(1, candidateTools.length)).toFixed(2))
  };
}

module.exports = {
  calculateMembranePotential,
  evaluateChemoreceptorGate,
  evaluateThalamicGuardrail,
  selectAffordantTools,
  evaluateToolGating,
  RESTING_POTENTIAL_MV,
  DEFAULT_THRESHOLD_MV,
  AFFORDANCE_CLUSTERS
};
