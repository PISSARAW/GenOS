# ADR 0603 — Relier la nosologie et la morphogenèse

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Portée** : backend, nosologie Node et Rust, planification et continuation morphogénétiques

## Contexte

La surveillance clinique Node, le catalogue nosologique Rust et la morphogenèse
étaient trois surfaces distinctes. La quarantaine bloquait déjà certains spawns,
mais la décision d'époque ne consommait ni les diagnostics confirmés, ni les neuf
familles, ni les effets iatrogènes et nosocomiaux. Une réussite de transport pouvait
donc atteindre la planification sans que son contexte clinique soit explicite.

## Décision

Introduire un adaptateur de preuves et un pont de politique versionné
`genos.morphogenesis-nosology/v1`.

L'adaptateur lit, dans le périmètre courant :

- les états cliniques et diagnostics confirmés Node des agents de la mission ;
- les applications thérapeutiques Rust terminées, liées à la mission, à
  l'organisation et au projet ;
- les pathologies actives et la quarantaine présentes dans le reçu Rust.

Le pont est chargé avant la sélection morphologique initiale puis à chaque frontière
d'époque. Il conserve les neuf familles, distingue preuve diagnostique et simple pression
observationnelle, puis projette ces pressions vers les signaux bornés de la politique
morphogénétique. Il ajoute une réponse clinique, les obligations de relecture clinique,
de confinement et d'autopsie causale, sans autoriser une thérapie.

La quarantaine de l'orchestrateur est une porte dure : la politique devient
`blocked`, sa recette devient `NO_CHANGE` et la continuation s'arrête avant le
planificateur. La quarantaine d'un worker reste visible pour son exclusion et les
preuves de confinement, sans immobiliser automatiquement toute la mission.

## Frontières d'autorité

- Un diagnostic ne constitue pas une autorisation thérapeutique.
- Le pont ne déclenche ni thérapie, ni spawn, ni transition, ni récupération.
- Les autorisations signées, leases, budgets, quiescence et reçus indépendants
  conservent leurs portes propres.
- Une base clinique indisponible produit un état `unavailable` ou `unknown`; elle ne
  fabrique aucun diagnostic. La porte d'exécution existante reste fail-closed.
- Une pression dérivée de métriques opérationnelles n'est jamais présentée comme un
  diagnostic confirmé.

## Conséquences

La morphogenèse peut désormais expliquer quelle famille ou catégorie transversale
influence sa représentation, son intervention candidate et ses obligations de preuve.
Les reçus thérapeutiques Rust et l'état clinique Node participent à une même décision
sans fusionner leurs modèles ni masquer leur provenance.

Le coût est une lecture bornée supplémentaire à chaque frontière d'époque. Les
résultats sont limités aux agents de la mission, à 256 diagnostics et à 64 applications
Rust récentes. La calibration empirique des correspondances famille/intervention reste
une campagne distincte ; sans preuve comparative, `NO_CHANGE` demeure la référence.

## Vérification

- `node backend/tests/test_morphogenesis_nosology_bridge.js`
- `node backend/tests/test_morphogenesis_main_path_activation.js`
- `node backend/tests/morphogenesis/test_conditional_morphogenesis_policy.js`
- `node backend/tests/test_morphogenesis_replacement_roster_planning.js`
- `python scripts/ci/check_code_quality.py`
