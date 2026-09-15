const affordancesLedger = new Map();

/**
 * @file affordancesScanner.js
 * @description Cortex pariétal numérique : scanne un environnement
 * (fichier, dossier, concept, outil MCP) et dérive les affordances —
 * ce que l'objet PERMET de faire, pas seulement ce qu'il EST.
 *
 * Inspiration biologique : le cortex pariétal code l'environnement
 * comme une série de boutons d'action prêts à être pressés (Gibson,
 * théorie des affordances). Un corbeau calédonien ne voit pas "brindille"
 * mais "outil extraction larve".
 *
 * État : `affordancesLedger` est une Map en mémoire de session.
 * Redémarrage du serveur MCP = ledger perdu (historique d'instantané
 * uniquement, pas de persistance DB).
 */

/** Équivalences affordances : ce que le contexte PERMET. */
const AFFORDANCE_LIBRARY = {
  fichier_js: ['exécuter', 'modifier', 'analyser_ast', 'tester', 'instrumenter', 'patcher'],
  fichier_py: ['exécuter', 'modifier', 'analyser_ast', 'tester', 'patcher'],
  dossier_projet: ['naviguer', 'chercher', 'créer_fichier', 'exécuter_commandes', 'mesurer_coverage'],
  workspace_genos: ['snapshotter', 'forker', 'replayer', 'évaluer_trajectoires', 'mesurer_budget'],
  outil_mcp: ['invoquer', 'inspecter_lease', 'mesurer_coût', 'vérifier_circuit'],
  script_shell: ['exécuter', 'modifier', 'analyser_dépendances'],
  config_fichier: ['lire', 'modifier', 'valider_syntaxe', 'recharger'],
  bdd_sqlite: ['interroger', 'migrer', 'seed', 'backup', 'analyser_performances']
};

/** Détection générique par extension + mots-clés. */
const GENERIC_DETECTORS = [
  { test: s => s.endsWith('.js') || s.endsWith('.mjs'), add: ['exécuter'] },
  { test: s => s.endsWith('.json'), add: ['lire'] },
  { test: s => s.includes('genos') || s.includes('matrix'), add: ['snapshotter', 'replayer'] },
  { test: s => s.includes('test') || s.includes('spec'), add: ['tester'] }
];

/**
 * Dérive les affordances à partir d'un chemin.
 * Fonction standalone pour testabilité.
 */
function deriveAffordancesFromPath(rawPath) {
  const pathStr = String(rawPath || '').toLowerCase();
  const affordances = new Set();

  for (const [pattern, actions] of Object.entries(AFFORDANCE_LIBRARY)) {
    if (pathStr.includes(pattern)) {
      for (const action of actions) affordances.add(action);
    }
  }

  addGenericAffordances(pathStr, affordances);
  return Array.from(affordances);
}

function addGenericAffordances(pathStr, affordances) {
  for (const detector of GENERIC_DETECTORS) {
    if (detector.test(pathStr)) {
      for (const action of detector.add) affordances.add(action);
    }
  }
}

/** Infère le type de contexte à partir du chemin cible. */
function inferContextType(target) {
  const lower = target.toLowerCase();
  if (lower.includes('genos') || lower.includes('matrix')) return 'workspace_genos';
  if (lower.includes('.js')) return 'fichier_js';
  if (lower.includes('sqlite') || lower.includes('bdd')) return 'bdd_sqlite';
  if (lower.includes('script') || lower.includes('.sh')) return 'script_shell';
  return 'fichier_js';
}

/** Évalue le niveau de saillance d'une affordance. Retourne 0..1. */
function salienceScore(affordance, contextType) {
  if (contextType === 'outil_mcp' && ['invoquer', 'inspecter_lease'].includes(affordance)) return 0.9;
  if (contextType === 'bdd_sqlite' && ['interroger', 'analyser_performances'].includes(affordance)) return 0.8;
  if (contextType === 'script_shell' && ['exécuter', 'analyser_dépendances'].includes(affordance)) return 0.85;
  if (contextType === 'fichier_js' && ['analyser_ast', 'tester'].includes(affordance)) return 0.75;
  return 0.5;
}

function isExecutableAction(affordance) {
  return affordance === 'exécuter' || affordance === 'invoquer';
}

/**
 * Handler action : scan.
 */
function handleScanAction(target) {
  const affordances = deriveAffordancesFromPath(target);
  const contextType = inferContextType(target);

  const scored = affordances.map(a => ({
    affordance: a,
    salience: salienceScore(a, contextType),
    can_execute: isExecutableAction(a)
  }));

  const key = `${target}::${Date.now()}`;
  affordancesLedger.set(key, { target, affordances: scored, scannedAt: new Date().toISOString() });

  return {
    configured: true,
    success: true,
    status: 'completed',
    transport: 'local',
    output: JSON.stringify({
      target,
      affordances: scored,
      count: scored.length,
      ledgerKey: key,
      interpretation: `L'environnement "${target}" offre ${scored.length} affordances détectées.`
    }, null, 2)
  };
}

/**
 * Handler principal. Actions : scan, list.
 */
function handleAffordancesScanner(args, run) {
  const action = (args.action || 'scan').toLowerCase();

  if (action === 'list') {
    return {
      configured: true,
      success: true,
      status: 'completed',
      transport: 'local',
      output: JSON.stringify({
        affordances: Object.keys(AFFORDANCE_LIBRARY),
        count: Object.keys(AFFORDANCE_LIBRARY).length
      }, null, 2)
    };
  }

  return handleScanAction(args.target || args.chemin || 'workspace');
}

function handleAffordancesScannerError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.message };
}

module.exports = { handleAffordancesScanner, handleAffordancesScannerError };
