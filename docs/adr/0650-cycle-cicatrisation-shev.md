# ADR 0650 — Cycle de cicatrisation SHEV fondé sur les preuves

- **Statut** : Accepté pour le runtime local ; qualification de terrain non acquise
- **Date** : 2026-10-19
- **Domaine** : SHEV, Ontogenèse, effets projet, surveillance longitudinale
- **Lié à** : ADR 0295, ADR 0297, ADR 0333

## Contexte

SHEV savait relier une observation à une initiative Ontogenèse, puis séparer
l'intégration technique de l'effet projet et du progrès de l'agent. Il manquait
cependant une projection durable et lisible du processus complet. Un statut de
tâche, un transport réussi ou une seule mesure postérieure ne suffisent pas à
déclarer qu'un projet est rétabli.

Les fabriques de workflows continues automatisent l'observation, la construction,
le déploiement et la mesure. GenOS doit conserver cette continuité sans effacer
les abstentions, les rechutes, les preuves contradictoires ni les frontières
d'autorité existantes.

## Décision

Une dégradation SHEV observée et admise produit un `HealingEpisode` déterministe.
Sa chronologie append-only suit les phases suivantes :

1. `lesion` : dégradation sourcée ;
2. `hemostasis` : périmètre et version du mandat figés ;
3. `inflammation` : diagnostic admis dans le backlog Ontogenèse ;
4. `proliferation` : réparation isolée engagée ;
5. `remodeling` : effet initial vérifié et surveillance active ;
6. `healed`, `relapsed` ou `scarred` : issue explicite.

Chaque transition exige des références de preuve et respecte une machine à états
fermée. Le tick Ontogenèse réconcilie la projection sous son claim existant ; il
n'accorde aucune permission et ne contourne aucun gate. Une guérison exige deux
fenêtres de surveillance confirmées distinctes après l'effet initial. Ce seuil est
un contrat logiciel MVP, pas un optimum empirique.

Le dossier `genos.shev-healing-dossier/v1` vérifie la continuité de la chronologie,
agrège les références et expose un digest reproductible. Il déclare toujours
`causalAttribution = not_claimed` et `fieldQualification = not_established`.

## Conséquences

### Positives

- La boucle projet devient inspectable de la lésion à l'issue longitudinale.
- Les tâches réussies restent distinctes des effets vérifiés et de la guérison.
- Les abstentions et tentatives épuisées peuvent être conservées comme cicatrices.
- Une rechute est un résultat de première classe, jamais réécrit en succès.

### Négatives et limites

- Le seuil de deux fenêtres n'est pas calibré sur une campagne de terrain.
- Le runtime ne fournit pas un moteur général de process mining.
- Les adaptateurs disponibles couvrent des contrats explicites, pas toute la
  causalité métier.
- Une chronologie intègre prouve la cohérence des reçus fournis, pas leur
  indépendance réelle ni un gain causal contre un concurrent.

## Alternatives écartées

- Déduire la guérison du seul statut `done` : confusion entre exécution et effet.
- Écraser l'épisode à chaque phase : perte de provenance et de contre-preuves.
- Autoriser un score global à sauter des phases : contournement des gates.

## Vérification

- `node backend/tests/test_shev_healing_contract.js`
- `node backend/tests/test_shev_healing_integration.js`
- `npm --prefix backend run test:shev`
- `python scripts/ci/check_code_quality.py`
