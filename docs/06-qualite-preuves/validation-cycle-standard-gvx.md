# Validation du cycle standard GVX

- **Statut** : validation fonctionnelle exécutée ; qualification métier et campagne empirique à établir.
- **Date** : 2026-10-06.
- **Code évalué** : commit `ac3423cbd00ed2ce67c724f159769c6f0fab3762`.
- **Portée** : cycle de politiques AGOW déclaratives via profils opérateur épinglés.

## Commande et résultats

Depuis la racine du dépôt :

`node backend/bin/test-gvx.cjs`

La passe exécutée rapporte **21 fichiers de tests, aucun échec**. Le lanceur découvre les tests GVX et le pont développemental, puis exécute chaque fichier dans un processus Node distinct. Le contrôle qualité strict du lot a vérifié **56 fichiers source, aucune violation** ; le reçu du commit liste exactement ses 63 fichiers modifiés.

| Scénario | Preuve fonctionnelle |
| --- | --- |
| [Cycle standard](../../backend/tests/test_gvx_standard_cycle.js) | Service de vérification dans un processus séparé, mesures signées, application de politique, trois contextes de suivi, crédit après maturation, réouverture de la base et rejeu sans nouvelle évaluation ni crédit |
| [Reprise](../../backend/tests/test_gvx_standard_recovery.js) | Interruption pendant le suivi, maintien des étapes persistées, reprise sans seconde application et refus de contrôles modifiés |
| [Régression](../../backend/tests/test_gvx_standard_rollback.js) | Régression safety vérifiée indépendamment, restauration du parent exact, aucun crédit positif et rejeu terminal |
| [Contrôles adversariaux](../../backend/tests/helpers/gvxAdversarialChecks.js) | Refus des mesures falsifiées, contextes réattribués, mauvais agent, application inexistante et tentative de crédit supplémentaire |

Les autres fichiers couvrent ledger, interoception, pont AGOW, transformations, compétences/curriculum, protocoles, nursery, monitoring, transfert, AgentGit et gate de méta-politique. Leur passage valide les contrats exercés par leurs fixtures.

## Limites de la preuve

Les évaluateurs de test utilisent des tâches synthétiques déterministes ; ils n’exécutent aucun modèle LLM. Les huit évaluations du cycle nominal à trois fenêtres sont des mesures fonctionnelles de la fixture, pas des réplications indépendantes d’un benchmark métier. La séparation des processus et répertoires ne démontre pas un confinement OS de code hostile ; le mode UID/GID Linux n’a pas été qualifié par cette passe Windows.

La vérification globale demandée par le dépôt n’est pas entièrement verte : `npm test` et `cargo test --workspace` ont rencontré des erreurs de stockage `SQLITE_FULL`/`ENOSPC` pendant les travaux concurrents ; le contrôle qualité global a relevé des violations hors du lot GVX. La réussite ciblée ne vaut pas réussite globale du monorepo.

## État de livraison

L’opérateur doit encore qualifier les tâches et l’évaluateur, provisionner les profils, les clés, le store et les droits d’accès à la base runtime. Les lots de compétences, transmission et méta-développement conservent les limites indiquées dans le [plan d’implémentation](plan-implementation-gvx.md). Aucune promotion germinale automatique n’est livrée par ce cycle.

La campagne empirique GVX reste `not_run` et différée pour privilégier l’implémentation. Elle demande jeux train/holdout qualifiés, runners de modèles et vérificateurs métier de campagne ; ses exigences sont décrites dans le [plan de benchmark](../02-orchestration/plan-puissance-benchmark-gvx.md).

Voir le [profil opérateur](../02-orchestration/profil-execution-gvx.md), le [service externe](../05-securite-gouvernance/service-verificateur-gvx.md) et [ADR 0328](../adr/0328-cycle-standard-gvx-verifie-et-reprenable.md).
