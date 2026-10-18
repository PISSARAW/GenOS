# ADR 0644 — Calibration et projection nosologique traçable

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Portée** : catalogue nosologique, pont nosologie→morphogenèse, campagnes de qualification

## Contexte

Le pont introduit par l'ADR 0603 projetait les neuf familles sur huit signaux au moyen
d'une table fixe. La pression d'une famille était le maximum de ses observations et
une seule famille principale déterminait la réponse clinique exposée. Les 28
conditions restaient disponibles dans les diagnostics et les thérapies, mais leur
identité était perdue dans la projection. Les seuils `0.5`, les effets thérapeutiques
généralement égaux à `0.25` et cette projection disposaient de tests de contrat, pas
d'une calibration de qualité décisionnelle. Les seuils AEIS `5/15/30/50` appartiennent
à un autre sous-système et ne font pas partie de cette décision.

## Décision

Conserver `family_max_v1` comme référence de production tant qu'une alternative n'a
pas franchi une campagne comparative vérifiée. Le pont expose désormais :

- chaque contribution avec sa condition, sa source, sa pression et sa nature
  diagnostique ou observationnelle ;
- la pression de pointe compatible v1 et une pression convergente `noisy-OR` bornée ;
- un profil par condition et toutes les recommandations de familles actives, en plus
  de la réponse principale compatible ;
- quatre bras reproductibles : `family_max_v1`, `raw_signals`,
  `condition_noisy_or_v2` et `no_change`.

`condition_noisy_or_v2` est une hypothèse shadow. Sa table condition→signaux n'est
pas présentée comme calibrée. Sa sélection exige à la fois une demande explicite et
une campagne de holdout commune qui la montre supérieure aux trois contrôles. La
campagne refuse les observations non signées, non indépendantes, non appariées ou
insuffisamment diversifiées. Une qualification n'autorise ni intervention ni
promotion automatique ; elle ne vaut que pour le corpus observé.

Les observations admises sont conservées dans un journal SQLite append-only dédié,
scopé par mission, organisation et projet. Le cycle d'époque recharge ce journal ;
une collision d'identité ou une altération du contenu invalide l'observation.

Le catalogue partagé porte en outre une métadonnée de calibration lisible par Rust.
Elle qualifie `0.5`, `0.25`, `maximum_v1` et `noisy_or_v2` comme valeurs d'ingénierie
non calibrées et nomme leur porte de promotion. Les valeurs runtime restent inchangées
tant qu'une campagne bénéfice/risque ou train/holdout ne fournit pas de remplacement.

## Conséquences

Une décision peut être auditée jusqu'au diagnostic source sans gonfler artificiellement
le catalogue. La convergence de plusieurs indices devient mesurable sans modifier la
production. Les comparaisons contre signaux bruts et abstention sont exécutables, mais
aucun gain n'est revendiqué par les seuls tests synthétiques de contrat.

Le coût est un reçu plus riche et l'exécution shadow de quatre projections pures à la
frontière d'époque. Les listes restent bornées par les limites de lecture de l'ADR 0603.

## Vérification

- `node backend/tests/test_morphogenesis_nosology_bridge.js`
- `node backend/tests/test_morphogenesis_nosology_calibration.js`
- `node backend/tests/test_morphogenesis_nosology_outcome_store.js`
- `cargo test -p genos-biology --test nosology_catalog`
- `python scripts/ci/check_code_quality.py`
