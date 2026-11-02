# ADR 0773 — Qualifier le livrable final intégré avec GQEL

- **Date :** 2026-11-02
- **Statut :** Implémenté dans les parcours Node locaux décrits ci-dessous.
- **Portée :** A-Team canonique et synthèse native de l'orchestrateur.

## Contexte

La conformité de chaque contribution ne prouve pas celle du livrable collectif.
Une concaténation des rapports ne constitue pas une intégration. La mission doit
identifier le producteur de l'artefact final avant l'exécution et vérifier sa
preuve de qualité avant la clôture collective.

## Décision

Un contrat GQEL déclaré au niveau de l'A-Team s'applique à un membre d'intégration
réel, appartenant au TeamRun et au WorkGraph. Le champ optionnel
`qualityRuntime.finalArtifactMemberId` sélectionne ce membre par identité ou alias
non ambigu. Sans sélection, seul un membre terminal unique est accepté.

Le membre sélectionné doit dépendre transitivement de toutes les autres
contributions dans un graphe acyclique. Les handoffs existants restent vérifiés.
Le contrat et les routes collectifs lui sont affectés avant sa persistance et
son lancement. Il utilise son propre run, son autorité et sa tranche budgétaire.
Cette intégration n'ajoute aucun worker ni crédit : une organisation ambiguë ou
sans intégrateur couvrant les producteurs est refusée explicitement.

La clôture vérifie l'artefact typé exact de ce membre, son reçu signé persisté,
le dernier run observé indépendamment et sa complétion native scellée. L'enveloppe
doit appartenir au même orchestrateur et avoir été scellée après la formation
du TeamRun. Une ancienne réponse encore valide ne suffit pas pour une nouvelle
formation ou une nouvelle tentative.

Un registre `gqel_final_artifacts` conserve l'artefact final signé, ses références
de contrat, de run et de reçu. Les résultats et l'état d'intégration exposent
`finalQuality`. L'invariant supplémentaire `final_artifact_quality_satisfied`
vérifie ce reçu ; aucun booléen fourni par l'appelant ne le remplace. Les portes
de couverture, d'intégration, de statistique et d'oracle restent nécessaires.

Le parcours de synthèse local de l'orchestrateur traite également son contrat
GQEL de premier niveau, sur son artefact réel et dans son propre run scellé.
Un worker sans contrat explicite ne reçoit pas implicitement cette obligation.
Le type d'artefact est choisi avant le scellement. L'exécuteur effectivement
résolu doit être local ; les valeurs externes demandées, héritées de
l'environnement ou choisies par défaut échouent explicitement. La branche
native anticipée des workers est désactivée pour l'orchestrateur concerné afin
que les contributions et leur barrière précèdent la synthèse. Le code final
exige le parcours protégé et ses droits explicites ; aucun résumé ne remplace
son artefact et ses tests.

## Frontières

Les actions directes de topologie sans étape de synthèse globale raccordée
refusent une obligation globale avec `GQEL_FINAL_INTEGRATION_REQUIRED` ; les
contrats explicites des workers restent distincts. Le raccord ne fournit pas
automatiquement un pilote GQEL pour chaque harness externe ou pour Rust.
Une obligation globale multiteam est également refusée tant qu'aucune étape
finale équivalente n'est raccordée ; les succès des sous-équipes ne la satisfont pas.

L'acceptation GQEL satisfait une grille bornée, sans autoriser la promotion de
mission ni démontrer une supériorité artistique. Les tests utilisent des réponses
synthétiques et ne constituent pas une campagne comparative sur modèle réel.

## Validation

- `node backend/tests/test_gqel_final_artifact.cjs` : intégrateur financé,
  couverture des producteurs, persistance signée, refus des altérations et des
  replays, conservation des autres portes de clôture.
- `node backend/tests/test_gqel_final_synthesis.cjs` : identité d'orchestrateur et
  enveloppe SQLite réelles, critique synthétique routée et reçu du texte exact.
- `node backend/tests/test_gqel_final_execution.cjs` : résolution effective des
  exécuteurs, refus du défaut externe, choix du type avant scellement et
  dispatch final natif après la barrière avec effets de lancement substitués.
- `node backend/tests/test_quality_elevation_loop.js` : suites GQEL natives
  intégrées au parcours de test déjà exécuté par `npm test`.
