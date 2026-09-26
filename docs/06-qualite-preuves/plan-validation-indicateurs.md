# Plan de couverture et de validation des indicateurs fonctionnels

- **Statut** : proposition d'exécution ; aucun résultat expérimental nouveau.
- **Dernière revue** : 2026-09-26.
- **Base inspectée** : `7c66e873859ae21dc85ec2815b6e4cc8b984f65c`.
- **Portée** : audit statique ciblé du runtime Node et de ses tests ; pas d'audit exhaustif des crates, des modèles sous-jacents ou d'une installation en production.
- **Objectif** : couvrir et valider chaque exigence fonctionnelle ci-dessous, en conservant explicitement les résultats négatifs et inconnus.

## 1. Verdict sur la demande initiale

Le programme fourni (phases 0 à 30, soit 31 phases) constitue une bonne base pour fermer quatre circuits : morphogenèse, modèle du monde, rapport vérifiable et interventions causales. Il ne suffit pas à couvrir tous les indicateurs. La morphogenèse améliore l'adaptation ; elle ne remplace pas une architecture perceptive, un espace de travail global ou un modèle de l'attention.

L'ancienne évaluation annonce « 9 familles sur 12 » mais contient 15 lignes. Le document actuel `indicateurs-fonctionnels.md` contient lui-même des totaux et limites contradictoires. Ni l'un ni l'autre ne fournit un dénominateur suffisamment stable pour annoncer un pourcentage.

Le référentiel doit comporter deux registres distincts : les 14 propriétés de Butlin et les 15 familles opérationnelles GenOS. Leur recouvrement interdit de les additionner comme 29 preuves indépendantes. IIT, consolidation et discipline de rapport sont des extensions GenOS ; les rapprocher de la littérature ne les transforme pas en indicateurs Butlin.

**Cible proposée : 14/14 propriétés opérationnalisées et validées dans un périmètre explicite, et 15/15 familles GenOS validées selon leurs propres contrats.** Cela ne signifie ni 100 % de réussite sur toute tâche, ni une probabilité de conscience de 100 %. La faisabilité complète reste une hypothèse à éprouver ; une propriété inaccessible doit rester inconnue ou non satisfaite.

## 2. Références et choix de méthode

- [Butlin et al., rapport 2023, tableau 1 et sections 2–3](https://arxiv.org/html/2308.08708v3) : référentiel des propriétés. Sa satisfaction ne constitue pas une preuve de conscience ; IIT est exclue de ce cadre fonctionnaliste.
- [Butlin et al., publication en ligne 2025, volume 2026](https://pubmed.ncbi.nlm.nih.gov/41219038/) : méthode d'évaluation sous incertitude scientifique, sans décision binaire universelle.
- [Wiring matrix GenOS](wiring-matrix.md) : chaîne de consommation des mécanismes.
- [Indicateurs existants](../01-concepts/indicateurs-fonctionnels.md) : historique à réconcilier avec les reçus.

Les protocoles, seuils et architectures proposés dans la suite sont des **choix d'ingénierie GenOS**, pas des prescriptions ni des tests validés par ces publications. Une ignition biophysique, JEPA, un corps physique et des phases REM ne sont pas imposés comme prérequis universels. Un environnement simulé peut fournir des contingences action-perception mesurables. Un timer d'entretien ne démontre pas à lui seul une récurrence perceptive.

## 3. Ce que la lecture du code établit

Chemins relatifs à `backend/`, fonctions vérifiées au HEAD indiqué. « Non établi » signifie que cette revue n'a pas établi la propriété, pas qu'aucun composant ne peut exister ailleurs.

| Ancrage | Observation | Conséquence pour le plan |
|---|---|---|
| `src/services/worldModelService.js:recordSample/predictState/rolloutFree` | Échantillons action/delta ; lookup par action ; descendants sans état transformé ; `1-pmax` peut donner zéro avec un seul exemple | Conditionner sur état/contexte, propager l'état, distinguer ignorance et variabilité |
| `src/services/morphogenesis/dynamicReevaluationExecutorService.js:buildPlannerCtx` | Transporte seulement état courant, topologie proposée et budget | Relier les signaux au planner et prouver leur consommation |
| Même fichier, `buildTransitionPlan` | Convertit spawn/retire/rebind et organisation ; préservation de toute la sémantique du plan non établie | Auditer le contrat jusqu'à l'action exécutée, pas seulement l'objet plan |
| `src/services/workerEvidenceBarrier.js` et `workerEvidenceBarrierHelpers.js:applySynthesisPlan` | Rapport sémantique construit ; prompt de synthèse alimenté par `factualReports` | Unifier l'autorité des faits et contrôler toutes les sorties |
| `src/services/semanticReportService.js:buildSemanticReport` | IDs `prop_*` ; mention d'un outil transformée en relation `causedByTool` | Ne jamais inférer une causalité d'une mention ; rattacher aux claims et reçus d'action |
| `bin/agent-runtime-close.cjs` ; `src/services/workerEvidenceBarrierLocal.js` | Plusieurs chemins émettent `AGENT_COMPLETED` | Gate commun à tous les chemins, y compris sortie locale et flux utilisateur |
| `src/services/causalIntegrationService.js:analyzeCircuit` | Ablations de matrices enregistrées, PID heuristique | Générateur d'hypothèses ; pas un moteur d'interventions exécutées |
| `src/services/controlledCausalExperimentService.js` | Clones indépendants d'état et contraste de trajectoires ; contrôles seed/environnement non vérifiés, pas de réplication | Étendre cet acquis avant d'introduire une arena concurrente |
| `src/services/attentionSchemaBenchService.js:runAttentionAudit` | Audit de leases et de mentions d'outils | Ne démontre pas un modèle prédictif contrôlant l'attention |
| `src/services/predictiveHierarchyService.js:routeEvent` | Compteurs d'erreurs et demandes de révision ; commentaires explicitement consultatifs | Ne démontre pas le codage prédictif perceptif descendant |
| `src/services/idleTickService.js:startScheduler` ; `server.js` | Scheduler existant, démarrage appelé par le serveur | Vérifier activation, préemption et effets ; ne pas recréer le scheduler |
| `src/services/ignitionService.js:competeWinners` ; `counterfactualRolloutService.js:competeBranches` | Compétition existante dans le classement de branches consultatif | Tester capacité limitée, diffusion et effet réel du workspace |
| `src/services/valenceService.js:applyValencePosture` ; `agentRuntimeAdapter/missionPlanning.js` | Posture peut interdire les éditions et limiter le fanout | Déjà décisionnel sur ce chemin ; manque la planification allostatique prédictive validée |
| `tests/test_organ_ablation_bench.js` | Stubs, dégradation gracieuse, circuits synthétiques, cas unitaires | Preuve logicielle utile ; ni essai de production ni validation indépendante complète |

Les ✅ historiques doivent être traduits en statuts justifiés. Cette revue ne permet pas de recalculer honnêtement un nombre de familles validées expérimentalement.

Contrôles tentés pendant la préparation documentaire : liens locaux et `git diff --check` sans erreur ; `npm test` arrêté sur le module `express` absent ; `cargo test --workspace` arrêté à la compilation sur un délimiteur non fermé dans `crates/genos-orchestrator/src/director.rs:291`. Aucun code source n'a été modifié pendant cette revue. Le lot 01 doit d'abord rétablir les dépendances et une baseline compilable, avec correction séparée et tracée avant les mesures comparatives.

Le gate global de qualité a également échoué : 3 753 fichiers source examinés, 373 violations dont 152 hors baseline du gate. Ce total inclut des fichiers locaux non suivis ; il ne mesure pas des régressions introduites par ce changement documentaire. Le lot 01 doit distinguer état versionné et fichiers locaux avant de corriger et de figer la baseline.

## 4. Définition vérifiable du « 100 % »

Pour chaque exigence, stocker séparément :

1. **Spécifiée** : objet testé, frontière du système et protocole falsifiable.
2. **Implémentée** : chemin et appel de production identifiés.
3. **Causale** : intervention réelle, témoin pertinent, reçu d'exécution ; effet prévu sur le mécanisme et/ou le comportement.
4. **Généralisée** : résultat sur scénarios réservés, réplications, budget contrôlé, intervalle d'incertitude.
5. **Opérationnelle** : réutilisation après redémarrage, surveillance de dérive, repli et rollback éprouvés lorsque pertinents.

Statuts possibles par étage : `passed`, `failed`, `inconclusive`, `not_run`, `unavailable`. Un étage inconnu ne vaut jamais zéro mesuré ou succès. Le statut final est plafonné par le premier étage non établi. Aucune moyenne ne compense une propriété manquante. Publier le numérateur, le dénominateur, la version des critères et le domaine ; jamais un « score de conscience ».

Pour une propriété structurelle, une amélioration de reward n'est pas à elle seule la preuve pertinente : vérifier aussi le mécanisme interne exigé. Pour une optimisation, un changement de choix ne suffit pas : vérifier l'utilité et les coûts. Un module redondant peut résister à une ablation simple ; les interventions combinées et tests mécanistes permettent de l'expliquer.

### Frontière du système évalué

Déclarer séparément `runtime Node`, `substrat Rust`, `modèle perceptif/LLM` et `système composé`. Une propriété du modèle ne se transfère pas automatiquement à l'orchestrateur, et un bus entre agents ne prouve rien sur les représentations internes d'un LLM opaque. Les propriétés internes exigent un substrat inspectable ou restent `unavailable`. Le premier profil complet utilisera un environnement simulé et un modèle perceptif instrumentable ; un profil API opaque aura son propre périmètre.

## 5. Registre Butlin : quatorze obligations distinctes

Les intitulés ci-dessous résument le référentiel ; la colonne de droite définit notre protocole proposé.

| ID | Propriété cible | Épreuve GenOS proposée |
|---|---|---|
| RPT-1 | Récurrence des entrées | Couper le feedback perceptif, préserver le budget, mesurer résolution d'ambiguïtés temporelles |
| RPT-2 | Perception organisée et intégrée | Objets/relations persistants sous occlusion ; permutation des liaisons détruit le binding prévu |
| GWT-1 | Spécialistes parallèles | Traces d'exécution concurrente et compétences distinctes ; contrôle sériel à ressources comparables |
| GWT-2 | Workspace limité et sélectif | Capacité explicite, compétition de contenus, surcharge et distracteurs ; mesurer admissions/évictions |
| GWT-3 | Diffusion globale disponible | Contenu sélectionné accessible aux modules cognitifs autorisés ; couper une livraison modifie son usage |
| GWT-4 | Attention dépendante de l'état | Un objectif et l'état du workspace gouvernent des requêtes successives aux spécialistes |
| HOT-1 | Perception générative/descendante/bruitée | Manipuler un prior perceptif et le bruit, mesurer leurs effets distincts sur la représentation |
| HOT-2 | Fiabilité perceptive monitorée | Bruit caché et distracteurs ; distinguer correct/incorrect à difficulté contrôlée |
| HOT-3 | Croyances/actions corrigées par monitoring | Retour métacognitif crédible modifie une croyance puis une action, avec calibration préservée |
| HOT-4 | Codage parcimonieux et lisse | Inspecter activations, voisinages et interpolations perceptives ; mesurer sparsité, continuité et discrimination |
| AST-1 | Modèle prédictif contrôlant l'attention | Prédire allocation/erreurs attentionnelles puis réallouer ; ablater le modèle en gardant les leases |
| PP-1 | Codage prédictif des entrées | Prédictions descendantes, erreurs ascendantes et précision influencent réellement l'estimation perceptive |
| AE-1 | Apprentissage et objectifs concurrents | Inversion de récompense, objectifs en tension et transfert ; politique figée comme contrôle |
| AE-2 | Contingences action-perception modélisées | Perturber un effecteur ou son délai ; identification puis compensation par le modèle appris |

HOT-4 est un risque majeur : un embedding fourni par API ou une étiquette « quality space » ne suffit pas. Définir la géométrie, rendre le code inspectable et valider son utilisation. Le codage perceptif et l'intégration RPT-2 sont des chantiers supplémentaires au programme initial.

## 6. Registre des quinze familles GenOS

Toutes les sorties ci-dessous sont des objectifs, pas des résultats acquis.

| Famille historique | Travaux nécessaires | Critère d'acceptation proposé |
|---|---|---|
| Diffusion globale | Workspace à capacité bornée, identités de contenu et reçus par consommateur | Accès puis utilisation causale démontrés dans chaque classe de module du profil |
| Goulot/ignition | Relier compétition existante à admission, maintien et éviction | Courbe de réponse et transitions stables sous perturbation ; pas de saturation permanente |
| Attention sélective | Contrôleur attentionnel et modèle de ses propres limites | Réallocation utile sous distracteurs, sans élargir les permissions |
| Récurrence entretenue | Feedback perceptif, maintien de tâche, scheduler existant | Mémoire différée et convergence ; arrêt/préemption fiables ; gain contre feedback coupé |
| Modèle de soi | Capacités, ressources, effecteurs et incertitude actualisés par reçus | Prévoir ses échecs et s'adapter à une capacité retirée sans description textuelle préalable |
| Monitoring métacognitif | Fiabilité, croyances et arbitrage épistémique reliés | Calibration et risque sélectif améliorés à couverture comparable ; pas d'abstention totale |
| Inférence prédictive | Modèle perceptif hiérarchique et précision apprise | Erreur hors entraînement réduite ; prior faux corrigé par évidence fiable |
| Distinction soi/monde | IDs causaux sur tous les effecteurs du profil | Distinguer action propre, événement externe, échec et délai avec erreur mesurée |
| Modèle du monde | État/contextes, incertitude, rollout récursif et contrôle | Meilleure politique sur environnements réservés ; abstention OOD calibrée |
| Agency flexible | Objectifs concurrents, politique apprise et morphogenèse | Adaptation au changement, transfert et maintien des invariants sous même budget |
| Intégration causale | Interventions nœuds/canaux et contrôles de ressources | Dépendances, indépendances et interactions connues récupérées ; aucune assimilation à Φ |
| États valués/intéroception | Variables mesurées, trajectoires et planification allostatique | Choix adaptés à l'état interne et meilleure viabilité sans sacrifier les obligations |
| Consolidation offline | Replay, oubli contrôlé, validation et héritage | Rétention/transfert améliorés contre repos et replay aléatoire à coût comparable |
| Accès/rapport | Claims typés, rendu contraint, gate avant émission | Zéro assertion factuelle non autorisée dans le langage de sortie fermé ; couverture utile mesurée |
| Discipline no-report | Mesures de comportement et d'état indépendantes du texte | Conclusions fonctionnelles conservées avec rapport masqué, trompeur ou absent |

L'intégration causale est une cible d'ingénierie indépendante. Une éventuelle étude IIT exigerait sa théorie/version, sa granularité et son modèle causal physique propres ; ce plan ne promet pas une mesure de Φ du système complet.

## 7. Corrections nécessaires aux phases 0–30

### Conserver

Réutiliser `morphogenesisPlannerService`, `dynamicReevaluationExecutorService`, la fitness et les gates existantes, le Pareto culturel, les transitions versionnées et AgentGit. Conserver populations bornées, niches, dormance et fossiles avec revalidation. Garder la séparation entre qualité des preuves, performance et diversité. Commencer en shadow, passer en canary sous critères explicites puis élargir par domaine.

### Corriger

- **Rapport** : une citation valide n'implique pas la phrase. Une liste de nombres ou outils autorisés ne bloque pas une inversion de sens. Pour une garantie stricte, rendre des assertions typées via des templates déterministes ou un AST de propositions vérifiable. Le LLM peut sélectionner/ordonner des éléments autorisés ; sa prose libre reste une sortie sans garantie universelle. Ne rien diffuser en streaming avant validation. Les recommandations et connecteurs ne doivent pas cacher de nouveaux faits.
- **Réparation** : convertir une invention en « peut-être » ne la rend pas sourcée. Supprimer l'affirmation ou produire une incertitude explicitement autorisée. Distinguer exactitude du rendu, qualité des claims et vérité externe.
- **Morphogenèse** : `planA !== planB` peut refléter un ID ou timestamp. Comparer une projection sémantique du plan, puis la commande réellement exécutée et son résultat. Vérifier la transmission des changements par `buildTransitionPlan`.
- **Monde** : séparer compteurs cumulés, jauges, booléens et événements dans `applyDelta`. L'état doit contenir les variables prédictives du domaine, pas seulement le coût et les tests. En observabilité partielle, maintenir un état de croyance/historique. Évaluer calibration et dérive ; n=1 ne justifie pas une certitude.
- **Intervention** : `supported` n'autorise pas toute mutation. Le reçu doit correspondre à la cible, au contexte, au snapshot et à la version du plan actuels. Changement de contexte ou dérive invalide l'autorité.
- **Isolation** : même seed ne garantit pas mêmes réponses distantes. Épingler versions quand possible, enregistrer réponses et nondéterminisme, randomiser l'ordre et apparier les essais. Cloner fichiers, DB, mémoire, caches et RNG ; pas seulement un objet JavaScript.
- **Persistance/événements** : les placer avant les essais. SQLite peut être la source transactionnelle et le graphe une projection de références ; vérifier d'abord les adaptateurs réellement installés. Utiliser outbox/idempotence, crash recovery et hashes de contenu.
- **Validation** : le corpus réservé doit être figé avant calibration. Les scénarios consultés par les développeurs deviennent publics et sortent du holdout final. Utiliser un générateur et une évaluation réservés à un opérateur indépendant.
- **Ablations** : retirer un mécanisme ne doit pas simplement retirer ses tokens ou casser une interface. Ajouter intervention factice, calcul de remplacement, budget consommé et tests d'interactions. Un effet nul doit pouvoir réfuter l'utilité revendiquée.

## 8. Architecture cible et contrats

Un seul chemin de contrôle de mission : perception → état de croyance → workspace/attention → candidats d'action → sélection sous gates → action → observation → apprentissage → persistance → réutilisation. La morphogenèse propose une modification de ce chemin via le planner existant. L'arena exécute des expériences isolées ; elle ne devient pas un second planner. Les contraintes de sécurité restent obligatoires dans tous les bras.

Contrats à versionner en premier : `MorphogeneticCandidate`, `WorldTransition`, `VerifiedRendering`, `CausalInterventionReceipt`, puis `PerceptualState`, `AttentionState`, `BeliefUpdate`, `DecisionReceipt`, `IndicatorEvaluation`. Chaque contrat porte schéma, version, IDs de run/action, parents, sources et statut de données manquantes.

`DecisionReceipt` lie : état avant/hash → propositions → contraintes → choix de référence et choix retenu → raison → action exécutée → observation → erreur prédictive → mise à jour → preuve de persistance/réutilisation. `IndicatorEvaluation` lie ID, profil, révision code/modèle, protocole, jeux de données, budgets, échantillon, effet, intervalle, échecs et artefacts. Aucun nom d'événement ne suffit à prouver l'étape qu'il décrit.

## 9. Ordre de réalisation : un point, un commit

Chaque lot ci-dessous constitue un point de livraison avec tests utiles et reçu associé. Préfixer les commits par `[FEAT]`, `[FIX]`, `[TEST]` ou `[DOC]`. Si un lot doit être décomposé, créer des sous-points nommés avant modification, chacun avec son critère ; ne pas regrouper plusieurs points dans un commit. Ajouter les ADR au point architectural concerné, puis actualiser les documents de synthèse au lot 25.

| Lot | Livrable et dépendances | Sortie nécessaire | Anciennes phases |
|---|---|---|---|
| 01 | Référentiel, profils et baseline au HEAD | Registres 14 + 15, absence/présence/inconnu traçables, assertions documentaires réconciliées | Préparation ajoutée |
| 02 | Contrats versionnés et reçus | Validation stricte, compatibilité/migration, références stables | 0 |
| 03 | Stockage transactionnel et événements | Idempotence, restauration, provenance et projection graphe vérifiées | 23–24 avancées |
| 04 | Runner expérimental isolé réutilisant le service existant | Deux exécutions réelles, contrôles vérifiés, budgets et nondéterminisme enregistrés | 18–19 |
| 05 | Protocoles et corpus train/dev/réservé | Hypothèses, critères, seeds, manifestes et politique anti-fuite figés | 25–30 préparées |
| 06 | TruthGraph → SemanticReport → rendu fermé | Claims canoniques ; rejet des causalités déduites de mentions | 11–13 |
| 07 | Gate de toutes les sorties finales | Nombre inventé, inversion et contradiction bloqués avant émission et completion | 14–16, 27 |
| 08 | WorldState et modèle conditionnel | État avant/après réel, support/incertitude/OOD ; S1/S2 donnent des choix pertinents distincts | 8 |
| 09 | Rollout récursif et décision contrôlée | Deltas composés correctement ; policy flip exécuté, observé et réversible | 9–10, 26 |
| 10 | Substrat perceptif inspectable, binding et récurrence | RPT-1/2 sous occlusion/ambiguïté ; état perceptif utilisé dans l'action | Ajout |
| 11 | Hiérarchie générative et espace perceptif | HOT-1/4 et PP-1 : représentations inspectables, précision et erreurs réellement consommées | Ajout |
| 12 | Workspace global et ignition compétitive | GWT-1/2/3 : spécialistes, capacité, livraison, accès et usage | Ajout |
| 13 | Attention contrôlée par son modèle | AST-1/GWT-4 : requêtes successives et réallocation prédite | Ajout |
| 14 | Métacognition → croyances → action | HOT-2/3 : bruit détecté, révision et calibration ; abstention non triviale | Ajout |
| 15 | Modèle de soi et effecteurs couverts | AE-2 : perturbations compensées, attribution et délais testés | Ajout |
| 16 | Objectifs concurrents et allostase | AE-1 : apprentissage et compromis sous invariants, comparaison politique figée | Ajout |
| 17 | Population et contexte morphogénétique | Génération bornée depuis signaux, opérateurs existants et provenance | 1–2 |
| 18 | Fitness, Pareto et destins multiples | Niches préservées ; inconnus exclus de promotion ; gate épistémique obligatoire | 3–5 |
| 19 | Hypothèse promue → plan → action | Différence sémantique exécutée, contre-factuel sur le plan final, observation/rollback | 6–7 |
| 20 | Verdict expérimental et intégration au planner | Recommandation PID testée, reçu contextuel, transition versionnée admissible | 17, 20–21, 28 |
| 21 | Apprentissage inter-missions et consolidation | Rétention, lignée, niches/fossiles, revalidation et réutilisation après redémarrage | 22 + ajout |
| 22 | Banc morphogenèse et opérateurs comparés | Variable modératrice découverte sans fuite ; gain réservé à budget comparable | 29 |
| 23 | No-report et ablations croisées du système | Résultats mécanistes indépendants du texte ; effets et interactions préenregistrés | 30 + ajout |
| 24 | Campagne réservée et réplication indépendante | Verdict par indicateur/profil, intervalles, résultats négatifs, artefacts rejouables | 25–30 exécutées |
| 25 | Documentation finale et matrice de preuves | Statuts issus des reçus ; limites, commandes, index et suivi de dérive à jour | Documentation demandée |

Ordre par défaut : 01 → 25. Les lots 06–07 sécurisent le rapport tôt. Les lots 08–16 établissent le circuit que la morphogenèse doit ensuite faire évoluer. Le lot 05 prépare dès le début les expériences finales ; les benchmarks locaux de développement peuvent accompagner chaque lot, sans consulter le corpus réservé. Aucun gain ne justifie de sauter un gate non satisfait.

## 10. Plan expérimental commun

### Environnements

1. **Micro-environnements mécanistes** : règles causales connues, signaux bruités, objets partiellement visibles, mémoire différée, distracteurs, ressources internes, canaux et effecteurs perturbables. Ils testent les mécanismes et permettent des interventions interprétables.
2. **Missions de dépôt/outils** : vrais workspaces isolés et outils autorisés ; objectifs qui changent, incidents, restauration, contraintes de coût, faits contradictoires. Elles testent la fermeture jusqu'à l'action réelle.
3. **Transfert** : nouvelles règles, combinaisons, topologies et versions compatibles. Publier les profils pris en charge ; ne pas généraliser d'une seule topologie aux huit.

Les quatre bancs initiaux restent utiles : monde à effet dépendant de S ; rapport avec 20 claims soutenus, 5 contestés, 5 non vérifiés ; circuit A→C avec B indépendant et interaction A/D ; environnement où Z modère X→Y. Les compléter par variantes non vues et mesures des mécanismes manquants. Un scénario écrit pour la construction devient un test de développement, pas une preuve réservée.

### Bras et ressources

Comparer modèle seul, GenOS avec mécanisme coupé, GenOS complet, intervention factice, politique simple et variante figée. Adapter les bras à chaque hypothèse, sans lancer toutes les combinaisons inutilement. Même modèle/configuration, outils, plafonds et conditions initiales ; compter apprentissage, générations, forks, consolidation, tokens, latence, énergie estimée séparément et temps humain. Rapporter plafonds et consommations effectives ; un budget maximal égal ne suffit pas à égaliser le calcul.

Pour une dépendance entre organes, utiliser un plan factoriel ciblé (ex. monde × morphogenèse, workspace × métacognition) et contrôler les substitutions fonctionnelles. L'arena conserve les contrôles de sécurité et permissions ; leur retrait n'est pas une ablation admissible.

### Statistiques et critères

Avant accès au réservé, fixer pour chaque test une métrique principale, un effet minimal utile δ, une marge de non-infériorité, les secondaires, le nombre d'essais et la règle d'arrêt. Estimer la taille sur un pilote distinct en visant une puissance d'au moins 80 %, avec intervalle à 95 % ; seuils proposés à confirmer au lot 05. Apparier les runs, traiter le scénario comme unité indépendante, utiliser un bootstrap hiérarchique si nécessaire et corriger les comparaisons multiples. Ne pas remplacer la puissance par « 8 réplicats » arbitraires.

Promotion d'un gain : borne inférieure de l'effet orienté > δ, contraintes et non-infériorités satisfaites. Validation d'une absence d'effet : test d'équivalence dans la marge annoncée ; p non significatif ne prouve pas l'indépendance. Les tests structurels emploient leurs propres invariants et manipulations. Tous les échecs, timeouts et manquants restent au dénominateur selon une règle prédéclarée ; aucun cherry-picking de seeds.

Rapport : viser zéro violation observée tout en publiant couverture et borne de risque. Avec zéro échec sur N essais indépendants, la borne supérieure à 95 % est approximativement 3/N ; cela ne démontre pas un risque universel nul. La garantie de construction du rendu fermé porte uniquement sur le langage et les claims autorisés, pas sur la vérité de leurs sources.

Mesures transversales : succès réel, qualité de preuve, Brier/log-loss lorsque adaptés, courbe risque-couverture, erreur multi-étapes, regret de politique, taux de détection OOD et faux positifs, rétention/transfert, coût total, latence, violations et restauration. Choisir les métriques pertinentes par mécanisme, sans score composite qui masque un échec.

## 11. Exploitation, livraison et conditions d'arrêt

Chaque mécanisme admis suit shadow → canary borné et déterministe → extension au profil validé. Le taux de canary dépend de la puissance et du risque observé ; 5 % n'est pas une preuve en soi. Régression, dérive, reçus périmés ou données insuffisantes rendent le mécanisme consultatif et déclenchent le repli prévu. Une mise à jour de modèle ou de schéma invalide les validations affectées.

Les changements architecturaux exigent un ADR. Chaque point comporte l'appel de production, le test mécaniste ou d'intégration pertinent, le reçu et sa limite. Avant livraison de l'implémentation : `python scripts/ci/check_code_quality.py`, `npm test`, `cargo test --workspace`, plus les suites ciblées justifiées. Ne pas commiter DB, secrets ou artefacts générés ; conserver les artefacts dans un stockage référencé par manifestes/hashes. Stage explicite des fichiers du point, puis commit ; docs de synthèse ensuite, puis push demandé.

Arrêter une promotion, pas masquer un résultat, si l'effet ne se réplique pas, si le coût annule le gain, si une propriété reste inaccessible, si l'ablation est invalide ou si les garanties d'isolation ne tiennent pas. Réviser l'hypothèse ou conserver le composant comme expérimental. Le tableau peut légitimement rester incomplet.

**Premier jalon concret : lots 01–05.** Ils rendent les résultats comparables, empêchent les faux ✅ et permettent de mesurer les lots suivants. Le principal avantage propre à GenOS sera d'employer ses snapshots, forks, budgets, lignées et gates pour rendre chaque prétention réfutable et chaque apprentissage réutilisable.
