# Plan d'implémentation — fermeture causale de la Natural Creative Ecology

- **Statut** : Lots exécutables livrés pour les familles numériques bornées ; aucune créativité générale revendiquée
- **Portée** : parcours Play, développement et mesure du phénotype, transfert culturel, POET, puis protocole d'ablation
- **Fiche de référence** : [Natural Creative Ecology](natural-creative-ecology.md)
- **Dernière revue** : 2026-10-06

## Livraison logicielle — état revu le 2026-10-06

| Lot | Réalisation vérifiable |
| --- | --- |
| 0 | Reçus versionnés, hashes, identifiants de cycle, idempotence, sauvegarde atomique de l'état et du reçu avec contrôle de révision |
| 1 | Vecteur structurel v3 conservé ; vecteur créatif v1 à huit dimensions, masque de présence et preuves obligatoires |
| 2 | Procédures exécutables transmises entre agents ; gain avant/après sur tâches contrôlées ; reprise SQLite ; contrôles négatifs |
| 3 | Worker natif dans un vrai processus, Play sur snapshots, budgets nuls respectés, rollback sur échec de benchmark |
| 4 | Générateur de trois familles vérifiables, sélection training figée avant held-out, procédure promue et phénotype persistés |
| 5 | Six bras d'ablation réellement exécutés, deux graines dans la régression, sorties brutes et coûts conservés |

Contrats, commandes et limites : [Expériences NCE](../03-reference/experiences-nce.md).
Le tableau décrit la livraison bornée ; il ne clôt pas tous les critères de
recherche du plan initial. Les observations de la section suivante sont historiques. Le lot 5
n'établit pas une supériorité statistique générale ; O/H restent inconnus sans
observations dédiées et les familles de tâches ouvertes restent hors du runtime natif.

## Objectif

Établir une chaîne vérifiable entre les mécanismes NCE et leurs effets observés sur une tâche, sans confondre transport, exécution réussie, changement d'état et preuve causale. Les tests d'intégration doivent d'abord valider le comportement logiciel. Toute conclusion comparative ou scientifique attendra un protocole contrôlé et des répétitions suffisantes.

## État de départ historique

- Le service `phenotypeVectorService` calcule déjà un vecteur `genos.phenotype.v1` de 23 valeurs; le test contractuel vérifie qu'il varie après un développement environnemental. Le manque à traiter est son alimentation par un état de phénotype réel, sa persistance/version et sa vérification dans le parcours runtime, pas la création initiale d'un vecteur.
- `applyPhenotype` développe un état transmis dans la mission, mais ne charge ni ne persiste lui-même un état durable. Le résultat expose un résumé et le vecteur.
- `applyCulture` sélectionne des traits culturels. `culturalLearningService` présentait des estimations de transfert, sans preuve d'exécution indépendante. Elles sont désormais identifiées comme heuristiques ; la mesure native et la persistance passent par `nceCausalCycleService` (ADR 0323).
- Les tests Play et POET du workflow remplacent runtime et snapshots par des doublures. Ils valident le câblage du contrat, pas l'intégration E2E réelle.
- `nceAblationTests.js` utilise un succès simulé tiré d'un générateur pseudo-aléatoire et un petit nombre de signaux. C'est un prototype de harness, pas une ablation exploitable pour inférer un effet.

Ces observations proviennent du code présent dans `backend/src/services/{nceEngines,nceIntegrationService,phenotypeVectorService,phenotypicDevelopmentService,culturalLearningService}.js` et `backend/tests/{nce_contract_tests,test_nce_workflows_e2e,nceAblationTests}.js`.

## Décisions de méthode

1. Garder séparées les preuves de contrat, d'intégration, de causalité fonctionnelle et de validité scientifique.
2. Toute comparaison causale doit contrôler les tâches, l'état initial, les limites de budget et les graines. Le harness livré partage le split et initialise des sujets indépendants par bras ; il conserve les coûts observés sans les égaliser. Leurs différences doivent rester visibles dans l'analyse.
3. Une preuve positive requiert un résultat de tâche indépendant de l'indicateur du mécanisme. Les logs, métadonnées et vecteurs seuls attestent l'exécution ou l'état, pas l'amélioration.
4. Les interventions et leurs résultats portent des identifiants corrélables, versions de schéma, état avant/après, provenance, graine et paramètres. Les chemins sans preuve restent explicitement `non vérifiés`.
5. Les changements qui modifient les responsabilités ou la persistance entre services nécessitent un ADR avant implémentation, conformément aux règles du dépôt.

## Lots d'implémentation — critères du plan initial

Les critères ci-dessous restent la référence de conception. La réalisation
native de l'ADR 0323 ajoute un service de procédures typées ; elle ne transforme
pas les estimations historiques de `culturalLearningService` en preuves. Le
vecteur structurel courant est `genos.phenotype.v3` ; les mentions de v1 ci-dessous
désignent le format de départ. Les limites de validation du dépôt figurent dans
le [bilan des expériences](../03-reference/experiences-nce.md#état-de-validation-de-la-livraison).

### Lot 0 — Contrats, état et instrumentation

- Définir des schémas versionnés pour l'état phénotypique, le vecteur, l'artefact culturel, la transmission, l'évaluation de tâche et le résultat POET.
- Définir un identifiant de chaîne causale commun et les événements ordonnés : état initial → intervention → état final → benchmark indépendant → reçu de preuve.
- Fixer la politique d'évolution de `genos.phenotype.v1` (compatibilité, invalidation, recalcul) et rendre explicites les valeurs absentes plutôt que de les assimiler à zéro lorsqu'elles ont un sens différent.
- Persister de manière atomique l'état phénotypique mis à jour et son vecteur; exposer provenance et version dans le résultat NCE. Définir reprise/idempotence pour éviter les doubles applications.
- Ajouter des mesures d'observabilité sans les faire compter comme preuves de réussite.

**Sortie / gate** : contrats documentés, tests de validation d'entrée/sortie, migration ou stratégie de compatibilité décidée; aucune promotion fondée sur un simple résultat d'exécution.

### Lot 1 — Vecteur phénotypique du runtime

- Relier `applyPhenotype` au véritable état de l'agent (chargement, développement depuis environnement et historique, persistance), au lieu de laisser l'état éphémère de la mission être la source implicite.
- Définir les dimensions comme des caractéristiques observables et stables du phénotype. Ajouter tests de bornes, valeurs manquantes, ordre déterministe, incompatibilité de schéma, changements pertinents et invariance quand aucun changement n'a lieu.
- Vérifier que croissance, renforcement, atrophie et réactivation produisent les changements attendus dans le vecteur; vérifier aussi que deux états distincts pertinents ne collisionnent pas silencieusement à cause du hash des catégories.
- Publier le vecteur avant/après dans le reçu de la mission avec l'identifiant d'état et la version; séparer « état modifié » de « performance améliorée ».

**Sortie / gate** : test du service, test de persistance/reprise, test d'intégration via l'orchestrateur; la fiche ne qualifie le vecteur d'implémenté qu'après preuve du chemin persistant.

### Lot 2 — Culture → apprentissage → phénotype

- Faire passer une transmission réelle par `culturalTransmissionService` et `culturalLearningService`, plutôt que d'utiliser uniquement la sélection de traits dans `applyCulture`.
- Définir une interface d'intégration qui transforme l'artefact appris en mise à jour phénotypique explicite (capacité, outil, stratégie ou branche), avec provenance vers l'artefact et la transmission. N'autoriser que les contenus validés par le contrat culturel.
- Capturer le même benchmark déterministe avant et après transmission et développement. Mesurer séparément : fidélité de transmission, gain de compétence sur la tâche, différence de vecteur phénotypique et résultat de tâche.
- Ajouter les contrôles négatifs : artefact non pertinent, transmission désactivée, intégration refusée, tâche maîtrisée, artefact de contrôle. Ils doivent empêcher le gain et/ou le changement de phénotype attendu, selon l'intervention.
- Ajouter un replay qui reconstruit la chaîne et permet d'attribuer le changement observé à l'artefact reçu; un delta de score synthétique ne suffit pas.

**Sortie / gate** : preuve logicielle que l'intervention culturelle précède et entraîne un changement d'état mesurable sur le chemin réel; pas encore une généralisation scientifique.

### Lot 3 — E2E Play, phénotype et culture

- Garder les tests unitaires rapides avec doublures, mais ajouter un parcours d'intégration avec backend, base temporaire isolée, snapshot réel et exécution confinée dans le workspace de test.
- Le scénario Play doit prouver sandbox, budget, capture avant/après, rollback/nettoyage et enregistrement d'une découverte uniquement après vérification du résultat.
- Le scénario phénotype doit lire l'état initial persistant, appliquer un besoin d'environnement, mesurer le vecteur final, redémarrer/recharger, puis vérifier l'identité et la reproductibilité du résultat.
- Le scénario culturel doit exécuter benchmark → transmission → développement phénotypique → même benchmark, produire le reçu de causalité et montrer qu'un contrôle sans transmission ne produit pas le même delta.
- Toute dépendance externe doit être remplacée par un adaptateur local explicite, mais les composants GenOS ciblés (orchestrateur, services, stockage, snapshot/exécution) ne doivent pas être simulés dans le test d'intégration.
- Séparer les tests E2E stables (petits, déterministes) des expériences longues/statistiques; publier les commandes dédiées sous `backend/package.json`.

**Sortie / gate** : les quatre flux requis — Play, phénotype, culture, POET — passent chacun par un test d'intégration runtime; les résultats de test identifient clairement les adaptateurs simulés restants.

### Lot 4 — POET, preuve de terminaison et évaluation

- Exécuter agent et environnement dans les conditions runtime de test. Attendre un événement terminal corrélé à l'identifiant d'exécution; distinguer timeout, échec, annulation et succès.
- Capturer le snapshot après terminaison réelle et vérifier l'artefact avec une commande de test indépendante dans ce snapshot.
- Vérifier qu'un signal terminal d'un autre agent/exécution ne débloque pas l'attente, qu'un timeout ne produit pas une réussite, et qu'un snapshot/artefact manquant bloque l'évaluation.
- Enregistrer pour chaque paire agent-environnement le résultat brut, la preuve, la graine, le coût, les contraintes et les mutations d'environnement; ne déclarer un environnement « résolu » qu'après vérification.
- Tester le pont de bout en bout avec runtime et snapshots GenOS réels dans l'environnement CI compatible. Garder le test simulé en complément pour les cas rares et déterministes.

**Sortie / gate** : reçu POET rejouable, lié à l'exécution terminée et à une vérification indépendante; aucun succès déduit du seul événement de télémétrie.

**Historique au 2026-09-30** : le premier test utilisait les vrais snapshots et une vérification isolée, mais substituait le démarrage de l'agent.

**État courant** : `test_nce_native_cycle.js` ajoute un processus Node réel pour les procédures numériques, une sélection figée avant held-out et une reprise SQLite. Le test historique avec doublure reste utile pour ses cas ciblés. Cette livraison ferme le parcours natif borné ; elle ne valide pas tous les exécuteurs externes ni la suite Rust complète.

### Lot 5 — Ablations et protocole expérimental

- Conserver `nceAblationTests.js` étiqueté prototype; interdire qu'il alimente des affirmations de performance, maturité ou supériorité.
- Construire un harness expérimental séparé qui exécute des tâches réelles, collecte preuves et coûts, fixe l'environnement et les graines, randomise l'ordre des bras et conserve les échecs.
- Comparer une baseline à mécanismes désactivés, ablations une-par-une, et configurations préenregistrées. N'activer le factoriel complet des six couches (64 cellules) qu'après validation du coût, de la puissance statistique et de la faisabilité; les interactions seules ne justifient pas de parcourir le factoriel d'emblée.
- Définir avant exécution métrique primaire, métriques secondaires, taille d'échantillon, répétitions, exclusions, analyse, seuil d'effet, intervalles d'incertitude et arrêt. Rapporter coûts et résultats négatifs.
- Répéter sur plusieurs tâches/environnements et vérifier que les tâches d'évaluation ne sont pas celles ayant servi à régler les mécanismes.

**Sortie / gate scientifique** : résultats reproductibles avec données/protocole versionnés et revue indépendante. Avant cette gate, qualifier séparément la simulation historique de « prototype » et le nouveau harness de « benchmark exécuté borné » ; aucun des deux ne justifie une supériorité générale.

**Historique au 2026-09-30** : seul le harness `simulation-prototype` était disponible.

**État courant** : `nceAblationService` exécute six bras, appariés par graine, sur des tâches numériques avec vérificateurs protégés. Les sorties brutes, erreurs, coûts et paires non mesurées sont conservés. La régression couvre deux graines ; calcul de puissance, factoriel à 64 configurations, revue indépendante et généralisation scientifique restent ouverts.

## Ordre de livraison et dépendances

```text
Lot 0 contrats et reçus
   ├── Lot 1 état/vecteur phénotypique
   ├── Lot 4 terminaison/snapshot POET
   └── Lot 2 transmission culturelle → phénotype
            └── Lot 3 parcours E2E combinés Play / phénotype / culture / POET
                       └── Lot 5 ablations expérimentales
```

Le lot 4 peut avancer en parallèle du lot 1. Le lot 2 dépend des contrats du lot 0 et du vecteur/runtime du lot 1. Les expériences du lot 5 dépendent des reçus fiables des lots 2 à 4.

## Critères de clôture

- Chaque flux dispose d'un test d'intégration qui n'imite pas les composants GenOS sous évaluation.
- Les tests vérifient les chemins de succès et de refus/échec; aucun résultat manquant n'est converti en succès.
- Un replay fournit les mêmes états, interventions et vérifications avec les mêmes entrées et graines.
- La chaîne culture → artefact reçu → mise à jour phénotypique → effet sur une tâche est observable, attribuable et falsifiable.
- Les ablations exécutées peuvent attester le câblage causal sur les tâches contrôlées ; les revendications comparatives générales attendent la validation du protocole scientifique.
- La fiche [Natural Creative Ecology](natural-creative-ecology.md) reflète l'état livré, mentionne explicitement les simulations résiduelles et distingue maturité logicielle et validité scientifique.

## Vérification et clôture restante

Les commandes dédiées sont `npm --prefix backend run test:nce` et
`npm --prefix backend run test:nce:cli`. Les résultats déjà obtenus, leur ordre
d'exécution et les limites sont consignés dans le
[bilan de validation](../03-reference/experiences-nce.md#état-de-validation-de-la-livraison).

La clôture globale exige encore un contrôle qualité du dépôt accepté et une
exécution complète de `cargo test --workspace` après résolution du manque
d'espace disque. La validation scientifique exige un protocole préenregistré,
davantage de tâches et répétitions, des observations dédiées pour O/H et une
revue indépendante. La livraison logicielle bornée ne vaut pas certification
« 100 % » de ces objectifs.
