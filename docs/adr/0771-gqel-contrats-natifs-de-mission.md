# ADR 0771 — Obligation GQEL dans les contrats natifs de mission

- **Date :** 2026-11-02
- **Statut :** Implémenté pour la préparation et la propagation des contrats Node.js.
- **Portée :** obligation de qualité, configuration des routes, autorité d'exécution.

## Contexte

Le contrôle des artefacts workers connaissait GQEL, mais les constructeurs usuels
de missions et de contrats ne propageaient pas son obligation. Un script pouvait
exécuter une boucle isolée sans que cette exigence soit liée à la mission.

## Décision

Une mission peut déclarer explicitement `qualityElevation`, sous forme d'options
compilées avant l'exécution ou de contrat `genos.gqel-contract/v2` déjà compilé.
Le contrat compilé est vérifié et gelé ; un contrat persisté n'est jamais recompilé.
`qualityRuntime` contient les routes du générateur et des lecteurs ainsi que
l'option `planScenes`. Cette configuration est copiée dans le contrat worker.

Le contrat porté par l'orchestrateur concerne le livrable final. Les workers
reçoivent uniquement l'obligation explicitement déclarée dans leur affectation.
Un critique ou un observateur n'hérite donc pas des exigences de rédaction de
l'auteur. Une mission sans obligation conserve son comportement antérieur.

Les constructeurs de dispatch direct, de flotte et de topologie, le bootstrap,
le contexte CLI et le parcours local Windows transportent ces champs. Le
bootstrap restaure la configuration persistée et refuse sa substitution ou sa
suppression explicite lors du dispatch.

L'enveloppe d'autorité lie l'identité et l'empreinte du contrat, les routes et
le contexte de réparation de la tentative. Modifier ces données après scellement
invalide l'exécution. `qualityRepair` reste un diagnostic propre à la tentative,
séparé du contrat de qualité stable ; chaque tentative doit recevoir son autorité.

## Limites et conséquences

Cette décision définit le raccord contractuel, pas l'exécution de la boucle ni
une autorisation de promotion finale. Les appels modèles, les preuves durables,
le traitement des blocages et la qualification du livrable collectif font l'objet
des étapes d'intégration suivantes. Les chemins Rust ne reçoivent pas implicitement
une implémentation GQEL par cette modification Node.js.

## Validation

`node backend/tests/test_gqel_native_contracts.cjs` vérifie la propagation réelle
dans les constructeurs, l'absence d'héritage global vers les observateurs, la
restauration des contrats et les refus de mutation dans une enveloppe signée
persistée en SQLite. Aucun modèle n'est appelé par cette suite.
