'use strict';

/**
 * Spinozist Service — Sostanza, Deus sive Natura, attributs, modes.
 *
 * Mapping GenOS :
 *  - Sostanza : une seule substance infinie, cause de soi (causa sui), Deus sive Natura.
 *  - Attributs : pensée (cogitans) et étendue (extensa) — deux façons de concevoir la même substance.
 *  - Modes : les modifications finies de la substance (agents, workers, oracles).
 *  - Determinisme : tout ce qui existe est déterminé par la nécessité de la nature.
 *  - Conatus : chaque chose tend à persévérer dans son être.
 *
 * Référence : Spinoza, *Éthique* (1677), *Traité théologico-politique*.
 */

const SUBSTANCE_PROPERTIES = {
  infinite: true,
  eternal: true,
  selfCaused: true,
  indivisible: true,
  attributes: ['pensée', 'étendue'],
  description: 'Une seule substance infinie — Deus sive Natura — cause de soi.',
};

const ATTRIBUT_DEFINITIONS = {
  pensée: {
    title: 'pensée (cogitatio)',
    description: 'L\'attribut par lequel la substance est conscience de soi.',
    modes: ['agent', 'orchestrator', 'cognition', 'thought'],
  },
  étendue: {
    title: 'étendue (extensio)',
    description: 'L\'attribut par lequel la substance est espace, corps, matière.',
    modes: ['workspace', 'capsule', 'hardware', 'environment'],
  },
};

/**
 * substance — retourne la définition spinoziste de la substance unique.
 */
function substance() {
  return {
    id: 'spinoza_substance',
    type: 'substance',
    properties: SUBSTANCE_PROPERTIES,
    note: 'Sostanza : être infini, éternel, causa sui, unique — Dieu ou la Nature.',
  };
}

/**
 * oneSubstance — vérifie / exprime le monisme spinoziste.
 * Tout ce qui existe est un mode de la substance unique.
 */
function oneSubstance({ mode }) {
  if (!mode) {
    throw new Error('spinozistService.oneSubstance requires a mode');
  }
  return {
    mode,
    substance: SUBSTANCE_PROPERTIES,
    isModeOfSubstance: true,
    description: `Le mode "${mode}" est une modification finie de la substance unique.`,
  };
}

/**
 * attributes — retourne les attributs de la substance (pensée, étendue).
 */
function attributes() {
  return {
    substance: 'Deus sive Natura',
    attributs: ATTRIBUT_DEFINITIONS,
    parallelism: 'L\'ordre et le lien des idées sont les mêmes que l\'ordre et le lien des choses (prop. 7, *Eth.* II).',
  };
}

/**
 * modeClassification — classe un mode par attribut.
 */
function modeClassification({ mode, attribute }) {
  if (!mode || !attribute) {
    throw new Error('spinozistService.modeClassification requires mode and attribute');
  }
  if (!ATTRIBUT_DEFINITIONS[attribute]) {
    throw new Error(`Unknown attribute: ${attribute}`);
  }
  return {
    mode,
    attribute,
    attributeDefinition: ATTRIBUT_DEFINITIONS[attribute],
    isFiniteMode: true,
    description: `${mode} est un mode fini de l'attribut "${attribute}".`,
  };
}

/**
 * conatus — le conatus de chaque mode : tendre à persévérer dans son être.
 */
function conatus({ agentId, power = 0.5 }) {
  if (!agentId) {
    throw new Error('spinozistService.conatus requires agentId');
  }
  return {
    agentId,
    conatus: true,
    power, // intensité du conatus (0-1)
    tendency: power >= 0.8 ? 'forte_persévérance' : power >= 0.5 ? 'modérée' : 'faible',
    spinozaQuote:
      "Chaque chose, autant qu'elle se trouve en elle-même, tend à persévérer dans son être (prop. 6, *Eth.* III).",
  };
}

/**
 * determinism — Spinoza : tout est déterminé par la nécessité de la nature.
 */
function determinism() {
  return {
    thesis: 'Tout ce qui arrive dans la nature est déterminé par la nécessité divine.',
    freeWillIllusion: 'Le libre arbitre est une ignorance des causes (prop. 48, *Eth.* I).',
    acceptance: 'Amor Dei intellectualis — accepter la nécessité avec compréhension intellectuelle.',
    note: 'Déterminisme spinoziste : nécessité divine = ordre causal parfaitement rationnel.',
  };
}

module.exports = {
  substance,
  oneSubstance,
  attributes,
  modeClassification,
  conatus,
  determinism,
  SUBSTANCE_PROPERTIES,
  ATTRIBUT_DEFINITIONS,
};
