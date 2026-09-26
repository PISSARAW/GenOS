# ADR 0134 — Boucles réflexives fonctionnelles (indicateurs, jamais conscience)

- **Statut** : Accepté (implémenté, 2026-09-26)
- **Décideurs** : runtime GenOS (control plane Node)
- **Fichiers** : `backend/src/services/{agentSelfBlocks,coreSelfService,abstentionService,metacognitionBenchService,efferenceCopyService,worldModelService,ignitionService,reverberationService,idleTickService,sleepConsolidationService,predictiveHierarchyService,integrationProxyService,attentionSchemaBenchService,attentionProbeService,counterfactualRolloutService,routingBanditService}.js`, `backend/server.js`, `backend/bin/agent-runtime-prompt.cjs`, runtimes et pipeline listés ci-dessous.

## Contexte

Le runtime encadrait déjà les agents (budgets, evidence, apoptose) mais la
réflexivité restait déclarative : identité récitée, calibration agrégée,
mémoire non bouclée, capture autobiographique souscrite à un événement jamais
émis (`telemetryObserver` n'émettait pas `telemetry`). Parallèlement, la
littérature (Butlin et al. 2023/2025, Cogitate 2025) ne fournit aucun test
validé de conscience, seulement des familles d'indicateurs fonctionnels.

## Décision

Implémenter les indicateurs comme boucles de contrôle mesurables, avec trois
motifs invariants :

1. **Best-effort** : tout chargeur/consommateur réflexif dégrade en valeur vide,
   jamais d'exception vers le chemin nominal (ex. calibration terminale,
   capture, ticks).
2. **Borné** : registres (20 copies/attributions/transitions, 10 rollouts,
   16 bras), passes (5), TTL, wall-clocks, balayages (5 agents), opt-out env.
3. **Avis seulement** : les nouveaux modules informent (scores, verdicts,
   instantanés joints au plan) ; seules les gates préexistantes (jury,
   promotion, approbation, leases) décident — sauf resserrements explicites
   (`requireIndependentEvidence`, intersection de lease, blocage `blocked`).

Branchements retenus : capture sur bus `telemetry` (réafférence ×0,5,
ignition) ; rappel avant plan (ajustements + instantanés) ; opt-out et banc au
plan ; prédictions/surprise/hiérarchie au runtime ; calibration, attribution,
consolidation et tick en fin de mission ; scheduler endogène au boot
(`GENOS_JOB_WORKER`, opt-out `GENOS_IDLE_TICK_AUTONOMOUS=0`).

## Conséquences

- Positives : métacognition mesurée (ECE/Brier/AUC type-2) au lieu de déclarée ;
  opt-out resserré par la surconfiance mesurée ; traçabilité complète
  (chaque rapport porte sa limitation) ; 12/15 familles d'indicateurs couvertes
  fonctionnellement (voir `docs/01-concepts/indicateurs-fonctionnels.md`).
- Négatives : +~1500 lignes de services et requêtes DB par événement typé
  (capture) et par mission (rappel, banc) ; `agentAutonomyPlanService.js` à
  399/400 lignes (prochaine touche = extraction) ; suites backend exigent
  SQLite natif fonctionnel.
- Neutres : comportements LLM inchangés sans données (retombées `''`,
  `insufficient_data`, `unavailable`) ; prompts enrichis seulement si blocs
  chargés.

## Alternatives rejetées

- **Clamer une conscience** : rejeté — aucun test ne le permettrait (Searle,
  Cogitate 2025) et cela violerait le contrat claim/evidence du dépôt.
- **Boucle autonome auto-entretenue sans déclencheur** : reportée — exige un
  scheduler avec préemption dédiés ; l'oscillateur actuel reste piloté par
  l'activité (missions, boot).
- **Injection vésiculaire live, ordonnancement par bandit, rollout Trinity
  libre** : reportés après audit (désaccord routeur/bandit, livraison
  incertaine, coût ×N) — documentés comme étapes suivantes, jamais comme acquis.
