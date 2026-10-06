#!/usr/bin/env node
// Lancer les 6 niveaux Syncytium via le chemin biologique complet GenOS
// (dispatch_biological + topologyHandlers + biologicalTopologyService — pas d'appel CRDT direct)
'use strict';
const { execFile } = require('child_process');
const path = require('path');

const LEVELS = [
  {
    id: 1,
    variantId: 'document',
    mission: `N1 — Glossaire GenOS : construisez collectivement un glossaire unique pour ces termes : agent, worker, orchestrateur, tâche, mission, outil, mémoire. Plusieurs participants peuvent proposer des définitions, mais l'état final ne doit contenir ni doublon ni contradiction.`
  },
  {
    id: 2,
    variantId: 'graph',
    mission: `N2 — Planning : construisez ensemble un planning à partir de ces dépendances : A avant C, B avant C, C avant D, B avant E, D et E avant F. Plusieurs noyaux peuvent travailler simultanément, mais le graphe partagé doit toujours rester acyclique et cohérent.`
  },
  {
    id: 3,
    variantId: 'code',
    mission: `N3 — Contrat API : base commune "L'API /users retourne id, name, email." Changements simultanés : équipe A veut ajouter avatar; équipe B veut rendre email optionnel; équipe C veut renommer name en displayName; équipe D exige une compatibilité ascendante pendant deux versions. Construisez un contrat final unique sans perdre les contraintes introduites par les autres participants.`
  },
  {
    id: 4,
    variantId: 'epistemic',
    mission: `N4 — Timeline causale : reconstruisez une timeline unique à partir de quatre journaux dont les horloges sont décalées. Service A : login 12:00:02, request 12:00:04. Service B : request reçue 11:59:59, DB call 12:00:01. DB : transaction start 12:00:07, commit 12:00:08. Gateway : token vérifié 12:00:05. On sait que A a +3 s, B a -2 s, DB a +5 s et Gateway a +1 s de décalage. Construisez progressivement un état causal partagé cohérent.`
  },
  {
    id: 5,
    variantId: 'code',
    mission: `N5 — Migration API : concevez un plan de migration d'une API utilisée par cinq services. Chaque spécialiste peut modifier contrat, tests, consommateurs ou déploiement, mais tous doivent partager en continu la même version logique du contrat. Invariants : aucune rupture de compatibilité pendant deux releases et aucune combinaison d'états intermédiaires ne doit rendre le système inutilisable.`
  },
  {
    id: 6,
    variantId: 'transactional',
    mission: `N6 — Système de paiement : construisez collectivement le modèle de données, les invariants et la machine à états d'un système de paiement. Plusieurs noyaux travaillent en parallèle sur paiement, remboursement, idempotence, fraude et rapprochement. À chaque modification, vérifiez qu'aucun invariant global n'est violé. Expliquez également l'ordre causal des changements et résolvez explicitement les écritures concurrentes incompatibles.`
  }
];

const ORCHESTRATOR_CLI = path.resolve(__dirname, '..', 'backend', 'bin', 'genos-orchestrate.cjs');
const WORKSPACE_ROOT = path.resolve(__dirname, '..', 'workspace');
const { classifyOutput } = require('./syncytium-launch-evidence.cjs');

async function launchLevel(level) {
  const start = Date.now();
  console.log(`\n=== N${level.id} — Lancement via dispatch_biological ===`);
  console.log(`Mission: ${level.mission.slice(0, 80)}...`);

  const payload = JSON.stringify({
    action: 'dispatch_biological',
    mode: 'syncytium',
    orchestratorId: `syncytium-n${level.id}-${Date.now()}`,
    mission: level.mission,
    workspace_root: WORKSPACE_ROOT,
    task: level.mission,
    request: {
      mode: 'syncytium',
      mission: level.mission,
      strategy: 'syncytium',
      agent_count: 3,
      variant_id: level.variantId,
      organization: 'memory_compilation'
    }
  });

  return new Promise((resolve, reject) => {
    const proc = execFile('node', [ORCHESTRATOR_CLI, payload], {
      timeout: 120000,
      env: { ...process.env, GENOS_WORKSPACE_ROOT: WORKSPACE_ROOT }
    }, (error, stdout, stderr) => {
      const elapsed = Date.now() - start;
      if (error) {
        console.error(`[N${level.id}] ERROR (code=${error.code}): ${stderr.slice(0, 300)}`);
        return resolve({ level, status: 'error', elapsed, error: error.message });
      }
      let output;
      try {
        output = JSON.parse(stdout.trim());
      } catch {
        output = { raw: stdout.slice(0, 500) };
      }
      const status = classifyOutput(output);
      console.log(`[N${level.id}] terminé en ${elapsed}ms — status: ${status}`);
      resolve({ level, status, elapsed, output });
    });

    proc.on('error', (err) => {
      const elapsed = Date.now() - start;
      console.error(`[N${level.id}] PROCESS ERROR: ${err.message}`);
      resolve({ level, status: 'error', elapsed, error: err.message });
    });
  });
}

async function main() {
  console.log('=== Syncytium biologique — 6 niveaux via dispatch_biological ===\n');

  const results = [];
  for (const level of LEVELS) {
    const result = await launchLevel(level);
    results.push(result);
    if (result.status !== 'completed') {
      console.error(`\n⚠ N${level.id} a échoué — on continue malgré tout.`);
    }
  }

  process.exitCode = results.every(result => result.status === 'completed') ? 0 : 1;
  console.log('\n=== Résumé ===');
  for (const r of results) {
    const m = r.output?.biologicalMode;
    console.log(`N${r.level.id}: ${r.status} (${r.elapsed}ms) — sessionId: ${m?.sessionId || 'N/A'} — members: ${m?.members?.length || 0}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
