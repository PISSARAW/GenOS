# 0565 — Unifier les contrats de variants topologiques

- **Statut** : Accepté
- **Date** : 2026-10-16
- **Domaine** : orchestration, morphogenèse, snapshots, variants
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0235, ADR 0292, ADR 0330, ADR 0445, ADR 0563

## Contexte

Les chemins de sélection, de classement, d'exécution et de snapshot utilisaient des
définitions différentes d'un même variant. Un `default` synthétique pouvait ainsi
être vide, une maturité acceptée par le générateur pouvait être refusée par le
classement, et un snapshot pouvait remplacer le variant persisté par une baseline.
Certains contrôleurs locaux publiaient en outre un résultat assimilable à une
exécution alors qu'ils n'avaient traversé aucun runtime durable.

## Décision

1. Une table canonique associe chaque topologie à sa baseline. Le variant `default`
   est un alias complet de cette baseline : paramètres, capacités, maturité et
   provenance sont conservés.
2. Les alias sont comparés sous une forme normalisée sans ponctuation, sans inventer
   de variant absent du catalogue.
3. Seule la maturité `implemented`, confirmée par une capacité d'exécution présente,
   est proposable. Les maturités `stable`, `partial`, `experimental` et `conceptual`
   restent observables mais exploratoires.
4. Une composition `NEST` n'est exécutable que si sa relation et son adaptateur ont
   tous deux un statut `verified`.
5. Le manifeste snapshot lie aussi `workerKind`, refuse les bindings excédentaires
   et valide la grammaire des scopes. `default` désigne le variant persisté lors
   d'une capture ; il ne le remplace jamais.
6. Le store de sessions conserve `variant_id`. Les huit topologies disposent au
   minimum des opérations communes `inspect`, `snapshot` et `events`.
7. Les contrôleurs locaux annoncent explicitement leur mode simulé. Lorsqu'une
   session durable est fournie, Biocénose et Rhizome délèguent à leur runtime réel.
   Aucun résultat simulé ne constitue une preuve de mission.

## Conséquences

### Positives

- la sélection, le classement, l'exécution et les snapshots parlent de la même
  identité de variant ;
- les baselines ne sont plus des candidats creux ;
- les aliases historiques restent compatibles sans créer de doublons ;
- les snapshots sont liés au type de worker et au variant réellement persisté ;
- les chemins conceptuels restent visibles sans devenir exécutables par accident.

### Négatives

- un appel qui dépendait d'un repli silencieux vers `default` est désormais refusé ;
- les intégrations doivent fournir des reçus mesurés ou des callbacks explicites ;
- les anciens manifests sans `workerKind` doivent être recapturés.

## Alternatives

- **Conserver un `default` virtuel** : rejeté, car il masque les paramètres et les
  capacités de la baseline.
- **Autoriser `stable` et `experimental` à l'exécution** : rejeté tant qu'aucun
  contrat commun ne distingue stabilité déclarative et preuve d'implémentation.
- **Accepter les contrôleurs mémoire comme runtimes** : rejeté ; un transport ou une
  simulation réussie ne prouve pas une décision valide.
