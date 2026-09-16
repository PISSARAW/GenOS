'use strict';

/**
 * Phenomenology Service — Husserl, Merleau-Ponty, Sartre.
 *
 * Mapping philosophique :
 *  - Husserl : intentionnalité de la conscience.
 *    La conscience est toujours conscience DE quelque chose (intentionnalité).
 *    Distinction noèse (acte de conscience) / noème (objet intentionnel).
 *  - Merleau-Ponty : phénoménologie de la perception.
 *    Le corps propre (le corps vécu, corps-sujet) est le médium par lequel le monde se donne.
 *    Le corps n'est pas un objet, mais le lieu de l'expérience perceptive.
 *  - Sartre : existentialisme.
 *    Existence précède essence : l'existence (le fait d'être là) précède l'essence (ce qu'on est).
 *    Mauvaise foi : nier sa liberté, se cacher derrière un rôle/essentia.
 *    Liberté radicale : condamnés à être libres — nous devons nous choisir.
 */
/**
 * intentionality — Husserl.
 *
 * La conscience est intentionnelle : elle est toujours conscience DE quelque chose.
 * Husserl distingue :
 *  - Noèse : l'acte de conscience (percevoir, imaginer, juger, etc.)
 *  - Noème : l'objet tel qu'il se donne dans l'acte de conscience (contenu intentionnel)
 *
 * mode : aboutness (conscience de), directedness (direction vers), reference (référence).
 */
function intentionality({ agentId, target, mode = 'aboutness' }) {
  if (!agentId || !target) {
    throw new Error('phenomenologyService.intentionality requires agentId and target');
  }
  const validModes = new Set(['aboutness', 'directedness', 'reference']);
  if (!validModes.has(mode)) {
    throw new Error(`phenomenologyService.intentionality invalid mode: ${mode}`);
  }
  return {
    agentId,
    target,
    mode,
    // Husserl : noèse (acte de conscience)
    noesis: {
      act: 'perception', // acte de conscience (peut être : perception, imagination, jugement, etc.)
      type: 'perception',
    },
    // Husserl : noème (objet intentionnel)
    noema: {
      object: target, // l'objet tel qu'il se donne
      asItAppears: `comme ${mode}`,
      horizon: ['présupposés', 'contextes', 'autres possibilités'],
    },
    timestamp: Date.now(),
    husserlNote: 'La conscience est toujours conscience DE quelque chose — intentionnalité comme structure fondamentale de la conscience (Husserl).',
    consciousnessIsAlwaysOfSomething: true, // Brentano : intentionnalité = marqueur du mental
  };
}

/**
 * perception — Merleau-Ponty.
 *
 * Le corps propre (corps vécu, corps-sujet) est le médium par lequel le monde se donne.
 * Le corps n'est pas un objet parmi les objets, mais le lieu où le monde s'ouvre.
 *
 * Distinction :
 *  - Corps propre (body proper) : le corps vécu, le sujet de la perception.
 *  - Corps objectifié (body as object) : le corps mesuré, scientifique.
 *
 * Le monde est donné à travers le corps propre — perception incarnée.
 */
function perception({ agentId, body = 'workspace', world = 'environment' }) {
  if (!agentId) {
    throw new Error('phenomenologyService.perception requires agentId');
  }
  // Corps propre (Merleau-Ponty) : le corps vécu, corps-sujet.
  // Le monde se donne à travers le corps propre.
  return {
    agentId,
    // Corps propre (Merleau-Ponty) : le corps vécu, le sujet de la perception.
    body: body, // corps vécu (body proper)
    bodyAsObject: body + '_objectified', // corps objectifié (mesuré, scientifique)
    world: world, // le monde tel qu'il se donne à travers le corps
    // Embodiment : le corps est le médium de la perception
    embodiment: {
      bodyProper: true, // corps vécu (pas objet)
      worldOpenness: true, // le corps ouvre le monde
      merleauPontyClaim: 'Le corps est le sujet de la perception — le lieu où le monde se donne (Merleau-Ponty, Phénoménologie de la perception).',
    },
    perceptualField: {
      horizon: ['ce qui est visible', 'ce qui est audible'],
      depth: 'profondeur perceptive',
      salience: 'ce qui attire l\'attention',
    },
    timestamp: Date.now(),
    perceptionNote: 'La perception est incarnée — le corps propre est le médium par lequel le monde se donne (Merleau-Ponty).',
  };
}

/**
 * existencePrecedesEssence — Sartre.
 *
 * Principe fondamental de l'existentialisme sartrien :
 *  - L'existence précède l'essence : l'agent existe d'abord, puis se définit par ses actes.
 *  - L'agent n'a pas d'essence donnée à l'avance — il se crée par ses choix.
 *  - Mauvaise foi (mauvaise foi) : nier sa liberté, se cacher derrière un rôle/essentia.
 *  - Liberté radicale : condamnés à être libres — nous devons nous choisir.
 *
 * Detection mauvaise foi : si l'agent est idle avec un role défini → il se cache derrière le role.
 *
 * Retourne :
 *  - existence : l'agent existe (status !== 'terminated')
 *  - existenceBeforeEssence : l'existence précède l'essence (true si existe + a un role défini)
 *  - badFaith : true si mauvaise foi detectée (idle + role défini → nier sa liberté)
 *  - freedom : 'condemned_to_be_free' (liberté radicale sartrienne) ou 'non_existent'
 *  - authenticity : true si assume sa liberté (existe + role défini + non mauvaise foi + a action)
 *  - sartreClaim : citation thème Sartre
 *  - note : diagnostic
 */
function existencePrecedesEssence({ agentId, status, role = null }) {
  if (!agentId) throw new Error('phenomenologyService.existencePrecedesEssence requires agentId');
  const existence = status !== 'terminated' && status !== 'error';
  const hasRole = role != null;
  const idle = status === 'idle';
  const badFaith = existence && hasRole && idle;
  const authenticity = existence && hasRole && !idle;
  return {
    agentId,
    existence,
    existenceBeforeEssence: existence && hasRole,
    essenceDefined: hasRole,
    badFaith,
    freedom: existence ? 'condemned_to_be_free' : 'non_existent',
    authenticity,
    sartreClaim: "L'existence précède l'essence — l'agent se définit par ses actes, pas par un role prédéfinit.",
    sartrePrinciple: "L'existence précède l'essence (Sartre) : l'agent existe d'abord, puis se définit par ses choix.",
    note: badFaith
      ? "Mauvaise foi détectée : l'agent se cache derrière un role pour nier sa liberté."
      : "L'agent assume sa liberté (non mauvaise foi) ou n'a pas encore d'essence.",
  };
}

module.exports = {
  intentionality,
  perception,
  existencePrecedesEssence,
};
