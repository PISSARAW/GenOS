# Plan d'implémentation — fermeture causale de la Natural Creative Ecology

- **Statut** : Plan proposé — aucun résultat scientifique revendiqué
- **Portée** : parcours Play, développement et mesure du phénotype, transfert culturel, POET, puis protocole d'ablation
- **Fiche de référence** : [Natural Creative Ecology](natural-creative-ecology.md)
- **Dernière revue** : 2026-09-30

## Objectif

Établir une chaîne vérifiable entre les mécanismes NCE et leurs effets observés sur une tâche, sans confondre transport, exécution réussie, changement d'état et preuve causale. Les tests d'intégration doivent d'abord valider le comportement logiciel. Toute conclusion comparative ou scientifique attendra un protocole contrôlé et des répétitions suffisantes.

## État de départ observé

- Le service `phenotypeVectorService` calcule déjà un vecteur `genos.phenotype.v1` de 23 valeurs; le test contractuel vérifie qu'il varie après un développement environnemental. Le manque à traiter est son alimentation par un état de phénotype réel, sa persistance/version et sa vérification dans le parcours runtime, pas la création initiale d'un vecteur.
- `applyPhenotype` développe un état transmis dans la mission, mais ne charge ni ne persiste lui-même un état durable. Le résultat expose un résumé et le vecteur.
- `applyCulture` sélectionne des traits culturels. `culturalLearningService` mesure un transfert avant/après sur un benchmark, mais cette mesure n'est pas reliée au développement du phénotype dans le flux NCE.
- Les tests Play et POET du workflow remplacent runtime et snapshots par des doublures. Ils valident le câblage du contrat, pas l'intégration E2E réelle.
- `nceAblationTests.js` utilise un succès simulé tiré d'un générateur pseudo-aléatoire et un petit nombre de signaux. C'est un prototype de harness, pas une ablation exploitable pour inférer un effet.

Ces observations proviennent du code présent dans `backend/src/services/{nceEngines,nceIntegrationService,phenotypeVectorService,phenotypicDevelopmentService,culturalLearningService}.js` et `backend/tests/{nce_contract_tests,test_nce_workflows_e2e,nceAblationTests}.js`.

## Décisions de méthode

1. Garder séparées les preuves de contrat, d'intégration, de causalité fonctionnelle et de validité scientifique.
2. Toute comparaison causale réutilise une tâche, un environnement, un agent de départ, un budget et une graine identiques; seul le mécanisme ciblé varie.
3. Une preuve positive requiert un résultat de tâche indépendant de l'indicateur du mécanisme. Les logs, métadonnées et vecteurs seuls attestent l'exécution ou l'état, pas l'amélioration.
4. Les interventions et leurs résultats portent des identifiants corrélables, versions de schéma, état avant/après, provenance, graine et paramètres. Les chemins sans preuve restent explicitement `non vérifiés`.
5. Les changements qui modifient les responsabilités ou la persistance entre services nécessitent un ADR avant implémentation, conformément aux règles du dépôt.

## Lots d'implémentation

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

**État après exécution du plan (2026-09-30)** : la vérification POET utilise maintenant le vrai stockage de snapshots et l'exécution isolée; la lecture du journal DB ignore les événements terminaux antérieurs au début de la mission. L'adaptateur qui démarre l'agent reste simulé dans ce test E2E. Le critère runtime réel ci-dessus reste donc ouvert avant de déclarer le flux POET entièrement validé.

### Lot 5 — Ablations et protocole expérimental

- Conserver `nceAblationTests.js` étiqueté prototype; interdire qu'il alimente des affirmations de performance, maturité ou supériorité.
- Construire un harness expérimental séparé qui exécute des tâches réelles, collecte preuves et coûts, fixe l'environnement et les graines, randomise l'ordre des bras et conserve les échecs.
- Comparer une baseline à mécanismes désactivés, ablations une-par-une, et configurations préenregistrées. N'activer le factoriel complet des six couches (64 cellules) qu'après validation du coût, de la puissance statistique et de la faisabilité; les interactions seules ne justifient pas de parcourir le factoriel d'emblée.
- Définir avant exécution métrique primaire, métriques secondaires, taille d'échantillon, répétitions, exclusions, analyse, seuil d'effet, intervalles d'incertitude et arrêt. Rapporter coûts et résultats négatifs.
- Répéter sur plusieurs tâches/environnements et vérifier que les tâches d'évaluation ne sont pas celles ayant servi à régler les mécanismes.

**Sortie / gate** : résultats reproductibles avec données/protocole versionnés et revue indépendante. Avant cette gate, parler de « prototype d'ablation » uniquement.

**État après exécution du plan (2026-09-30)** : le harness marque ses sorties `simulation-prototype`, expose l'absence de validité scientifique et ses limites; un test vérifie la répétabilité de la simulation pour débogage. Aucun benchmark réel, calcul de puissance ou campagne factorielle n'est livré. Cette partie demeure un prototype tant qu'un jeu de tâches et un protocole expérimental ne sont pas enregistrés.

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
- Les ablations restent hors des revendications de preuve jusqu'à validation du protocole expérimental.
- La fiche [Natural Creative Ecology](natural-creative-ecology.md) reflète l'état livré, mentionne explicitement les simulations résiduelles et distingue maturité logicielle et validité scientifique.

## Vérification prévue au moment de l'implémentation

Après implémentation, exécuter d'abord `npm --prefix backend run test:nce`, puis les nouveaux tests d'intégration ciblés. Avant livraison complète, appliquer la définition de done du dépôt : `python scripts/ci/check_code_quality.py`, `npm test` et `cargo test --workspace`. Ces commandes ne sont pas exécutées pour la rédaction du présent plan.
