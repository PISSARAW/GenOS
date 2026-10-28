# ADR 0749 — Liaison runtime immuable des bras expérimentaux GVX

- **Statut** : Proposé pour implémentation et revue de sûreté
- **Date** : 2026-10-28
- **Domaine** : GVX, exécution d’agents, ontogenèse, vérification, transmission et provenance
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : [ADR 0006](0006-active-global-organism-workspace.md), [ADR 0007](0007-agow-runtime-persistence-et-evaluation.md), [ADR 0035](0035-model-uplift-benchmark.md), [ADR 0021](0021-promotion-epistemique-des-decisions.md), [ADR 0727](0727-security-learning-ontogenesis.md), [ADR 0748](0748-agow-viabilite-collective-multiniveau.md)

## Contexte

Les protocoles d’expérience GVX peuvent décrire et hacher des bras, des mondes,
des budgets et leur provenance. Les profils d’exécution GVX existants hachent
des politiques somatiques AGOW (`regret`, `counterfactual`, `plasticity`,
`directPathways`, `proceduralization`, `markets`, `allostasis` et
`allostaticMorphogenesis`). Aucun de ces contrats ne lie un bras à l’ensemble
des services qui contrôlent l’acquisition, l’évolution, la vérification
présentée à l’apprenant et la transmission entre agents.

Un `armId` dans un manifeste, une consigne de prompt ou une variable
d’environnement ne prouve donc pas qu’un mécanisme est actif ou désactivé. Un
worker ou un worker de reprise peut aussi recevoir une configuration différente
de celle de son orchestrateur. Enfin, supprimer la vérification qui informe
l’apprenant ne doit jamais désactiver l’évaluateur externe ni les contrôles de
sûreté, d’autorité et de preuve du runtime.

## Décision proposée

Créer une liaison d’exécution expérimentale versionnée, validée et immuable,
portée par l’enveloppe d’autorité scellée de chaque trial. Elle est une
configuration de control plane; ni le modèle, ni le prompt, ni un worker ne
peuvent la créer, la modifier ou la remplacer.

### Contrat d’armement

Le profil canonique `genos.gvx.runtime-arm-profile/v1` déclare exactement :

- `campaignId`, `trialId`, `armId`, scope organisation/projet, identité de
  mission et révision du code GenOS;
- les modes `acquisition`, `evolution`, `learnerFacingVerification` et
  `transmission`;
- modèle/fournisseur, empreinte du jeu d’outils, budgets par phase, limites
  d’exécution et hash du manifeste d’expérience lié;
- `externalEvaluator: required`, invariant non configurable par les bras;
- la politique de promotion externe, qui interdit toujours toute promotion
  réelle d’un résultat non vérifié.

Le schéma JSON versionné refuse les propriétés inconnues, les valeurs hors
énumération, les identifiants dupliqués, les hashes invalides et tout écart au
manifeste preregistré. Les modes sont limités à :

| Dimension | Modes permis | Sens |
| --- | --- | --- |
| Acquisition | `disabled`, `simple_reflection_memory`, `gvx` | Acquisition GVX distincte de la lecture ordinaire du dépôt et de la mémoire de tâche temporaire. |
| Évolution | `disabled`, `gvx` | Création et sélection de variantes de compétences ou de stratégies GVX; la délégation ordinaire du travail reste disponible. |
| Vérification apprenant | `disabled`, `gvx` | Disponibilité des résultats des vérificateurs GVX dans le flux d’apprentissage et de promotion interne. |
| Transmission | `disabled`, `gvx` | Transfert d’artefacts de compétence approuvés vers un agent neuf, avec provenance. |

Les sept configurations sont définies dans le registre canonique du protocole,
et leur hash est vérifié contre le manifeste avant le démarrage :

| Bras | Acquisition | Évolution | Vérification apprenant | Transmission |
| --- | --- | --- | --- | --- |
| A | `disabled` | `disabled` | `disabled` | `disabled` |
| B | `simple_reflection_memory` | `disabled` | `disabled` | `disabled` |
| C | `gvx` | `gvx` | `gvx` | `gvx` |
| D | `disabled` | `gvx` | `gvx` | `gvx` |
| E | `gvx` | `disabled` | `gvx` | `gvx` |
| F | `gvx` | `gvx` | `disabled` | `gvx` |
| G | `gvx` | `gvx` | `gvx` | `disabled` |

Dans tous les bras, l’évaluateur externe s’exécute après le trial, avec les
mêmes suites et règles. Il reste isolé du workspace apprenant et ne remet à
l’apprenant qu’un reçu agrégé autorisé par le protocole. Dans F, le résultat
externe ne devient pas une entrée de sélection, d’apprentissage ou de promotion
de l’apprenant. Le runtime conserve ses barrières d’évidence et de sûreté; cette
ablation n’autorise pas à déployer une modification non vérifiée.

Cette matrice fixe la sémantique de départ. Toute modification exige une nouvelle
version du protocole et un nouveau hash; un runner ne peut pas réinterpréter un
bras existant.

### Frontières d’application obligatoires

Le binding est résolu avant le premier appel cognitif ou effet de bord du trial.
Les frontières suivantes reçoivent le même profil et doivent refuser un
contexte expérimental sans binding valide :

1. **Admission et propagation runtime** — l’adaptateur de mission, la
   construction du contexte, le lease, les contrats des workers, la reprise,
   les continuations et le runtime hôte. Une identité enfant hérite du même
   `profileHash`; tout override ou hash divergent bloque le démarrage.
2. **Acquisition / ontogenèse** — chargement des souvenirs et compétences GVX,
   capture d’expériences, création de claims de compétence, flux de
   `developmentalBridge` et opérations `ontogenesis`. `disabled` bloque ces
   lectures/écritures GVX; il ne bloque pas le dépôt attribué, les instructions
   de tâche ni la mémoire conversationnelle temporaire permise à tous les bras.
   Le mode B ne permet que la réflexion et la mémoire simples explicitement
   autorisées par le protocole.
3. **Évolution** — génération, mutation, comparaison et sélection de variantes
   de compétences ou de stratégies, y compris les chemins GVX, génomiques,
   `agentEvolution` et d’upgrade de capacités. `disabled` bloque les mutations
   de compétences expérimentales, mais ne supprime pas le dispatch nécessaire
   à la résolution de la tâche.
4. **Vérification présentée à l’apprenant** — les résultats des vérificateurs
   GVX, la sélection de candidats et les promotions de compétences consomment
   le mode lié. `disabled` interdit à l’apprenant d’utiliser le verdict
   indépendant comme signal de sélection ou de promotion. Les gates de sûreté,
   d’autorité, de preuves de tâche et de validation du runtime restent actifs.
5. **Transmission** — production, sélection, publication, lecture et import
   d’artefacts de compétences vers un agent neuf. `disabled` bloque ces chemins
   et tout accès à une identité ou conversation précédente; il ne bloque pas la
   transmission des consignes communes à tous les bras.
6. **Évaluation externe** — le runner d’évaluation opère dans un processus et
   un espace séparés, sous une autorité indépendante du profil apprenant. Aucun
   bras ne peut désactiver, remplacer ou modifier son évaluateur, ses suites ou
   ses règles de divulgation.

Chaque runtime cognitif admissible doit appliquer ces frontières. Une version
Node ou Rust qui ne possède pas le binding complet est refusée pour un trial
GVX; la parité ne se déduit pas de la seule parité MCP ou d’un manifeste valide.

### État des frontières dans le dépôt

L’implémentation actuelle ne satisfait pas ces exigences; aucun bras A–G n’est
exécutable. Les points d’entrée et écarts à traiter sont :

| Frontière | Point d’entrée actuel | Écart à combler |
| --- | --- | --- |
| Admission et exécution d’un bras | `backend/src/services/gvxExperimentalNursery.js` (`run`, `runArm`) | `runArm` appelle un `options.runWorld` opaque. Les appelants existants — `agow/experiments/rivalChallengeRunner.js`, `gvxPairedReplayBridge.js`, `gvxTraceGuidedRepair.js` et `gvxCycleExecution.js` — n’implémentent pas un exécuteur A–G scellé. |
| Missions, workers et reprise | `agentFleetWorkers.js` (`createAutonomousWorkers`), `agentContinuationQueueService.js`, `agentRecovery/dispatchWorkerRecovery.js` | Il n’existe pas de contrat de mission expérimental commun portant et vérifiant `profileHash` chez l’orchestrateur, les enfants, les continuations et les reprises. |
| Acquisition et ontogenèse | `developmentalBridge/agowToGvxSignalAdapter.js` (`recordAgowSignal`), `gvxDevelopmentController.js` (`processSignal`, `runCycle`), `gvxCycleExecution.js` | Ces chemins GVX n’acceptent aucun profil d’essai; aucun gate d’acquisition ne distingue les quatre modes d’armement. |
| Évolution | `agentEvolutionService.js` (`evolveWorkerGenome`), appelé notamment par `agentFleetWorkers.js`; mutation GVX dans `gvxCycleExecution.js` | L’évolution de workers est un chemin général partagé. Il n’existe pas de voie d’évolution GVX dédiée sous profil; ce service partagé ne doit pas être modifié pour appliquer l’ablation aux trials. |
| Vérification apprenant | `gvxAssessmentVerification.js` (`verifyAssessment`, `verifyLongitudinal`), appelé depuis `gvxCycleExecution.js` | La vérification existe dans le cycle GVX mais n’est pas gouvernée par le profil d’un trial ni séparée d’un canal de décision de l’apprenant. |
| Transmission | `gvxTransferLifecycle.js` (`startTransfer`, `advanceTransfer`) | Le cycle de transfert de compétences ne reçoit pas de contexte d’essai ni de gate `transmission`. |
| Évaluateur externe | `gvxExperimentalNursery.js` et `gvxVerifierRegistry.js` | La nurserie exige un registre de vérificateurs, mais l’admission n’atteste pas un évaluateur externe obligatoire, son indépendance ni son isolation vis-à-vis de `runWorld`; aucun profil ne peut donc prouver cet invariant aujourd’hui. |

La réalisation nécessite d’abord un `GvxTrialExecutionAdapter` dédié, le seul
adaptateur admis pour A–G, qui scelle le contexte et rejette les exécuteurs
incapables de prouver l’application des gates et l’évaluation indépendante.
Les callbacks historiques restent hors de ce chemin. Tant que ce contrat et
ses tests de frontière ne sont pas en place, la validation d’un manifeste ou
d’un hash ne rend pas un bras exécutable.

### Intégrité et reçus

Le runtime canonise le profil, calcule `profileHash` (SHA-256), le lie au hash
du manifeste, au commit de code, à l’autorité d’exécution et à l’identité du
trial, puis inscrit un reçu append-only avant de démarrer l’agent. Le hash prouve
l’intégrité du contenu, pas l’auteur ni l’autorité : l’émission reste soumise à
l’enveloppe d’autorité et au journal GVX scellé existants.

Le reçu de liaison contient au minimum le schema, `campaignId`, `trialId`,
`armId`, `profileHash`, `manifestHash`, `genosCommit`, `runtimeId`, scope,
modèles/outils/budgets liés et l’identifiant d’autorité. Chaque transition de
frontière émet un reçu append-only corrélé, par exemple acquisition refusée,
mutation autorisée/refusée, verdict rendu à l’apprenant, artefact transmis ou
blocage de transmission. Il ne contient ni cas caché ni sortie par cas de
l’évaluateur. La clôture vérifie l’identité et le hash du profil sur les reçus
de l’orchestrateur, des workers, des reprises et de l’évaluateur.

Un binding absent, modifié, non scellé ou non supporté produit un blocage avant
exécution. Il ne retombe jamais silencieusement sur un autre bras.

### Compatibilité et activation

Hors contexte GVX expérimental, l’absence de profil conserve strictement le
comportement actuel. Dès qu’une mission porte un `campaignId` ou qu’un runner
demande un trial, un profil valide devient obligatoire. Aucun changement de
défaut normal n’est admis.

L’activation est interdite tant que le schéma, les frontières Node/Rust
retenues, les contrats enfants/reprise, le test d’isolation de l’évaluateur et
la revue de sûreté ne sont pas implémentés et passants. Un profil descriptif ou
un dry-run de manifeste seul ne rend pas un bras exécutable.

## Tests d’acceptation

La mise en œuvre devra démontrer au minimum :

- les missions hors campagne ont le même comportement et les mêmes hashes de
  politique qu’avant l’introduction du profil;
- les sept configurations canoniques valident et produisent des hashes stables;
  les champs inconnus, le profil modifié après admission, le hash invalide, un
  bras non preregistré ou un binding enfant divergent bloquent le démarrage;
- l’orchestrateur, les workers, les continuations et les reprises conservent le
  même `profileHash` et enregistrent leurs reçus;
- chaque frontière d’acquisition, évolution, vérification et transmission
  accepte/refuse selon les modes du bras et ne peut pas être contournée par
  prompt, outil, relecture, reprise ou appel direct de service;
- l’évaluateur externe tourne pour les sept bras, reste indépendant du profil
  apprenant et ne divulgue que l’agrégat permis; en F, aucun verdict externe
  n’entre dans la décision de l’apprenant;
- une mutation du profil ou de son manifeste entre admission et clôture rend le
  trial invalide et non comptable;
- les implémentations de runtime autorisées par le protocole passent les mêmes
  vecteurs de conformance Node/Rust; un runtime non conforme est refusé;
- un dry-run teste le binding et l’isolation sans lancer de modèle, d’agent ni
  d’évaluateur et compte zéro trial.

## Conséquences

### Positives

- Les bras A–G décrivent des interventions qui atteignent réellement le runtime,
  et non des étiquettes de provenance.
- Les enfants et les reprises ne peuvent pas changer de traitement au milieu
  d’un trial.
- L’ablation du bras F ne peut pas désactiver l’évaluation indépendante ni les
  barrières de sûreté du runtime.
- Les profils historiques AGOW restent distincts des interventions GVX globales.

### Négatives et limites

- Les frontières sont actuellement réparties entre plusieurs services; la
  migration demande une revue d’impact et des tests d’intégration étendus.
- Le protocole doit figer les définitions opérationnelles de mémoire simple,
  ontogenèse, évolution, promotion GVX et transmission avant d’émettre un
  manifeste exécutable.
- Un hash valide ne prouve pas que les frontières ont été appliquées; les reçus
  doivent être émis par les consommateurs runtime contrôlés et audités.
- Cette décision ne fournit ni corpus de tâches, ni runner 1 050 essais, ni
  audit indépendant de l’évaluateur.

## Alternatives

- **Réutiliser les profils somatiques AGOW** : rejeté, ils ne contrôlent que
  des mécanismes AGOW et ne coupent pas les autres chemins d’apprentissage.
- **Ajouter `armId` au manifeste ou au prompt** : rejeté, l’identité ne force
  aucune intervention dans le runtime.
- **Utiliser des variables d’environnement ou des flags fournis par
  l’apprenant** : rejeté, ils sont mutables et ne sont pas liés à l’autorité,
  aux enfants, aux reprises ou aux reçus.
- **Désactiver les contrôles de promotion pour F** : rejeté, le bras reste
  isolé et l’évaluateur externe demeure actif pour tous les bras; les protections
  de sûreté et d’autorité ne sont jamais ablatées.
- **Accepter seulement les runtimes dont les manifests déclarent les flags** :
  rejeté, la déclaration ne prouve pas l’application des frontières.

## Séquence d’implémentation

1. Approuver les définitions opérationnelles des quatre dimensions et la matrice
   des bras avec les responsables du protocole scientifique.
2. Définir le schéma strict, la canonisation, le scellage d’autorité et le reçu
   de binding dans le control plane.
3. Propager l’identité immuable aux contextes de mission, workers et reprises;
   échouer fermé pour tout runtime qui ne comprend pas le profil.
4. Ajouter les gates aux frontières d’acquisition/ontogenèse, évolution,
   vérification apprenant et transmission, sans changer les defaults hors GVX.
5. Isoler l’évaluateur externe dans un processus distinct et tester l’invariant
   `externalEvaluator=required` pour tous les bras, dont F.
6. Fournir les tests de conformance et l’audit indépendant du binding avant de
   déclarer les bras exécutables ou d’ouvrir la porte à des trials.
