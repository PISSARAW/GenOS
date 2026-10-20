# ADR 0656 — Registre unifié des runtimes de variants Metapopulation

- **Statut** : Accepté
- **Date** : 2026-10-20
- **Domaine** : Metapopulation, runtime régional, variants
- **Lié à** : ADR 0126, ADR 0293, ADR 0330

## Contexte

Le contrôleur régional distribuait l'exécution et la vérification des actions entre deux
modules publics distincts. Les consommateurs devaient connaître cette séparation et la
politique de sélection ne permettait pas de résoudre directement le contrat runtime du
variant choisi. Cette dispersion augmentait le risque qu'un nouveau variant soit déclaré
dans le catalogue sans exposer la même frontière d'exécution et de vérification.

## Décision

Un registre unique, `variantRuntimeRegistry`, associe chaque variant déclaré au même contrat
runtime : exécuter une action, vérifier les effets du plan, vérifier la topologie et vérifier
les coupe-feu. `metapopulationPolicyService` est l'unique point de résolution d'un contrat
runtime à partir d'un variant valide. Le contrôleur régional et le calcul de maturité
consomment cette résolution au lieu de dépendre des anciens modules d'exécution et de
vérification.

Les tables d'exécuteurs restent centralisées dans le registre. Les vérifications persistantes
sont déléguées à un module interne afin de respecter la limite de taille des fichiers. Cette
délégation ne constitue pas une seconde API de sélection : le registre reste la frontière
publique. La vérification culturelle est intégrée à ce module interne et les trois anciens
fichiers sont supprimés, ce qui réduit d'une unité le nombre de services dans le répertoire
runtime.

## Conséquences

- Toute résolution d'un variant inconnu échoue avec le contrat de politique existant.
- Tous les variants exposent uniformément exécution et vérifications sans modifier leurs
  effets SQLite, leurs reçus ni leurs portes de preuve.
- L'ajout d'un variant exige son inscription dans le catalogue de politique et dans le
  registre runtime ; les tests de maturité détectent toujours les actions sans gestionnaire.
- Les anciens chemins privés `variantActionExecutors` et `variantActionVerifiers` ne sont
  plus des points d'import valides ; les consommateurs internes utilisent le registre.

## Alternatives écartées

- Conserver deux façades publiques : rejeté, car la sélection et la vérification pouvaient
  diverger entre consommateurs.
- Fusionner toute l'implémentation dans un seul fichier : rejeté, car cela dépasserait la
  limite de 400 lignes et mêlerait orchestration du registre et relecture des preuves.
- Modifier les effets ou les critères de preuve pendant la consolidation : rejeté, car ce
  refactoring doit préserver le comportement observable.

## Références

- [ADR 0126](0126-lier-les-politiques-de-metapopulation-au-runtime-regional.md)
- [ADR 0293](0293-persistance-des-variants-metapopulation.md)
- [ADR 0330](0330-effets-durables-metapopulation.md)
- [Runtime Metapopulation](../03-reference/runtime-metapopulation.md)
