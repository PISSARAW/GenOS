/**
 * @file gangliaBasals.js
 * @description Algorithme de sélection coût/bénéfice inspiré des ganglia
 * basaux (noyaux gris centraux). Chaque option est évaluée selon son
 * ratio (probabilité de succès × récompense) / (coût × risque), avec
 * un système de "dopamine" qui ajuste l'attractivité based on l'historique
 * récent — pas de sélection statique, mais adaptative.
 *
 * Inspiration biologique : les ganglia basaux pondèrent les actions
 * par leur valeur attendue. Si un marteau est trop lourd, la dopamine
 * baisse pour cette option, et le cerveau choisit l'alternative.
 */

const dopamineState = new Map();

/**
 * État dopamine d'un contexte. Persisté en mémoire.
 */
function getDopamine(ctxId) {
  let état = dopamineState.get(ctxId);
  if (!état) {
    état = {
      ctxId,
      valeurs_attendues: new Map(),
      historique: [],
      baseline_attraction: 1.0,
      originatedAt: new Date().toISOString()
    };
    dopamineState.set(ctxId, état);
  }
  return état;
}

/**
 * Calcule la valeur Q d'une option selon le modèle ganglia basaux.
 * formule  : Q = (P_succès × récompense) / (coût × facteur_risque)
 *
 * @param {object} option - { probabilité, récompense, coût, risque }
 * @returns {object} { q_value, dopamine_adjustment, attractivité }
 */
function computeQValue(option) {
  const p = Math.max(0, Math.min(1, Number(option.probabilité || option.p_succès || 0.5)));
  const récompense = Math.max(0, Number(option.récompense || option.reward || 1));
  const coût = Math.max(0.01, Number(option.coût || option.cost || 1));
  const risque = Math.max(0, Math.min(2, Number(option.risque || option.risk || 1)));

  const valeurAttendue = p * récompense;
  const coûtPerçu = coût * (1 + risque * 0.5);
  const q = coûtPerçu > 0 ? valeurAttendue / coûtPerçu : 0;

  return {
    p_succès: p,
    récompense,
    coût,
    risque,
    valeurAttendue,
    coûtPerçu,
    q_value: Number(q.toFixed(4))
  };
}

/**
 * Ajuste l'attractivité d'une option avec feedback dopamine.
 * L'historique récent pousse la valeur vers le haut (succès) ou bas (échec).
 */
function applyDopamineFeedback(opts) {
  const état = getDopamine(ctxId);
  const entry = état.historique.find(h => h.optionId === optionId);

  if (succès) {
    const delta = (magnitude || 0.1) * 0.5;
    if (entry) {
      entry.attraction = Math.min(2.0, entry.attraction + delta);
    } else {
      état.valeurs_attendues.set(optionId, 1.0 + delta);
    }
    état.historique.push({ optionId, succès: true, magnitude: magnitude || 0.1, at: Date.now() });
  } else {
    const delta = (magnitude || 0.1) * 0.3;
    if (entry) {
      entry.attraction = Math.max(0.1, entry.attraction - delta);
    } else {
      état.valeurs_attendues.set(optionId, Math.max(0.1, 1.0 - delta));
    }
    état.historique.push({ optionId, succès: false, magnitude: magnitude || 0.1, at: Date.now() });
  }

  if (état.historique.length > 20) {
    état.historique.shift();
  }

  return getDopamine(ctxId).valeurs_attendues.get(optionId) || 1.0;
}

/**
 * Sélectionne l'option optimale parmi plusieurs selon le modèle ganglia.
 * Retourne l'option avec le meilleur score (Q × attraction dopamine).
 */
function selectBestOption(ctxId, options) {
  if (!Array.isArray(options) || options.length === 0) {
    return { selected: null, raison: 'Aucune option fournie' };
  }

  const état = getDopamine(ctxId);

  const scored = options.map((opt, i) => {
    const id = opt.id || `opt_${i}`;
    const q = computeQValue(opt);
    const dopamine = état.valeurs_attendues.get(id) || état.baseline_attraction;
    const score = q.q_value * dopamine;

    return {
      ...opt,
      id,
      q_value: q.q_value,
      dopamine_attraction: dopamine,
      score_combiné: Number(score.toFixed(4)),
      classement: 0
    };
  });

  scored.sort((a, b) => b.score_combiné - a.score_combiné);
  scored.forEach((s, i) => { s.classement = i + 1; });

  return {
    options_scored: scored,
    selected: scored[0],
    raison: `Option "${scored[0].id || 'n°1'}" sélectionnée : score combiné ${scored[0].score_combiné} (Q=${scored[0].q_value}, dopamine=${scored[0].dopamine_attraction})`
  };
}

/**
 * Handler principal. Actions : evaluate, select, feedback, status.
 */
function handleGangliaBasals(args, run) {
  const action = (args.action || 'evaluate').toLowerCase();
  const ctxId = args.ctx_id || args.context_id || args.session || 'session-défaut';

  if (action === 'list') {
    const état = getDopamine(ctxId);
    return {
      configured: true,
      success: true,
      status: 'completed',
      transport: 'local',
      output: JSON.stringify({
        ctxId,
        nombre_options_suivies: état.valeurs_attendues.size,
        historique_longueur: état.historique.length,
        baseline_attraction: état.baseline_attraction,
        interprétation: `État dopamine pour "${ctxId}" : ${état.valeurs_attendues.size} options suivies.`
      }, null, 2)
    };
  }

  if (action === 'evaluate' || action === 'score') {
    const options = Array.isArray(args.options) ? args.options : [args];
    const résultat = selectBestOption(ctxId, options);
    return {
      configured: true,
      success: true,
      status: 'completed',
      transport: 'local',
      output: JSON.stringify(résultat, null, 2)
    };
  }

  if (action === 'feedback' || action === 'reward') {
    const optionId = args.option_id || args.id || 'option-inconnue';
    const succès = args.succès !== undefined ? Boolean(args.succès) : args.success !== undefined ? Boolean(args.success) : true;
    const magnitude = Number(args.magnitude || args.delta || 0.1);
    const nouvelleAttraction = applyDopamineFeedback(ctxId, optionId, succès, magnitude);
    return {
      configured: true,
      success: true,
      status: 'completed',
      transport: 'local',
      output: JSON.stringify({
        ctxId,
        optionId,
        feedback: succès ? 'positif' : 'négatif',
        magnitude,
        nouvelle_attraction: nouvelleAttraction,
        interprétation: `Feedback ${succès ? 'positif' : 'négatif'} appliqué. Attraction mise à ${nouvelleAttraction.toFixed(2)}.`
      }, null, 2)
    };
  }

  const état = getDopamine(ctxId);
  const summary = Array.from(état.valeurs_attendues.entries()).map(([id, att]) => ({
    optionId: id,
    attraction: att
  }));
  return {
    configured: true,
    success: true,
    status: 'completed',
    transport: 'local',
    output: JSON.stringify({
      ctxId,
      options: summary,
      historique_compact: état.historique.slice(-5),
      interprétation: `Ganglia basaux "${ctxId}" : ${summary.length} options, attraction baseline ${état.baseline_attraction}.`
    }, null, 2)
  };
}

function handleGangliaBasalsError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.message };
}

module.exports = { handleGangliaBasals, handleGangliaBasalsError };
