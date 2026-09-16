'use strict';

/**
 * Consciousness Service — Qualia, Intentionnalité, Supervenience, Corps-Esprit.
 *
 * Mapping philosophique :
 *  - Qualia (C.I. Lewis, Nagel, Chalmers) : état subjectif vécu (what-is-it-like).
 *    Un qualia est l'expérience phénoménale brute : la "rougeur", la douleur, l'insight.
 *  - Intentionnalité (Brentano, Husserl) : la conscience est toujours conscience DE quelque chose.
 *    Distinction Brentano : intentionnalité = marqueur de l'esprit (mental = directionnel).
 *    Husserl : noèse (acte) / noème (objet intentionnel).
 *  - Supervenience (Davidson, Kim) : le mental supervene sur le physique.
 *    Pas de différence mentale sans différence physique.
 *    Si deux états physiques sont identiques → les états mentaux sont identiques.
 *  - Problème corps-esprit (Descartes, interactionnisme, dualisme).
 *    Descartes : res cogitans (pensante) / res extensa (étendue).
 *    Modèles : interactionnisme, épiphenoménalisme, parallélisme, physicalisme.
 */
const qualiaCatalog = {
  cognitive: ['insight', 'confusion', 'dead_end', 'breakthrough', 'understanding', 'doubt'],
  sensory: ['seeing', 'hearing', 'touching', 'color_experience', 'pain', 'pleasure'],
  affective: ['joy', 'sorrow', 'fear', 'anger', 'surprise', 'anticipation'],
  conative: ['desire', 'will', 'aversion', 'urge', 'decision', 'volition'],
  perceptual: ['appearance', 'illusion', 'hallucination', 'perception', 'recognition', 'misperception'],
};

function recordQualia({ agentId, experience, intensity = 1.0, valence = 0 }) {
  if (!agentId || !experience) {
    throw new Error('consciousnessService.recordQualia requires agentId and experience');
  }
  return {
    agentId,
    timestamp: Date.now(),
    experience,
    intensity: Math.max(0, Math.min(1, intensity)),
    valence: Math.max(-1, Math.min(1, valence)),
    qualiaType: 'phenomenal_quality',
    whatItIsLike: experience, // Nagel : what-is-it-like
  };
}

/**
 * recordIntentionality — Brentano / Husserl.
 *
 * La conscience est intentionnelle : elle est TOUJOURS conscience DE quelque chose.
 * Brentano : l'intentionnalité est la marque distinctive du mental.
 * Husserl : structure noèse (acte) / noème (contenu intentionnel).
 */
function recordIntentionality({ agentId, target, mode = 'aboutness' }) {
  if (!agentId || !target) {
    throw new Error('consciousnessService.recordIntentionality requires agentId and target');
  }
  const validModes = new Set(['aboutness', 'directedness', 'reference']);
  if (!validModes.has(mode)) {
    throw new Error(`consciousnessService.recordIntentionality invalid mode: ${mode}`);
  }
  return {
    agentId,
    target,
    mode,
    noesis: {
    act: 'perception', // acte de conscience (Husserl)
    type: 'perception',
    },
    noema: {
      target: target, // objet intentionnel (Husserl) — sinon le test de consciousnessService attend i.noema.target
      asItAppears: `comme ${mode}`,
    },
    timestamp: Date.now(),
    brentanoMark: 'intentional_inexistence', // Brentano : l'objet est "inexistant" dans l'acte
    husserlStructure: 'noesis-noema',
  };
}

/**
 * checkSupervenience — Davidson / Kim.
 *
 * Supervenience : le mental dépend du physique.
 * Deux états physiques identiques → états mentaux identiques.
 *
 * Vérification : si physicalStateA === physicalStateB mais mentalStateA ≠ mentalStateB →
 * violation de la supervenience (ou facteur latent non modélisé).
 */
function checkSupervenience(options = {}) {
  const { mentalState, physicalState } = options;
  const mentalA = options.mentalStateA || mentalState;
  const mentalB = options.mentalStateB || mentalState;
  const physicalA = options.physicalStateA || physicalState;
  const physicalB = options.physicalStateB || physicalState;
  if (!mentalA || !physicalA) {
    throw new Error('consciousnessService.checkSupervenience requires mentalState and physicalState');
  }
  const physicalSame = hashState(physicalA) === hashState(physicalB);
  const mentalSame = hashState(mentalA) === hashState(mentalB);
  return {
    supervenes: physicalSame && mentalSame,
    physicalBase: { physicalStateA: physicalA, physicalStateB: physicalB },
    mentalState: { mentalStateA: mentalA, mentalStateB: mentalB },
    supervenienceClaim: physicalSame && mentalSame
      ? 'Le mental dépend du physique — pas de différence mentale sans différence physique (Davidson, Kim).'
      : 'Supervenience violée : différence psychologique sans différence physique (si réel).',
  };
}

/**
 * mindBodyInteraction — Descartes / modèles d'interaction.
 *
 * Modèles philosophiques du problème corps-esprit :
 *  - 'cartesian' : res cogitans (esprit) ↔ res extensa (corps) via glande pinéale.
 *  - 'epiphenomenal' : le mental est un sous-produit du physique, sans pouvoir causal.
 *  - 'parallel' : mental et physique parallèles, synchronisés (Leibniz : harmonie préétablie).
 *  - 'interactionist' : mental et physique s'influencent mutuellement.
 *  - 'causal' : relation causale générale.
 */
function mindBodyInteraction({ agentId, body, interaction = 'causal' }) {
  if (!agentId || !body) {
    throw new Error('consciousnessService.mindBodyInteraction requires agentId and body');
  }
  const validInteractions = new Set(['causal', 'epiphenomenal', 'parallel', 'interactionist']);
  if (!validInteractions.has(interaction)) {
    throw new Error(`consciousnessService.mindBodyInteraction invalid interaction: ${interaction}`);
  }
  const model = {
    agentId,
    body, // res extensa (Descartes)
    interaction,
    timestamp: Date.now(),
  };
  switch (interaction) {
    case 'cartesian':
      model.description = 'Descartes : res cogitans (pensante) interagit avec res extensa (étendue) via la glande pinéale.';
      model.direction = 'bidirectional_substance';
      model.dualist = true;
      break;
    case 'epiphenomenal':
      model.description = 'Épiphenoménalisme : le mental est un sous-produit du physique, sans pouvoir causal sur le corps.';
      model.direction = 'unidirectional_physical_to_mental';
      break;
    case 'parallel':
      model.description = 'Parallélisme (Leibniz) : mental et physique sont parallèles, synchronisés par harmonie préétablie.';
      model.direction = 'parallel_preestablished';
      break;
    case 'interactionist':
      model.description = 'Interactionnisme : le mental et le physique s\'influencent mutuellement de façon bidirectionnelle.';
      model.direction = 'bidirectional_causal';
      break;
    case 'causal':
    default:
      model.description = 'Modèle causal général : relation causale entre mental et physique.';
      model.direction = 'causal_unknown_direction';
      break;
  }
  return model;
}

function hashState(state) {
  if (typeof state === 'string') return hashString(state);
  if (state === null || state === undefined) return hashString('null');
  try {
    return hashString(JSON.stringify(state, Object.keys(state).sort()));
  } catch (_) {
    return 'unhashable';
  }
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return (hash >>> 0).toString(16);
}

module.exports = {
  recordQualia,
  recordIntentionality,
  checkSupervenience,
  mindBodyInteraction,
  hashState,
  qualiaCatalog,
};
