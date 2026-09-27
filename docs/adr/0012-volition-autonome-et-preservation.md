# ADR 0012 — Volition autonome et préservation

- **Statut** : Accepté (amendé 2026-09-27 pour aligner la Décision sur l'implémentation)
- **Date** : 2026-09-15 (amendement 2026-09-27)
- **Domaine** : Orchestration, survie, autonomie
- **Décideurs** : Mainteneurs GenOS (runtime)
- **Lié à** :
  - `../../crates/genos-orchestrator/src/volition.rs` (`VolitionState::propagate`, `demands_vital_reflex`, `vital_reflex`, `express_free_desire`)
  - `../../crates/genos-orchestrator/src/drives.rs` (`Drives::from_state`, pression de survie instantanée)
  - `../../crates/genos-orchestrator/src/tick.rs` (`pre_deliberation`, court-circuit avant délibération)
  - `../../backend/src/services/survivalModelService.js` (`evaluateSurvival`, pressions et politique de survie)
  - `../../backend/src/services/survivalStateService.js` (machine d'états nominal/stressed/protected/dormant)
  - `../../backend/src/services/proceduralApoptosisService.js` (`shouldApoptose`, `apoptose`, état terminal)
  - Tests : `volition.rs` (module `tests` : persistance du drive, désir libre, `reflexe_vital_court_circuite_le_director_hors_de_toute_mission`), `../../backend/tests/test_survival_model.js`, `../../backend/tests/test_survival_state_service.js`, `../../backend/tests/test_apoptosis_and_daemon.js`

## Contexte

GenOS observe le monde (pression budgétaire, stress, menace, intégrité membranaire) et en dérive une pression de survie. Deux couches coexistent : côté Rust, `Drives::from_state` calcule une pression instantanée tandis que `VolitionState::propagate` lui ajoute une mémoire endogène (moyenne mobile, inertie d'un tick à l'autre) ; côté Node, le modèle de survie dérive pressions (`starvation`, `predation`, `injury`, …) et politique (conserver, mettre en quarantaine, hiberner). La version initiale de cet ADR décrivait la volition uniquement comme « demande de planification », ce qui contredit le code vérifié : `tick.rs:56-58` exécute `vital_reflex()` avant toute délibération Director/Planner et retourne un `reflex_report()` sans plan.

## Décision

GenOS expose une volition interne de préservation qui peut sélectionner le but endogène `Conserve` sans mission externe. On distingue deux régimes :

1. **Demande de planification (cas général)** : la pression de survie alimente le sélecteur de but et le Director/Planner. Elle ne peut pas élargir les permissions, les leases, le budget, le sandbox, les gates de preuve ou la promotion.
2. **Réflexe vital (exception bornée, crise physique réelle)** : quand `survival_drive >= 0,85` **et** l'intégrité membranaire totale est `< 0,3`, `vital_reflex()` agit directement, hors Director/Planner et hors mission contractuelle : débit de 5,0 ATP, réparation membranaire de 0,15, événement `VITAL_REFLEX` avec la pression mesurée. Le tick retourne alors un bilan sans plan ni exécution (`reflex_report`).

Un état apoptotique est terminal pour la boucle autonome et inhibe toute action (`halted_report("etat apoptotique: volition inhibee")`, `express_free_desire` refuse si `state.apoptotic`).

## Conséquences

- Positives : la décision reste déterministe et testable à partir du `WorldState` ; la survie en crise physique ne dépend pas d'une délibération qui pourrait ne jamais aboutir ; le réflexe est borné (seuil double, coût ATP, réparation fixe) et tracé (`VITAL_REFLEX`, `last_vital_reflex`).
- Négatives : deux chemins d'action coexistent (planifié vs réflexe), ce qui exige de maintenir la distinction dans les audits ; le réflexe consomme de l'ATP même en famine et échoue silencieusement si le métabolisme refuse le débit.
- Neutres : le désir libre (`express_free_desire`, vagabondage autotélique) reste hors mission mais passe après le réflexe vital et devant les instincts ; il ne résout aucun déficit mesurable.

## Alternatives

- **Volition purement planifiée (texte initial de l'ébauche)** : rejetée — contredite par `volition.rs:115-140` et `tick.rs:49-62` ainsi que le test de court-circuit ; une crise membranaire ne peut pas attendre une délibération.
- **Réflexe vital sans garde membranaire (pression seule)** : rejetée — la pression psychologique (menace, stress) est déjà gérée par la mission normale (`RecoverAgent`, `SecurePerimeter`) ; seul un péril physique (`total_integrity < 0,3`) justifie le court-circuit.
- **Ticket code séparé pour supprimer le réflexe** : rejeté — le comportement est testé, borné et tracé ; toute suppression relèverait d'un nouvel ADR, pas d'un correctif.
