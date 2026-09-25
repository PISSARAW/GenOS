# Plan d’implémentation — preuve causale des topologies

- **Statut** : proposé
- **Portée** : protocole comparatif, instrumentation et sélection Morphogenèse
- **Référence** : campagne de qualification `benchmarks/topology-morphogenesis/README.md`
- **Dernière revue** : 2026-09-25

## Objectif

Établir, sur des tâches contrôlées et reproductibles, si les mécanismes d’une topologie contribuent causalement à la qualité du résultat, et si Morphogenèse choisit une organisation adaptée à partir d’expériences antérieures sans utiliser les résultats du jeu d’évaluation.

Le protocole doit distinguer trois niveaux :

1. **Exécution** : le mécanisme topologique demandé a été réellement exercé et ses effets sont observables.
2. **Qualité** : un oracle indépendant évalue le livrable et ses invariants.
3. **Effet causal** : une comparaison contrôlée montre l’écart par rapport aux conditions de référence et aux ablations.

Un succès de dispatch, un consensus d’agents ou une provenance complète ne vaut pas vérité ni effet causal.

## Portée et ordre

Procéder par incréments. La première qualification porte sur un petit portefeuille de tâches déterministes et sur les topologies disposant d’un mécanisme et d’un oracle adaptés. Étendre ensuite la matrice aux huit topologies. Ne pas promouvoir une topologie dont aucun scénario ne peut observer et vérifier le mécanisme revendiqué.

La campagne actuelle reste la base des probes d’exécution. Ce plan lui ajoute les bras comparatifs, la randomisation, les contrôles d’équité, les oracles et l’analyse. Ses résultats historiques ne doivent pas être mélangés aux répétitions d’un même commit.

## Phase 0 — Geler le protocole et les critères

### Travaux

- Définir une fiche de tâche versionnée : entrée, capacités nécessaires, mécanisme attendu, livrable, oracle, budget, seed et critères d’exclusion.
- Construire un portefeuille de tâches où une vérité indépendante est disponible : tests logiciels, propriétés/invariants, calcul vérifiable, schémas ou contraintes formelles.
- Classer séparément les tâches de jugement ouvert. Les conserver pour l’étude exploratoire, sans les utiliser comme preuve de vérité via un jugement LLM seul.
- Préenregistrer les métriques primaires : taux de réussite oracle, qualité par critère, violations d’invariants, coût total, durée et taux d’abstention/escalade.
- Fixer les unités de comparaison, les règles d’arrêt, la politique de répétition et le calcul d’incertitude avant d’examiner les résultats.

### Critère de sortie

Chaque tâche possède un oracle exécutable ou une source externe documentée, une définition du succès et des limites. Une seconde personne peut appliquer le protocole sans interpréter les réponses des agents.

## Phase 1 — Stabiliser l’exécution et la preuve de mécanisme

### Travaux

- Figer un commit, les versions/configurations du runtime, le modèle réellement servi, les prompts système, la température, les outils et les budgets.
- Compléter le harnais existant pour archiver une ligne de preuve par tentative : identifiants, seed, affectation expérimentale, événements, workers terminaux, reçus, livrable, verdict oracle, coûts, erreurs et motif d’abstention.
- Vérifier que les appels de session modifient l’état attendu, que les lectures suivantes observent ces modifications, et que les reçus permettent de relier action et effet.
- Faire échouer la tentative si le mécanisme annoncé n’a pas été observé, si le worker requis n’a pas atteint un état terminal, ou si l’oracle ne peut pas statuer. Enregistrer ces cas comme échecs ou inconclusifs, jamais comme succès.
- Ajouter des contrôles négatifs : preuve manquante, worker indisponible, état divergent et livrable volontairement invalide.

### Critère de sortie

Le chemin simple et chaque scénario retenu terminent de manière observable; les contrôles négatifs ferment correctement; chaque verdict est reconstructible à partir des artefacts archivés.

## Phase 2 — Construire la comparaison causale

Pour chaque tâche compatible, exécuter les conditions suivantes avec les mêmes entrées, modèle, outils, budget total, limite de durée et oracle :

| Condition | Rôle dans la comparaison |
| --- | --- |
| Modèle seul | référence de base |
| Multi-agent simple | effet de la décomposition et de la coordination génériques |
| Topologie adaptée, figée | effet de ses mécanismes sans sélection adaptative |
| Topologie inadéquate assignée | contrôle de spécificité de la topologie |
| Topologie adaptée avec mécanisme désactivé | ablation du mécanisme causal ciblé |
| Morphogenèse | qualité de la sélection à partir du profil et de l’historique admissible |
| Oracle de sélection | borne de comparaison, sélection faite à partir des résultats d’entraînement seulement |

### Travaux

- Définir avant chaque tâche quelle topologie est adaptée et laquelle est inadéquate, avec une justification falsifiable fondée sur le mécanisme observé.
- Comparer les conditions par blocs appariés : même tâche, seed et configuration autant que possible; randomiser l’ordre d’exécution pour réduire les effets de charge et de dérive.
- Comptabiliser le coût total de toutes les tentatives et les échecs. Si un plafond de budget empêche une condition de terminer, rapporter l’échec et le coût, sans augmenter son budget après observation.
- Utiliser plusieurs seeds et répéter les blocs; dimensionner les répétitions à partir de la variance observée au pilote, avant la campagne confirmatoire.
- Séparer pilote et confirmation. Ne modifier ni les seuils, ni les tâches, ni les métriques primaires au milieu de la campagne confirmatoire.

### Critère de sortie

Le harnais produit une table comparable et complète pour toutes les conditions; l’ordre est randomisé; coûts, échecs et tentatives sont tous comptés; l’analyse peut estimer les écarts appariés avec incertitude.

## Phase 3 — Instrumenter la boucle causale par topologie

Pour chacune des huit topologies, compléter une fiche de mécanisme avant d’étendre les scénarios :

| Topologie | Action/effet à rendre observable | Ablation minimale à comparer |
| --- | --- | --- |
| Trinity | mondes isolés, stratégies distinctes, comparaison après clôture, décision ou abstention justifiée | fusionner les mondes ou retirer la comparaison |
| A-Team | graphe de travail, dépendances consommées, artefacts produits puis intégrés | équipe générique ou DAG sans dépendances |
| Biome | allocation, foraging, changement d’état de niche et réallocation après observation | allocation figée ou boucle de réallocation désactivée |
| Biocénose | contributions indépendantes, désaccord, règle de quorum et calibration contre oracle | supprimer le quorum ou corréler les contributions |
| Holobionte | contribution symbiotique persistée, contrôle immunitaire borné, veto lié à une violation vérifiable | désactiver le symbiote ou le contrôle ciblé |
| Syncytium | opérations concurrentes, lectures depuis l’état partagé, convergence et invariants | état local isolé ou synchronisation désactivée |
| Rhizome | gap détecté, capacité réellement exécutée sur le nouveau chemin, résultat consommé | route sans croissance ou nœud sans exécuteur |
| Métapopulation | perte effective d’une capacité, migration/recolonisation, capacité restaurée et vérifiée | supprimer migration/recolonisation ou garder population figée |

Une ablation ne doit retirer qu’un mécanisme principal à la fois. Les autres paramètres restent identiques. Documenter les mécanismes impossibles à isoler avant de lancer les mesures.

### Critère de sortie

Chaque topologie possède au moins un scénario où son mécanisme transforme un état observable et où l’effet de ce changement peut être relié au résultat oracle. Sinon, sa maturité reste « mécanisme non démontré ».

## Phase 4 — Auditer la composition et les signaux de sélection

### A-Team

- Évaluer la composition sur des missions paraphrasées et des tâches dont les dépendances attendues sont établies indépendamment.
- Mesurer la couverture des capacités, les dépendances omises, les membres non pertinents et la sensibilité de l’équipe à la formulation lexicale.
- Exiger que les exigences non couvertes soient explicites; ne pas compter une équipe bornée comme adéquate si une capacité requise a été tronquée.

### Signaux de confiance

- Distinguer les valeurs mesurées, les priors de politique, les estimations de modèle et les vérités d’oracle dans les schémas et rapports.
- Ne jamais traiter confiance déclarée par le worker, provenance, consensus ou validité de transport comme vérité sémantique.
- Vérifier toute calibration de confiance contre des résultats oracle hors échantillon; inclure score de Brier ou calibration adaptée, couverture et taux d’abstention.

### Morphogenèse

- Enregistrer pour chaque décision le profil d’entrée, les candidats, facteurs, poids/version de politique, contraintes, historique consulté et choix final.
- Remplacer l’affirmation de succès historique par une estimation avec taille d’échantillon, incertitude et garde-fous contre les données absentes.
- Entraîner/ajuster uniquement sur les blocs d’entraînement. Garder des tâches et seeds de confirmation hors de l’historique disponible au sélecteur.
- Comparer Morphogenèse à la sélection figée, à la sélection aléatoire admissible et à l’oracle entraîné; vérifier la stabilité par sous-domaine et coût.
- Versionner la politique apprise et permettre le retour à la politique précédente. Aucun apprentissage ne contourne les contraintes de capacité, sécurité, budget ou preuve.

### Critère de sortie

Les entrées incertaines ou manquantes sont tracées et déclenchent l’abstention prévue; aucune donnée de test ne fuit dans l’historique de sélection; toute évolution de poids est évaluée sur des cas de confirmation inchangés.

## Phase 5 — Campagne confirmatoire et qualification

### Analyse

- Publier résultats par tâche, par topologie et globalement, avec nombre d’essais, taux d’échec, intervalle d’incertitude, coût et durée.
- Estimer les écarts appariés pour le modèle seul, le multi-agent simple, la bonne topologie, la mauvaise topologie, les ablations et Morphogenèse.
- Rapporter les tâches non concluantes et résultats négatifs. Une moyenne agrégée ne doit pas masquer une régression importante ou une catégorie sans oracle.
- Distinguer succès d’exécution, réussite oracle, avantage causal et généralisation hors tâches d’entraînement.

### Porte de qualification

Ne déclarer un avantage causal que si la bonne topologie dépasse ses références selon la métrique primaire préenregistrée, avec incertitude rapportée, sans dépassement de budget ni dégradation des garde-fous. Montrer que retirer son mécanisme ciblé réduit cet avantage. Si bonne et mauvaise topologies sont indiscernables, la spécificité n’est pas démontrée.

Ne qualifier Morphogenèse d’apprentissage efficace que si elle se rapproche de la sélection oracle sur des tâches de confirmation non vues, dépasse les baselines fixées à coût comparable, et conserve ses garde-fous. Sinon, la décrire comme heuristique versionnée ou expérimentale.

Une qualification vaut seulement pour le périmètre, les modèles, les tâches et la configuration évalués. Elle ne prouve pas un avantage général ni une autonomie générale.

## Livrables à produire

1. Schéma versionné des tâches, tentatives, événements de mécanisme et verdicts oracle.
2. Portefeuille de missions contrôlées, oracles indépendants et contrôles négatifs.
3. Harnais de comparaison appariée, randomisée et à budget fixé, intégré à la campagne existante.
4. Fiches d’ablation et de mécanisme pour les huit topologies.
5. Rapport machine-lisible et rapport de résultats reproductible, incluant échecs, incertitude, coût et provenance.
6. Historique d’entraînement séparé des résultats de confirmation pour Morphogenèse.

## Ordre de livraison proposé

| Incrément | Contenu | Dépend de |
| --- | --- | --- |
| I1 | Contrat de mesure, tâches déterministes, oracles et contrôle négatif | — |
| I2 | Artefacts unifiés et verdict d’exécution/mécanisme/oracle | I1 |
| I3 | Références modèle seul et multi-agent simple, budget fixé | I2 |
| I4 | Premier bloc topologie adaptée/inadéquate + ablation sur deux scénarios qualifiables | I3 |
| I5 | Scénarios spécifiques pour les six autres topologies | I4, fiches de mécanisme |
| I6 | Évaluation de composition A-Team et confiance/calibration | I2, oracles |
| I7 | Sélection Morphogenèse entraînement/confirmation sans fuite | I3–I6 |
| I8 | Répétitions confirmatoires, analyse et décision de maturité | I1–I7 |

## Décisions d’architecture

Ce document définit le protocole et ses portes de preuve; il ne modifie pas les contrats runtime. Avant d’introduire un format persistant commun, un nouveau mécanisme d’apprentissage, ou une transition automatique de topologie, rédiger l’ADR correspondant conformément aux conventions du dépôt. Toute transition Morphogenèse reste hors de portée de la campagne shadow actuelle jusqu’à la disponibilité des adaptateurs d’adjudication et de gouvernance.

## Risques et réponses

| Risque | Réponse dans le protocole |
| --- | --- |
| Oracle faible ou circulaire | exclure la tâche de la preuve confirmatoire, garder ses résultats exploratoires |
| Fuite entre entraînement et test | partitions par tâche/seed, historiques isolés et audit des entrées du sélecteur |
| Budget inégal | plafond total identique et comptage de toutes les tentatives |
| Biais d’ordre ou charge locale | affectation randomisée, blocs appariés et configuration figée |
| Corrélation des agents | traiter les variantes d’un même modèle comme corrélées; mesurer leur indépendance sur erreurs oracle |
| Mécanisme seulement simulé | exiger mutation persistée, lecture consécutive et lien vers un effet vérifié |
| Résultat positif isolé | répétitions confirmatoires et rapports par tâche, sans généralisation hors périmètre |
