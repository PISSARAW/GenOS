# Plan d’implémentation de GenOS Verified Evo-Devo (GVX)

- **Statut** : exécution en cours, un commit par lot ; aucune capacité GVX complète n’est revendiquée.
- **Périmètre** : faire converger l’apprentissage, la morphogenèse, les expériences contrefactuelles, la transmission et la promotion vérifiée en un processus développemental traçable.
- **Principe de livraison** : chaque étape livre une capacité bornée, avec provenance durable et critères de sortie vérifiables. Une preuve de transport ou un score interne ne vaut pas preuve d’amélioration.
- **Source conceptuelle** : texte fourni par l’utilisateur, « GenOS Verified Evo-Devo — GVX ».

| Lot | État | Preuve disponible |
| --- | --- | --- |
| 0 — Inventaire et décisions | Réalisé | ADR 0239 et inspection des services existants |
| 1 — Registre durable | Réalisé | Migration `097-gvx-development-ledger`, test `test_gvx_development_ledger.js` |
| 2 — Interoception et viabilité | En cours | Contrat initial et test `test_gvx_interoception.js` |
| 3 — Transformations et curriculum | À faire | — |
| 4 — Nurserie et preuve | À faire | — |
| 5 — Adaptation somatique | À faire | — |
| 6 — Transmission | À faire | — |
| 7 — Méta-développement | À faire | — |
| 8 — Évaluation | À faire | — |

## 1. Objectif et invariants

GVX relie cinq processus distincts sans les confondre :

| Processus | État modifié | Exemple de preuve attendue |
| --- | --- | --- |
| Apprentissage | connaissances, prédictions, compétences acquises | résultat reproductible sur tâches tenues à l’écart |
| Ontogenèse | état d’un individu pendant sa vie | provenance avant/après et absence de régression inacceptable |
| Morphogenèse | organisation et politique d’exécution | comparaison appariée avec une morphologie de référence |
| Évolution | dispositions transmissibles entre générations | bénéfice répliqué dans des contextes et descendants distincts |
| Transmission culturelle | compétence transférée entre individus ou lignées | compatibilité, quarantaine, essai local et décision d’assimilation |

Les invariants sont :

1. Les propositions de changement peuvent venir du modèle, mais l’autorité, les limites de ressources, les évaluateurs scellés et la décision finale de promotion appartiennent au plan de contrôle.
2. Toute transformation est versionnée, liée à son état parent, à sa cause supposée, à ses expériences et à ses preuves.
3. `verified`, `empirically_supported`, `probabilistically_supported`, `correlated`, `subjective` et `unknown` sont des états épistémiques distincts. Une absence d’oracle ne devient pas un succès.
4. Les essais sont isolés, bornés et comparables. Un résultat négatif ou inconclusif est conservé avec ses conditions d’essai.
5. Une adaptation somatique ne devient pas automatiquement héréditaire ; un transfert culturel n’accorde jamais une autorité ni une lease d’outil.
6. Les caractéristiques biomimétiques restent des hypothèses d’architecture jusqu’à ce qu’une ablation démontre leur utilité.

## 2. État initial à prendre en compte

Le dépôt dispose déjà d’un socle substantiel. Le plan s’appuie sur ces chemins existants, à revalider au démarrage de chaque lot :

| Capacité | Point d’ancrage actuel | Limite de départ connue ou question à fermer |
| --- | --- | --- |
| Ontogenèse persistante et intégration de code | `backend/src/services/ontogenesis/`, notamment `proofService.js` et `integrationController.js` | Le contrat actuel vise l’intégration de code. Il faut définir les contrats communs aux transformations non-code, sans affaiblir l’autorité existante. |
| Choix de topologie | `backend/src/services/ontogenesis/topologySelector.js` | Le sélecteur contient des préférences déterministes. Déterminer précisément où le `PolicyLearner` et les outcomes vérifiés peuvent devenir la politique adaptative autorisée. |
| Trinity | `backend/src/services/morphogenesis/` et `docs/02-orchestration/topologies/trinity.md` | Trinity v1 isole trois mondes et compare leurs preuves ; plusieurs axes restent partiels ou différés. GVX doit consommer le contrat réel, pas supposer une optimisation ou une calibration absente. |
| Expérience morphologique | `backend/src/services/morphogenesis/learning/morphologyExperienceStore.js` | Le schéma porte déjà mission, morphologie, coûts, résultats et contrefactuels. Vérifier l’autorité de persistance et les garanties de rétention avant d’ajouter un magasin parallèle. |
| AgentDNA | `backend/src/services/agentDnaInnovation.js` et services associés | Séparer nettement candidate structurelle et bénéfice expérimental longitudinal avant toute promotion héréditaire. |
| Plasmides | `backend/src/services/morphogenesis/plasmidGateService.js`, `backend/src/services/plasmidInstallService.js` | Les gates d’intégrité, compatibilité, autorité, immunité et lease existent ; confirmer la durabilité du journal et fermer les contrôles immunitaires manquants observés dans les adaptateurs concernés. |
| Fossiles et population | `fossil*`, `morphogeneticPopulationService.js`, services `metapopulation/` | Établir si l’échec informatif, les niches et la diversité ont des contrats persistants et des critères d’usage mesurables. |

Cette table est une carte de départ, pas une déclaration de complétude. Le lot 0 doit vérifier les implémentations, tests, ADR, migrations et consommateurs réels. Les constats du texte utilisateur sont des pistes à confirmer : le dépôt peut avoir évolué depuis leur rédaction.

## 3. Architecture cible

GVX ajoute une boucle de développement au-dessus des services existants. Il ne remplace ni le backend de contrôle ni les runtimes de topologie.

```text
Épisodes et outcomes vérifiés
            ↓
Explication causale + graphe de compétences
            ↓
Proposition typée de transformation
            ↓
Plan d’essai et jumeaux depuis le même snapshot
            ↓
Nurserie contrefactuelle (Trinity / AgentGit selon le cas)
            ↓
Vérificateurs indépendants + contrôles immunitaires
            ↓
Barrière de preuve et reçu de décision
            ↓
Registre développemental durable
      ↙                     ↘
adaptation somatique       candidate germinale / transfert culturel
      ↘                     ↙
       morphologie, niches et curriculum
```

Les nouveaux contrats communs à concevoir sont :

- **État développemental** : snapshot versionné des compétences, connaissances, morphologie, état épistémique, santé, ressources et intégrité. Chaque dimension a une source, un horodatage, une unité et un statut de mesure ; les valeurs inconnues restent nulles/explicites.
- **Transformation candidate** : type de plasticité P0–P9, parent, motivation, expérience source, hypothèse falsifiable, portée, coût, risques, prérequis, stratégie de retour arrière et destination (soma, germline candidate, transmission).
- **Expérience** : protocole, snapshots, variables contrôlées, graines, budgets, mondes, oracle, métriques brutes, artefacts, limites et statut final.
- **Reçu de développement** : empreintes parent/candidate, décision, preuves référencées, version des vérificateurs et règles, régressions, incertitudes, approbation et suite de lignée.
- **Enveloppe de viabilité** : seuils versionnés par profil pour intégrité des preuves, sécurité, calibration, coût, mémoire, régression et disponibilité des ressources. Le profil distingue seuil dur, seuil d’alerte et mesure informative.

Les niveaux de plasticité P0–P9 du texte source servent de taxonomie de portée, pas de séquence de livraison ni d’autorisation. Les niveaux qui touchent le plan de contrôle, les vérificateurs, les évaluations cachées ou les limites d’autorité restent hors du périmètre évolutif.

## 4. Lots d’implémentation

### Lot 0 — Inventaire, frontières et décisions d’architecture

**But :** établir une référence exacte et empêcher les doublons ou les affirmations prématurées.

- Cartographier producteurs et consommateurs des épisodes, outcomes, expériences, reçus, forks AgentGit, données AgentDNA, plasmides et fossiles.
- Pour chaque magasin, relever durabilité, transaction, identité, rétention, migration, isolation multi-projet et comportement après redémarrage.
- Vérifier dans le code les limites de Trinity, du sélecteur, des gates plasmidiques, des stubs de transfert et de l’évaluation AgentDNA mentionnés dans le texte source.
- Publier les écarts confirmés, la matrice capacité ↔ contrat ↔ preuve et les décisions d’architecture requises.

**Sortie :** inventaire vérifié, propriétaires des données et ADR pour les frontières de confiance, le registre développemental et le protocole de promotion. Aucun nouveau moteur adaptatif avant fermeture de cet inventaire.

### Lot 1 — Registre développemental durable et provenance causale

**But :** rendre chaque changement reconstructible avant d’optimiser les décisions.

- Définir les schémas versionnés pour `DevelopmentalState`, `TransformationCandidate`, `ExperimentRecord` et `DevelopmentReceipt`.
- Persister les événements et snapshots avec liens parent-enfant, empreintes de contenu et migrations compatibles avec le stockage existant.
- Relier les expériences et décisions aux mécanismes de provenance AgentGit sans faire de Git l’unique registre transactionnel.
- Conserver les outcomes défavorables et les candidats rejetés ; rendre une répétition idempotente et auditable.

**Critères de sortie :** restauration après redémarrage dans un nouveau processus ; intégrité des empreintes ; détection des références absentes ou modifiées ; aucun reçu de promotion sans expérience référencée ; migrations testées depuis les versions supportées.

### Lot 2 — État développemental, interoception et enveloppes de viabilité

**But :** convertir les signaux internes existants en données comparables et gouvernées.

- Agréger mémoire, coût, latence, budget, erreurs, santé des workers, qualité des preuves et sécurité via adaptateurs vers leurs sources de vérité.
- Produire un état multi-échelle : worker, orchestrateur, morphologie, lignée et population, avec agrégations explicitement définies.
- Définir les enveloppes de viabilité versionnées ; un état hors enveloppe bloque ou réduit l’expérience selon la politique, il ne se transforme pas en score compensable.
- Ajouter qualité de calibration et incertitude seulement là où il existe une méthode et des données d’évaluation ; sinon les marquer inconnues.

**Critères de sortie :** chaque signal est traçable jusqu’à sa source ; valeurs manquantes visibles ; seuils durs fail-closed ; évaluations déterministes des transitions de l’enveloppe.

### Lot 3 — Transformations candidates, hypothèses et curriculum de compétences

**But :** faire passer l’unité de développement du souvenir au changement justifié.

- Introduire des types explicites de mutation : mémoire/prior, compétence, stratégie, représentation, coordination, topologie, harness/code, expression épigénétique, disposition héréditaire et politique d’apprentissage.
- Construire un graphe de compétences/prérequis à partir de résultats vérifiés et d’étiquettes contrôlées ; les propositions du modèle restent des hypothèses à confirmer.
- Produire un plan d’expérience avant exécution : prédiction, critères de réfutation, population de tâches, budget, baseline, contrôle de régression et oracle.
- Réutiliser mémoire, PolicyLearner et services morphologiques existants derrière des adaptateurs ; séparer stockage d’expérience et autorité de promotion.

**Critères de sortie :** candidat typé et sérialisable ; refus des types inconnus ; hypothèse sans protocole exécutable reste non promouvable ; un curriculum respecte coût, prérequis et règles d’autorité.

### Lot 4 — Nurserie contrefactuelle et barrière de preuve

**But :** expérimenter des futurs candidats comparables et laisser la décision aux preuves indépendantes.

- Créer les mondes candidats depuis un snapshot identique, avec écritures, ressources et secrets isolés ; vérifier les empreintes avant l’exécution.
- Réutiliser Trinity v1 quand trois stratégies indépendantes répondent au protocole ; utiliser des comparaisons appariées dédiées lorsque le protocole ne se ramène pas à Trinity.
- Ajouter des profils de vérification par type de claim : preuves formelles, tests et analyse, benchmark reproductible, ablation, essai tenu à l’écart, vérification adversariale ou revue humaine déclarée.
- Séparer les vérificateurs des candidats ; conserver les versions, entrées, résultats et limites. Les évaluations cachées sont détenues hors des mondes candidats.
- Autoriser les décisions `promote`, `reject`, `inconclusive` ou `escalate`; aucune moyenne ne compense une violation de contrainte dure.

**Critères de sortie :** isolation démontrée, contrôle des changements de contenu, budget/délai bornés, essai reproductible, résultat incomplet jamais promu comme positif, rejeu du reçu possible.

### Lot 5 — Adaptation somatique et morphogenèse mesurée

**But :** appliquer prudemment les transformations qui améliorent l’organisme en cours de vie.

- Connecter le registre à `topologySelector`, `PolicyLearner` et aux outcomes vérifiés sans convertir les préférences heuristiques en politiques prétendument apprises.
- Commencer par une recommandation en mode observation, puis un choix limité aux morphologies déjà implémentées et compatibles.
- Utiliser les coûts et la valeur mesurés pour savoir quand une topologie plus complexe est justifiée, y compris quand ne pas orchestrer.
- Exiger une période d’observation, une comparaison avec le comportement de référence, des seuils de régression et un retour arrière automatique.

**Critères de sortie :** gain apparié sur un jeu représentatif tenu à l’écart ; coût et latence mesurés ; aucun recul au-delà de l’enveloppe ; décision et motifs inspectables. Le mode automatique reste désactivé si la preuve est insuffisante.

### Lot 6 — Germline, plasmides et fossiles

**But :** ouvrir la transmission uniquement après bénéfice répliqué et préserver la diversité utile.

- **Germline :** convertir une adaptation somatique en candidate AgentDNA après répétition, transfert inter-contextes et comparaison contrefactuelle ; la compatibilité structurelle ne constitue pas la preuve de supériorité.
- **Plasmides :** persister les événements de cycle de vie ; compléter le contrôle immunitaire des transferts ; garder quarantaines, leases et autorité du destinataire indépendantes ; mesurer l’effet chez le destinataire avant assimilation.
- **Fossiles :** enregistrer les échecs informatifs avec contexte, cause supposée, contre-exemples et réutilisabilité ; conserver les alternatives distinctes sans les déclarer viables.
- **Niches :** évaluer la qualité-diversité sur plusieurs dimensions mesurées ; ne pas imposer un champion global si les profils servent des niches différentes.

**Critères de sortie :** aucun transfert n’élève les privilèges ; bénéfice transmis vérifié sur le receveur ; retrait/expiration fonctionne ; lignées et échecs sont reconstructibles ; la diversité est rapportée sans prétendre à une supériorité globale.

### Lot 7 — Méta-ontogenèse et méta-morphogenèse sous contrôle

**But :** évaluer si la politique qui choisit comment apprendre ou s’organiser peut elle-même s’améliorer.

- Traiter la politique d’apprentissage et la politique morphogénétique comme des candidates à haut risque, avec versions et périmètres distincts.
- Tester sur des suites de tâches et des domaines retenus, avec sélection figée avant l’évaluation tenue à l’écart.
- Utiliser développement progressif : observation → recommandation → essai limité → promotion explicite selon le profil d’autorité.
- Garder le plan de contrôle, l’autorité, les vérificateurs, le registre signé, les budgets durs et les évaluations cachées non modifiables par GVX.

**Critères de sortie :** amélioration longitudinale répliquée, absence de régression grave, essais de falsification réussis, retour arrière validé et approbation correspondant au niveau de risque. Aucune auto-modification de la barrière de promotion.

### Lot 8 — Évaluation longitudinale, transplant et ablations

**But :** établir ce que GVX améliore réellement et quelles pièces sont nécessaires.

- Comparer à budgets, modèles, outils et distributions contrôlés : modèle seul, mémoire/RAG, GenOS de référence et GVX par lots activés.
- Déployer les expériences **Twin Ontogenesis** : clones identiques, expériences spécialisées, effacement des épisodes, mesure du transfert durable dans compétences, stratégies et morphologies.
- Déployer **Substrate Transplant** : remplacer le fournisseur/modèle et mesurer les capacités qui persistent, les adaptations à recalibrer et les pertes.
- Ablater Trinity, AgentGit, fossiles, plasmides, interoception, graphe de compétences et développement constitutionnel séparément puis selon interactions préenregistrées.
- Mesurer vitesse d’apprentissage, transfert, rétention, adaptation, coûts, calibration, validité causale, régressions, diversité, robustesse au changement de modèle et résistance à la falsification.

**Critères de sortie :** protocole publié avant résultats ; tâches et graines retenues ; répétitions suffisantes selon une analyse de puissance ; intervalles d’incertitude ; résultats négatifs publiés ; claims limités aux mesures obtenues. Aucun seuil de « supériorité à l’état de l’art » n’est déclaré sans comparaison externe reproductible.

## 5. Ordre de réalisation et dépendances

```text
Lot 0
  ↓
Lot 1 ─────→ Lot 2
  ↓             ↓
Lot 3 ─────→ Lot 4
                 ↓
             Lot 5
                 ↓
             Lot 6
                 ↓
             Lot 7
                 ↓
             Lot 8
```

Les lots 1 et 2 peuvent avancer en parallèle après validation du lot 0. Le lot 3 peut spécifier ses contrats en parallèle, mais ne peut dépendre d’un apprentissage durable non vérifié. Le lot 4 précède toute promotion automatique. Les lots 6 à 8 sont bloqués tant que le reçu de développement et la barrière de preuve ne satisfont pas leurs critères.

Chaque lot devrait être découpé en ADR lorsque la frontière de confiance, le format durable ou le comportement public change, puis en changements petits, migrables et réversibles. Les contrats et tests ciblés précèdent l’activation. Les commandes de vérification exigées par `AGENTS.md` s’appliquent à chaque changement de code concerné avant sa livraison ; ce document seul n’exécute ni ne revendique ces tests.

## 6. Portes de promotion communes

Une transformation durable est admissible seulement si toutes les conditions applicables sont réunies :

1. Identité et hash des snapshots parent/candidat vérifiés.
2. Sources, hypothèse, protocole, budget, environnement et versions des vérificateurs enregistrés.
3. Mondes et données d’évaluation isolés selon le niveau de risque.
4. Vérifications et contraintes du profil satisfaites ; aucune violation de sécurité ou de règle constitutionnelle.
5. Mesures brutes accompagnées de leurs unités, dénominateurs, limites et incertitudes.
6. Régressions et coûts dans l’enveloppe ; si l’oracle requis manque, décision inconclusive ou escaladée.
7. Autorité de promotion indépendante du candidat et de la politique testée.
8. Reçu durable écrit en dernier ; reprise et compensation couvrent les pannes intermédiaires.

Les valeurs de seuil ne sont pas fixées ici : elles doivent être définies par profil et justifiées par des données de référence dans les ADR et protocoles de benchmark.

## 7. Risques et réponses prévues

| Risque | Réponse d’architecture |
| --- | --- |
| Optimisation d’une métrique au détriment de la mission | Vecteur de preuves, contraintes dures, mesures indépendantes, données cachées et ablations. |
| Évaluateur altéré ou fuite entre mondes | Plan de contrôle non évolutif, séparation des rôles, isolation et vérificateurs détenus hors du candidat. |
| Apprentissage de corrélations présenté comme causal | Interventions appariées, contrefactuels, provenance de l’hypothèse et statut épistémique explicite. |
| Oubli ou perte d’acquis transférés | Évaluation de rétention, version parentale, fossiles d’échec et retour arrière. |
| Monoculture ou disparition des variantes utiles | Niche et Pareto plutôt qu’un seul score global ; suivi de diversité et conservation des alternatives. |
| Hausse incontrôlée du coût et du nombre d’agents | Budget strict, coût net mesuré, essais de simplicité et sélection d’un seul worker quand suffisant. |
| Données d’apprentissage durables uniquement en mémoire du processus | Registre transactionnel, reprise après redémarrage et reçus idempotents. |
| Métaphore prise pour une capacité | Statut de maturité, contrat et preuve attachés à chaque brique ; benchmark et ablation requis. |

## 8. Définition de « GVX livré »

GVX ne sera considéré comme livré que lorsque le parcours complet peut être rejoué de bout en bout : un outcome vérifié justifie une hypothèse de transformation ; un candidat est développé dans des mondes contrôlés ; des vérificateurs indépendants mesurent les effets et régressions ; la décision est persistée avec sa provenance ; l’application ou le transfert respecte l’autorité ; un redémarrage, une panne et un retour arrière conservent la cohérence ; enfin, une évaluation longitudinale et des ablations démontrent quelles améliorations sont attribuables à quelles capacités.

Avant cela, parler de « lots GVX implémentés » est acceptable si chaque capacité précise son statut. Dire que l’organisme s’améliore de façon générale ou dépasse l’état de l’art exige les résultats longitudinaux prévus au lot 8.
