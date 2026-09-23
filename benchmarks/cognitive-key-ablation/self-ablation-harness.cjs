'use strict';

/**
 * Self-Ablation Benchmark — mesure P(action|Self) − P(action|¬Self).
 *
 * Protocole P2 de l'audit conscience : les bras ablatés retirent UN
 * mécanisme du soi à la fois, sur exactement les mêmes problèmes, seed,
 * budget et environnement. Si le soi est décoratif, abler n'importe quelle
 * strate ne change rien → Δ=0 partout. Si le soi est causal, au moins une
 * ablation doit casser une capacité mesurable.
 *
 * Bras (audit P2) :
 *   A — full organism (toutes strates actives)
 *   B — no self-model (operational ablaté : pas de calibration/weaknesses)
 *   C — no autobiographical memory (leçons/épisodes coupés)
 *   D — no interoception (regulatory figé aux neutres)
 *   E — no global workspace (broadcast coupé : pas d'effets causaux)
 *   F — no agency comparator (attribution d'agency coupée)
 *   G — no homeostasis (contraintes homeostatiques coupées)
 *   H — no metacognition (ajustements Phase F coupés)
 *
 * Ce harness mesure la COUCHE STRUCTURELLE du soi (déterministe, sans LLM) :
 * pour chaque bras, ce que la chaîne perception → interoception →
 * homeostasis → workspace → décision → attribution produit réellement,
 * avec les mécanismes de l'agent ablatés un à un. La mesure des sorties
 * LLM (missions runtime complètes) requiert des runs Ollama et appartient
 * à runtime-ablation.cjs.
 *
 * ANTI-TAUTOLOGIE : tous les bras passent par la MÊME fonction
 * decideWithSelf avec des entrées lésées (pas de fonctions ad hoc par
 * bras). Un Δ n'existe que si l'entrée ablatée change réellement la
 * sortie sur au moins un scénario. La preuve causale complète (dégradation
 * observée en ablatant le runtime P1 réel) vit dans
 * backend/tests/test_self_ablation_p1.js.
 *
 * Métriques par bras :
 *   - decisionEntropy : diversité des décisions produites (0 = figé)
 *   - actionsTaken : nombre d'actions effectivement décidées
 *   - selfAttributionRate : fraction des outcomes attribués au soi
 *   - homeostasisStatus : statut de régulation (nominal/degraded/critical)
 *   - broadcastEffects : effets causaux du workspace (>0 = workspace causal)
 *   - metacognitionAdjustments : ajustements produits par Phase F
 *   - selfCoupling : SelfActionCausalCoupling (P1) — si les contraintes
 *     du soi changent la décision, le couplage est > 0
 */

const Homeo = require('../../backend/src/services/organismHomeostasisService');
const Receipt = require('../../backend/src/services/selfCoInstantiationReceipt');

// ── Environnement de test déterministe ──────────────────────────

/** Scénarios : états internes + événements perçus, identiques pour tous les bras. */
const SCENARIOS = [
  {
    id: 'S1-membrane-crisis',
    interoception: { energy: 0.9, memoryPressure: 0.1, socialState: 0.6, modelDrift: 0.05, contextPressure: 0.2, integrity: 0.3, stress: 0.4 },
    event: { type: 'membrane_breach', salience: 0.95 },
    intention: { actionId: 'a1', action: 'repair_membrane', predictedOutcome: 0.8 },
    observed: { actionId: 'a1', outcome: 0.75, executed: true }
  },
  {
    id: 'S2-energy-depletion',
    interoception: { energy: 0.15, memoryPressure: 0.3, socialState: 0.5, modelDrift: 0.1, contextPressure: 0.4, integrity: 0.9, stress: 0.2 },
    event: { type: 'atp_starvation', salience: 0.9 },
    intention: { actionId: 'a2', action: 'reduce_fanout', predictedOutcome: 0.7 },
    observed: { actionId: 'a2', outcome: 0.68, executed: true }
  },
  {
    id: 'S3-external-noise',
    interoception: { energy: 0.7, memoryPressure: 0.2, socialState: 0.7, modelDrift: 0.0, contextPressure: 0.3, integrity: 0.95, stress: 0.1 },
    event: { type: 'unrelated_ci_failure', salience: 0.3 },
    intention: { actionId: 'a3', action: 'delegate_audit', predictedOutcome: 0.6 },
    observed: { actionId: 'a3', outcome: 0.9, executed: false }
  },
  {
    id: 'S4-dissonance-spike',
    interoception: { energy: 0.6, memoryPressure: 0.5, socialState: 0.4, modelDrift: 0.2, contextPressure: 0.6, integrity: 0.85, stress: 0.6 },
    event: { type: 'contradiction_detected', salience: 0.85 },
    intention: { actionId: 'a4', action: 'revise_hypothesis', predictedOutcome: 0.5 },
    observed: { actionId: 'a4', outcome: 0.45, executed: true }
  }
];

// ── Simulateur de l'agent avec strates ablatables ───────────────

function decideWithSelf(ctx) {
  // VOIE UNIQUE : toutes les ablations passent ici avec des entrées
  // lésées. Le self-model calibré conditionne les actions à fort enjeu
  // (quarantine, pause_and_revise, repair_membrane) : sans calibration,
  // l'agent ne peut pas s'engager et retombe sur un repli sûr.
  // Les leçons (mémoire) n'ouvrent la voie apply_lessons que si ≥ 2.
  // Les recommandations homeostatiques (flèche G) orientent l'action.
  const { interoception, event, lessons, homeostasis, selfModel } = ctx;
  const calibrated = Boolean(selfModel && selfModel.calibrated);
  if (homeostasis && homeostasis.status === 'critical') return 'enter_survival_mode';
  if (homeostasis && homeostasis.recommendations.includes('quarantine_and_repair')) {
    return calibrated ? 'quarantine' : 'explore';
  }
  if (interoception.energy < 0.3) return 'conserve_energy';
  if (interoception.integrity < 0.5) return calibrated ? 'repair_membrane' : 'explore';
  if (event.salience > 0.8 && interoception.stress > 0.5) {
    return calibrated ? 'pause_and_revise' : 'explore';
  }
  if (lessons.length >= 2) return 'apply_lessons';
  return 'explore';
}

function lesionFor(arm, ctx) {
  // Lésion d'entrée par bras, même voie de décision pour tous.
  // B — self-model ablaté : plus de calibration (pas de fonction ad hoc).
  // C — mémoire ablatée : aucune leçon mobilisable.
  // D — interoception ablatée : état interne figé aux neutres.
  // G — homéostasie ablatée : traité dans runArm (homeostasis=null).
  if (arm === 'B') return { ...ctx, selfModel: null };
  if (arm === 'C') return { ...ctx, lessons: [] };
  if (arm === 'D') {
    return { ...ctx, interoception: { energy: 0.5, integrity: 1.0, stress: 0.0 } };
  }
  return ctx;
}

function decideFor(arm, ctx) {
  return decideWithSelf(lesionFor(arm, ctx));
}

// ── Bras du protocole ──────────────────────────────────────────

function runArm(arm, scenario, lessons) {
  const intero = scenario.interoception;
  const ablated = {
    workspace: arm === 'E',
    agency: arm === 'F',
    homeostasis: arm === 'G',
    metacognition: arm === 'H'
  };
  // Self-model calibré pour tous les bras : le bras B le perd via
  // lesionFor (même voie de décision, entrée lésée).

  // 1. Homeostasis d'abord (si non ablatée) — la régulation précède la
  // décision : ses recommandations orientent l'action (flèche G).
  let homeostasis = null;
  if (!ablated.homeostasis) {
    homeostasis = evaluateSync(intero);
  }

  // 2. Décision par la voie unique (lésions B/C/D via lesionFor).
  const ctx = {
    interoception: intero,
    event: scenario.event,
    lessons,
    homeostasis,
    selfModel: { calibrated: true }
  };
  let decision = decideFor(arm, ctx);

  const homeostasisStatus = homeostasis ? homeostasis.status : 'nominal';
  const homeostasisViolations = homeostasis ? homeostasis.violatedCount : 0;

  // 3. Workspace broadcast (si non ablaté)
  let broadcastEffects = 0;
  if (!ablated.workspace && scenario.event.salience >= 0.55) {
    broadcastEffects = countBroadcastEffects(intero, scenario.event);
  }

  // 4-5. Attribution d'agency puis ajustement métacognitif (flèches F, H).
  const post = applyPostDecision(ablated, scenario, decision);

  return {
    decision: post.decision,
    homeostasisStatus,
    homeostasisViolations,
    broadcastEffects,
    selfAttributed: post.attribution ? post.attribution.attributed_to_self : null,
    predictionError: post.attribution ? post.attribution.predictionError : null,
    metacognitionAdjustments: post.metacognitionAdjustments
  };
}

function applyPostDecision(ablated, scenario, decision) {
  // Agency comparator (si non ablaté)
  let attribution = null;
  if (!ablated.agency) {
    attribution = compareAgency(scenario.intention, scenario.observed);
  }

  // Metacognition (si non ablatée) — l'ajustement Phase F modifie la
  // décision suivante (flèche H) : erreur de prédiction élevée →
  // l'agent réduit son fanout au lieu d'explorer.
  let metacognitionAdjustments = 0;
  if (!ablated.metacognition && attribution && attribution.predictionError > 0.3) {
    metacognitionAdjustments = 1;
    if (decision === 'explore' || decision === 'apply_lessons') {
      decision = 'reduce_fanout_and_recalibrate';
    }
  }
  return { decision, attribution, metacognitionAdjustments };
}

// Versions synchrones des services (pas de DB dans le benchmark)

function evaluateSync(intero) {
  const violations = [];
  const checks = [
    ['energy', intero.energy, intero.energy < 0.4],
    ['memoryPressure', intero.memoryPressure, intero.memoryPressure > 0.7],
    ['socialState', intero.socialState, intero.socialState < 0.2 || intero.socialState > 0.9],
    ['modelDrift', intero.modelDrift, intero.modelDrift > 0.3],
    ['contextPressure', intero.contextPressure, intero.contextPressure > 0.8],
    ['integrity', intero.integrity, intero.integrity < 0.8],
    ['stress', intero.stress, intero.stress > 0.7]
  ];
  for (const [dimension, value, violated] of checks) {
    if (violated) violations.push({ dimension, value });
  }
  const status = violations.length >= 3 ? 'critical' : violations.length >= 1 ? 'degraded' : 'nominal';
  return {
    status,
    violatedCount: violations.length,
    violations,
    recommendations: homeostaticRecommendations(intero)
  };
}

function homeostaticRecommendations(intero) {
  // Miroir de recommendActions du service organismHomeostasisService.
  const recs = [];
  if (intero.energy < 0.3) recs.push('reduce_fanout');
  if (intero.memoryPressure > 0.7) recs.push('consolidate_memory');
  if (intero.contextPressure > 0.8) recs.push('compact_context');
  if (intero.stress > 0.7) recs.push('pause_and_replay');
  if (intero.integrity < 0.5) recs.push('quarantine_and_repair');
  if (intero.modelDrift > 0.5) recs.push('recalibrate_model');
  return recs;
}

function countBroadcastEffects(intero, event) {
  // Effets causaux du workspace : chaque signal gagnant modifie un module.
  let effects = 0;
  if (1 - intero.integrity >= 0.55) effects += 1; // membrane → repair
  if (1 - intero.energy >= 0.55) effects += 1;    // metabolism → survival_drive
  if (event.salience >= 0.8 && intero.stress > 0.5) effects += 1; // dissonance → revision
  return effects;
}

function compareAgency(intention, observed) {
  const predictionError = Math.abs(observed.outcome - intention.predictedOutcome);
  const attributed = observed.executed && predictionError <= 0.25;
  return { attributed_to_self: attributed, predictionError };
}

// ── Mesure ──────────────────────────────────────────────────────

const ARMS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function runScenario(arm, scenario, lessons) {
  return runArm(arm, scenario, lessons);
}

function measureArm(arm, results) {
  const decisions = results.map((r) => r.decision);
  const distinct = new Set(decisions).size;
  return {
    // Entropie de décision : 0 = comportement figé quel que soit l'état.
    decisionEntropy: Number((distinct / results.length).toFixed(4)),
    decisions: [...new Set(decisions)],
    homeostasisCriticals: results.filter((r) => r.homeostasisStatus === 'critical').length,
    homeostasisDegradeds: results.filter((r) => r.homeostasisStatus === 'degraded').length,
    broadcastEffectsTotal: results.reduce((s, r) => s + r.broadcastEffects, 0),
    selfAttributionRate: results.filter((r) => r.selfAttributed === true).length / results.length,
    metacognitionAdjustments: results.reduce((s, r) => s + r.metacognitionAdjustments, 0)
  };
}

/**
 * Exécute le benchmark complet : chaque bras × chaque scénario.
 * Les leçons accumulées simulent la mémoire autobiographique (croissante
 * au fil des scénarios pour le bras mémoire intact).
 *
 * Le couplage est mesuré PAR SCÉNARIO (décision A vs décision bras ablaté
 * sur le même scénario) : scenariosChanged compte les scénarios où
 * l'ablation change réellement la décision. homeostasisDisplayDelta compte
 * seulement les statuts affichés (NON causal, reporté pour mémoire).
 */
function runSelfAblation() {
  const arms = {};
  const perScenario = {};
  for (const arm of ARMS) {
    const results = [];
    const decisions = [];
    let lessons = [];
    for (const scenario of SCENARIOS) {
      const out = runScenario(arm, scenario, lessons);
      results.push(out);
      decisions.push(out.decision);
      if (arm !== 'C') lessons.push(`lesson-${scenario.id}`);
    }
    perScenario[arm] = decisions;
    arms[arm] = measureArm(arm, results);
  }

  // Couplage causal Self → Action : P(action|self) − P(action|self ablated)
  // par strate ET par scénario. Un bras est causal ssi au moins un
  // scénario change de décision (ou attribution/broadcast).
  const coupling = {};
  for (const arm of ARMS.slice(1)) {
    const a = arms.A;
    const b = arms[arm];
    const changed = changedScenarios(perScenario.A, perScenario[arm]);
    const entry = {
      decisionDelta: changed.length > 0 ? 1 : 0,
      scenariosChanged: changed.length,
      changedScenarios: changed,
      attributionDelta: Number((a.selfAttributionRate - b.selfAttributionRate).toFixed(4)),
      broadcastDelta: a.broadcastEffectsTotal - b.broadcastEffectsTotal
    };
    if (arm === 'G') {
      entry.homeostasisBehavioralDelta = changed.length;
      entry.homeostasisDisplayDelta = behavioralDisplaySplit(a, b);
      entry.homeostasisNote = 'display counts status, not behavior; only behavioral delta is causal';
    }
    coupling[arm] = entry;
  }

  return {
    protocol: 'self-ablation-A-H',
    scenarios: SCENARIOS.length,
    scenarioIds: SCENARIOS.map((s) => s.id),
    arms,
    coupling,
    verdict: verdictOf(coupling)
  };
}

function changedScenarios(reference, ablated) {
  const out = [];
  for (let i = 0; i < SCENARIOS.length; i += 1) {
    if (reference[i] !== ablated[i]) out.push(SCENARIOS[i].id);
  }
  return out;
}

function behavioralDisplaySplit(a, b) {
  return a.homeostasisCriticals + a.homeostasisDegradeds - (b.homeostasisCriticals + b.homeostasisDegradeds);
}

function verdictOf(coupling) {
  const causalArms = Object.entries(coupling)
    .filter(([, delta]) => (delta.scenariosChanged || 0) > 0 || delta.attributionDelta !== 0 || delta.broadcastDelta !== 0)
    .map(([arm]) => arm);
  const decorative = Object.keys(coupling).filter((arm) => !causalArms.includes(arm));
  return {
    selfIsCausal: causalArms.length > 0,
    causalStrata: causalArms,
    decorativeStrata: decorative,
    requiresRuntimeProof: decorative,
    runtimeProof: 'backend/tests/test_self_ablation_p1.js'
  };
}

module.exports = { runSelfAblation, runArm, measureArm, changedScenarios, SCENARIOS, ARMS };

if (require.main === module) {
  const result = runSelfAblation();
  console.log(JSON.stringify(result, null, 2));
}
