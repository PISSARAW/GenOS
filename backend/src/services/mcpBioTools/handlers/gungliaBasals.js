'use strict';

/**
 * @file gangliaBasals.js
 * @description Algorithme de sélection coût/bénéfice inspiré des ganglia
 * basaux (noyaux gris centraux).
 */

const { AdaptiveStateService } = require('../../adaptiveStateService');

let adaptivePersister = null;

function setAdaptivePersister(persister) {
  if (persister instanceof AdaptiveStateService) adaptivePersister = persister;
}

function getAdaptivePersister() {
  return adaptivePersister;
}

// État legacy en mémoire
const legacyDopamineState = new Map();

function getLegacyDopamine(ctxId) {
  let état = legacyDopamineState.get(ctxId);
  if (!état) {
    état = {
      ctxId,
      valeurs_attendues: new Map(),
      historique: [],
      baseline_attraction: 1.0,
      originatedAt: new Date().toISOString()
    };
    legacyDopamineState.set(ctxId, état);
  }
  return état;
}

function getDopamine(ctxId) {
  if (adaptivePersister) {
    return adaptivePersister.getDopamineState(ctxId);
  }
  return getLegacyDopamine(ctxId);
}

function persistDopamineIfNeeded(ctxId, état) {
  if (!adaptivePersister) return;
  adaptivePersister.setDopamineState(ctxId, état).catch(() => {
    legacyDopamineState.set(ctxId, état);
  });
}

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

function applyDopamineFeedback(opts) {
  const { ctxId, optionId, succès, magnitude } = opts;
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

  persistDopamineIfNeeded(ctxId, état);

  return état.valeurs_attendues.get(optionId) || 1.0;
}

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

function handleList(ctxId) {
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
      persiste: !!getAdaptivePersister(),
      interprétation: `État dopamine pour "${ctxId}" : ${état.valeurs_attendues.size} options suivies.`
    }, null, 2)
  };
}

function handleEvaluate(ctxId, args) {
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

function handleFeedback(ctxId, args) {
  const optionId = args.option_id || args.id || 'option-inconnue';
  const succès = args.succès !== undefined ? Boolean(args.succès) : args.success !== undefined ? Boolean(args.success) : true;
  const magnitude = Number(args.magnitude || args.delta || 0.1);
  const nouvelleAttraction = applyDopamineFeedback({ ctxId, optionId, succès, magnitude });
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
      persiste: !!getAdaptivePersister(),
      interprétation: `Feedback ${succès ? 'positif' : 'négatif'} appliqué. Attraction mise à ${nouvelleAttraction.toFixed(2)}.`
    }, null, 2)
  };
}

function handleStatus(ctxId) {
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
      historique_longueur: état.historique.length,
      persiste: !!getAdaptivePersister()
    }, null, 2)
  };
}

function handleGangliaBasals(args, run) {
  const action = (args.action || 'evaluate').toLowerCase();
  const ctxId = args.ctx_id || args.context_id || args.session || 'session-défaut';

  if (action === 'list') return handleList(ctxId);
  if (action === 'evaluate' || action === 'score') return handleEvaluate(ctxId, args);
  if (action === 'feedback' || action === 'reward') return handleFeedback(ctxId, args);

  return handleStatus(ctxId);
}

module.exports = { handleGangliaBasals };
