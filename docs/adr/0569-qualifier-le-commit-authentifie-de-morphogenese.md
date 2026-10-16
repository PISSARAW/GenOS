# ADR 0569 — Qualifier le commit authentifié de morphogenèse

- **Statut :** Accepté comme feuille de route
- **Date :** 2026-10-16
- **Lié à :** ADR 0565, ADR 0566 (autorité Rust et snapshot durable), ADR 0566b, ADR 0567, ADR 0568

## Contexte

La morphogenèse GenOS dispose désormais d'un commit transactionnel compensé : autorité Ed25519 liée au plan et au snapshot, snapshot durable, journal d'actions, compensation, état `recovery_required`. Ce commit est implémenté dans `backend/src/services/morphogenesis/authorizedTransitionExecution.js`, mais son périmètre réel reste à qualifier de bout en bout.

Les écarts observés sont :

- la qualité statique passe (`6534 fichiers, 0 nouvelle violation`) ;
- `test_morphogenesis_authenticated_commit.js` était bloqué par un état hystérésique persistant partagé entre les appels (`genos-morphogenesis-hysteresis.json`) et ne passait pas de manière indépendante ;
- des modifications de refactorisation sont en cours dans `missionMorphogenesisContinuation` et les admissionRuntime/Transition admission ;
- l'inventaire d'atteignabilité morphogenèse date du 27 septembre 2026.

## Décision

1. Établir une baseline reproductible avant toute promotion adaptative :
   - binaire Rust du checkout (`cargo build -p genos-cli`) ;
   - test `test_morphogenesis_authenticated_commit.js` vert de façon isolée pour l'état hystérésique ;
   - inventaire d'atteignabilité remis à jour.
2. Qualifier le commit saga existant avec une transition d'action réelle, injection d'échec, redémarrage puis restauration. La qualification parle de **saga compensée**, pas de transaction atomique inter-processus.
3. Choisir le pilot operator sur critères explicites. `RESOURCE_REALLOCATION` n'est candidat que s'il modifie des réservations futures, jamais des tokens déjà consommés.
4. Scinder `morphogenese.md` en contrat runtime normatif, état de branchement vérifié, annexe de recherche.
5. Construire le corpus réel en shadow avec métriques pré-enregistrées, contrôles appariés, holdout, intervalles de confiance et détection de dérive. Aucun commit adaptatif avant remplissage des seuils.
6. Déployer progressivement (`allowlist projet/tenant`, `observe-only`, `canary`, `kill switch`, budget maximal, exercice de `recovery_required`).

## Conséquences

- Le critère de succès devient : un opérateur borné, autorisé, mesuré, restauré après panne injectée et activé sur un périmètre canary.
- Le travail ne change pas l'invariant fondamental : un transport réussi n'est pas une preuve de décision valide ; un échec fail-closed actuel reste normal pour les appels sans identité, DB, snapshot et autorité.
- Une correction de configuration du test (`GENOS_MORPHOGENESIS_HYSTERESIS_PATH` isolée) est intégrée à la baseline pour éviter l'état hystérésique partagé.
- Les modifications en cours sur l'admissionruntime et transitionadmission ne sont pas considérées implémentées tant que leurs tests E2E et de concurrence ne passent pas.

## Vérifications associées

- `npm --prefix backend run test:morphogenesis` pour la qualification de la suite morphogenèse ;
- `npm --prefix backend test` et `cargo test --workspace` pour la baseline complète ;
- l'ADR 0568 reste la base de la procédure pour l'adaptation intra-époch.