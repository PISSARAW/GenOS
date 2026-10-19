# Morphogenèse adaptative : stratégie cible

## Statut et frontière actuelle

Ce document décrit une capacité runtime partielle, pas une capacité de production déjà
qualifiée. Le dispatch principal sait préparer une topologie et lier un graphe aux
affectations des workers (ADR 0522). Le superviseur backend peut répéter des époques de
continuation à chaque frontière quiescente, avec une tranche réservée dans le pool
restant et une nouvelle décision morphologique à chaque vague. Il s'arrête sur preuve
de résolution indépendante, budget incapable de financer la tranche minimale, limite
`morphogenesisPolicy.maxEpochs` explicite ou absence de reconfiguration admissible.
L'état des époques est checkpointé dans SQLite avec révision et idempotence, puis
restauré sur rapport entrant ou par un balayage borné au démarrage du worker de
maintenance. Le roster peut remplacer les survivants par de nouveaux slots worker issus
des composants de topologie; cela ne prouve pas encore qu'un nouveau kind ou daemon
sera disponible au dispatch. Le chemin de commit collectif n'est plus refusé par
principe : les ADR 0566 et 0569 qualifient un commit authentifié par l'autorité Rust,
précédé d'un snapshot durable des processus, workspaces, baux et budgets, puis vérifié
par relecture. Toute transition qui ne satisfait pas cette voie reste refusée; un graphe
préparé ou un reçu consultatif ne suffit toujours pas.

La tranche de compilation de recette visée ici reste **consultative**. Elle peut
décrire et évaluer une combinaison de topologies, variants, opérateurs, rôles,
workers, méthodes, daemons et budgets. Elle ne doit pas être présentée comme une
exécution de cette recette, une affectation effective des workers ou une autorisation
de transition sans traces runtime et tests de bout en bout correspondants.

Les tranches consultatives implémentées compilent une stratégie versionnée à partir
du profil, de la topologie sélectionnée, des capacités, du budget et des workers déjà
affectés. Les cinq phases exposent leurs signaux, méthodes candidates, alternatives,
plafonds et preuves attendues. Le registre des exécuteurs natifs sert à construire
une liste courte de couples `WorkerKind`/méthode; elle est filtrée par compatibilité
de contrat, capacités déclarées comme disponibles et affectations courantes. Les
capacités de cet input proviennent de `missionCapabilityPlan.availableCapabilities`
ou `autonomyPlan.capabilityInventory.available`, ainsi que des capacités déclarées
des kinds déjà affectés; les exigences de mission n’y sont pas ajoutées. Les méthodes
natives remplacent les placeholders des phases. Le reçu indique les options retenues,
rejetées et leurs raisons. Un contrat de méthode peut être lié à une affectation
existante compatible sous les gates d’activation. Cette liste ne prouve pas la
disponibilité d’une instance au dispatch. La tranche ne découvre pas les workers
libres ni l’état des daemons, ne crée pas de worker ou daemon, n’altère pas les leases
et ne déclenche pas de transition topologique. Les capacités dérivées d’un kind
affecté restent déclaratives : elles ne prouvent ni instance active ni lease valide.

### Époques répétées actuellement implémentées

`agentRoundService` traite les rapports terminaux d'une époque comme une barrière :
chaque worker attendu doit répondre avant l'évaluation, et les événements tardifs
d'une ancienne époque sont ignorés. Le contrôleur cherche d'abord un reçu de vérification
indépendant valide pour le périmètre de mission. À défaut, il classe les résultats,
réserve une allocation au-dessus du minimum par worker et appelle à nouveau le planificateur
Morphogenèse. `maxEpochs` est facultatif; sans limite explicite, le budget d'époques
admissibles est recalculé selon le pool restant et le nombre de survivants. La
politique conditionnelle reste bornée à 12 époques au plus, et la cohorte de
relève à 12 workers au plus : la taille cible est le minimum du demandé, de
l'abordable et de 12, sans redimensionnement arbitraire ni extension budgétaire
implicite. Les reliquats
inférieurs à la tranche minimale ne sont pas dépensés.

Pour une transition admise, un reçu scelle un `transitionId` dérivé de la recette et de
la base d'admission, du digest du graphe, puis des workers réellement recrutés (id,
kind, topologie, variant et tokens alloués). L'identifiant suit la continuation et son
rapport terminal. La résolution exige que tous les workers attendus correspondent à
ce reçu, puis qu'un reçu indépendant valide confirme le livrable. Le reçu conserve
les allocations et l'usage déclaré par les workers ainsi que le verdict lié au même
`transitionId`. Un écart ou l'absence d'un vérificateur indépendant laisse la mission
non promue. L'usage déclaré reste une mesure rapportée, pas une attestation comptable
indépendante.

Le backend enregistre désormais un checkpoint par mission contenant le plan, les
workers et leurs résultats, le budget, la phase, la révision et la barrière. Chaque
rapport terminal est persisté à son arrivée. Le worker de maintenance effectue aussi
au démarrage un balayage borné des checkpoints interrompus : il restaure les continuations
durables, demande le dispatch des entrées encore `pending` seulement si leur worker n'est
pas déjà actif, et ne renvoie pas les entrées `dispatching`, `dispatch_failed_ambiguous`
ou `dispatched`. Avant `startMission`, le dispatch revendique atomiquement la ligne
`pending → dispatching`. Le succès ou l'échec de l'exécution est ensuite conservé dans
la file; un arrêt pendant `dispatching` devient `recovery_required` et exige une
réconciliation/reprise opérateur. Ce coût est volontaire : l'effet externe et SQLite
ne partagent pas de transaction, donc le redémarrage ne peut pas distinguer sûrement
« effet non commencé » de « effet démarré mais accusé de réception perdu ». Il choisit
de ne pas redoubler un dispatch ambigu. Ce balayage confirme la tentative de reprise,
pas la réussite de l'exécution. Si aucune continuation durable n'existe, le checkpoint passe à
`recovery_required`, visible et reprenable par un opérateur; l'intention ambiguë n'est
pas rejouée automatiquement. L'idempotence et les portées organisation/projet restent
vérifiées. Trinity reste hors de cette boucle et de son store.

Cette boucle augmente le nombre de réévaluations, mais pas encore toute la puissance
visée. Les survivants peuvent être remplacés par une nouvelle cohorte aux identifiants
déterministes; un daemon n'est ni résolu ni activé. Le balayage au démarrage est limité
à 32 checkpoints par worker de maintenance et par boot; les plus anciens sont inspectés
d'abord et les suivants attendent le prochain démarrage. Il s'exécute après la
réconciliation des runtimes. Le résumé du balayage expose `durationMs`, temps écoulé
pour lister et traiter les checkpoints de ce boot; il ne fournit pas encore une latence
de récupération par mission ni une série historique de percentiles. Si le processus tombe après le checkpoint `advancing`, le
runtime cherche les missions durables de l'époque suivante, restaure budget/roster et
redispatche uniquement celles encore `pending`; les missions `dispatched` ne sont pas
envoyées une deuxième fois. Si aucune mission n'a été persistée, l'état devient
`recovery_required` au démarrage et doit être repris explicitement; le recrutement
réutilise alors les identifiants déterministes validés. Une incohérence de budget place
également le checkpoint en `recovery_required`; un opérateur doté
du droit `workspace:write` peut le réarmer via `POST /api/control-plane/morphogenesis/:missionId/resume`
dans la portée organisation/projet correspondante. Le contrôleur reprend alors depuis la
barrière sans attendre un autre rapport worker. Une transition collective ne démarre
qu'après fermeture des processus de tous les workers de l'époque. La structure locale
de l'inférence peut toutefois changer à un point sûr versionné sans attendre la fin de
l'époque.

## Intention

Faire de la morphogenèse un contrôleur de décisions sous contraintes, capable de
changer de forme selon le problème et les preuves observées, tout en sachant garder
la forme courante ou s'abstenir. L'optimisation porte sur la qualité vérifiée du
livrable, le coût total, la latence, la robustesse et la possibilité de reprise.
Un score de rapport worker est un signal de diagnostic ; il ne remplace jamais un
oracle indépendant ni la barrière de preuve de mission.

## Leçons comparatives et adaptation à plusieurs échelles

La morphogenèse ne revendique pas l'exclusivité des graphes d'agents, des checkpoints,
des handoffs ou du replanning. Ces familles établissent déjà plusieurs capacités;
GenOS doit les combiner à ses preuves d'autorité, de quiescence, de budget et de
résultat :

| Famille vérifiée | Leçon à appliquer dans GenOS |
| --- | --- |
| [LangGraph](https://docs.langchain.com/oss/python/langgraph/graph-api), [CrewAI](https://docs.crewai.com/v1.15.28/en/concepts/checkpointing), [Magentic](https://learn.microsoft.com/en-us/agent-framework/workflows/orchestrations/magentic) | Rendre les workflows inspectables, checkpointables et capables de replanifier après stagnation. Magentic expose notamment le suivi d'avancement et le replanning déclenché par blocage. |
| [AutoGen](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/), [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/), [Temporal](https://docs.temporal.io/ai) | Garder les handoffs lisibles et tester les pannes entre une décision et son effet externe. Persister l'état ne suffit pas à empêcher un effet relancé d'être dupliqué. |
| [AFlow](https://arxiv.org/abs/2410.10762), [ADAS](https://arxiv.org/abs/2408.08435), [MASS](https://arxiv.org/abs/2502.02533) | Compter le coût de recherche en plus du coût par mission, séparer exploration et confirmation, et isoler prompts, rôles, workers et topologies pour attribuer correctement les gains. |
| [DyLAN](https://arxiv.org/abs/2310.02170), [G-Designer](https://arxiv.org/abs/2410.11782), [AgentPrune](https://arxiv.org/abs/2410.02506) | Comparer le remplacement d'une cohorte à des interventions plus légères : réduire les agents, ajuster les communications ou arrêter plus tôt. Si l'intervention légère atteint le même résultat, la transition complète est inutile. |

La morphogenèse doit donc garder `NO_CHANGE`, la réduction du roster, la modification
des communications et l'arrêt anticipé parmi les options avant de financer une
transition complète. Chaque option doit être comparée sur résultat vérifié, coût total,
latence et coût d'exploration.

La réponse adaptative visée suit trois échelles :

1. **Pendant une époque**, ajuster l'attention, réduire les échanges redondants et
   modifier une structure locale de raisonnement pendant l'inférence. Cette adaptation est
   effective pour le runtime local (`intraEpochAdaptationService` +
   `intraEpochRoundHook`). Une incertitude élevée envoie par IPC une directive
   attentionnelle fermée et versionnée ; si elle arrive pendant une génération,
   la réponse devenue ancienne est écartée et l'inférence est relancée dans la
   limite de latence et de tentatives. Après au moins dix échanges, une redondance
   d'au moins 20 % supprime uniquement les doublons non probants avant leur écriture
   et leur livraison. Les preuves, reçus, succès, alertes critiques et handoffs ne
   sont jamais étranglés. Une proposition fermée de type `reasoning_representation`,
   `phase_order` ou `tool_sequence`, liée à une référence de preuve, provoque au point
   sûr suivant le checkpoint, le rejet de la génération obsolète et une régénération
   avec la structure versionnée. Les observations sont drainées vers la décision
   d'époque. Aucun processus worker n'est remplacé, aucun lease révoqué et aucune
   topologie collective changée en cours d'inférence. Les runtimes
   externes sans canal IPC continuent seulement à produire l'observation, sans
   application attentionnelle immédiate (ADR 0568).
2. **À la barrière**, garder la forme courante, redistribuer le budget ou composer une
   cohorte de remplacement à partir des résultats, de la topologie et des preuves
   runtime. Le changement reste soumis à la quiescence, au budget et à l'autorité.
3. **Entre missions**, calibrer les prédictions à partir des résultats acceptés par
   un oracle indépendant, puis confirmer sur des familles de tâches tenues à l'écart.
   Cette calibration comparative n'est pas encore démontrée par la campagne benchmark.

La retenue fait partie de la décision : un signal plus fort ne déclenche pas à lui seul
un recrutement. `NO_CHANGE`, l'abstention et la réserve de vérification doivent rester
des options réelles; les rapports corrélés ne comptent pas comme confirmations
indépendantes.

### Échelles effectivement disponibles

| Échelle | État runtime | Porte et limite actuelle |
| --- | --- | --- |
| `NO_CHANGE` | Repli actif quand aucune autre candidate n'est calibrée ou admissible. | Conserve le financement standard et n'autorise pas une action de groupe sur la seule base d'un rapport worker. |
| `COMMUNICATION_REDUCTION` | Action à la barrière, pour passer à `barrier_only` et retirer les seuls outils de coordination non requis. | Le backend produit désormais par défaut une métrique mission-scopée signée à partir des observations runtime checkpointées. L'action exige encore au moins dix observations, 20 % de redondance et des issues appariées calibrées pour le `candidateId` exact; sans ce corpus, `NO_CHANGE` gagne. |
| `RESOURCE_REALLOCATION` | Candidate de financement des groupes; les tokens réellement affectés sont liés à l'admission et au reçu scellé de transition. | Chaque allocation financée doit avoir une preuve indépendante liée à son digest; le plan exact doit être calibré. Le producteur de reçus des `resourceNeeds` n'est pas raccordé en production et aucun corpus d'issues vérifiées n'est livré par défaut (le stockage existe mais reste vide sans campagne), donc cette voie s'abstient en production. |
| `COHORT_REPLACEMENT` | Recrutement et réaffectation possibles à une frontière de quiescence. | Le sélecteur exige une calibration exacte; sans adaptateur de résultats vérifiés, `NO_CHANGE` gagne. La disponibilité d'un nouveau kind ou daemon au dispatch n'est pas garantie. |
| `ROSTER_REDUCTION` | Action de relève qui conserve un sous-ensemble explicite du front d'évidence, préserve les rôles requis et ne finance ni ne redéploie les workers retirés. | Exige `morphogenesisPolicy.rosterReductionTarget`, un plan strict et des issues appariées calibrées. L'admission revérifie le roster, le budget et la quiescence; le reçu scelle les identités retenues et retirées, et la file refuse toute divergence. |
| `EARLY_STOP` | Échelle distincte du portefeuille, sans continuation à sélectionner. | Toujours `unavailable` comme candidate (`early_stop_is_verification_gate_not_a_continuation_scale`) : l'arrêt suit le gate de résolution vérifiée, pas une sélection du portefeuille. |

## Boucle de décision proposée

1. **Observer** : établir une signature du problème et de son environnement :
   capacités requises, domaines, incertitude, risque, contraintes, disponibilité
   des workers et daemons, budget restant, qualité des preuves et provenance.
   Enregistrer les inconnues explicitement ; `absent` ne vaut pas `zéro`.
2. **Générer** : compiler un ensemble borné de recettes typées à partir du catalogue
   canonique. Chaque feuille associe topologie et variant compatibles ; les
   opérateurs de composition définissent les dépendances, la communication et la
   barrière de preuve. Inclure `NO_CHANGE`, une forme minimale et une option de
   vérification supplémentaire.
3. **Filtrer** : refuser les recettes qui violent capacités, permissions, leases,
   indépendance exigée, fan-out, allocation minimale, budget agrégé ou contrat de
   restauration. La validation structurelle ne confère aucune autorité runtime.
4. **Comparer** : estimer pour chaque candidat le gain, le coût de coordination,
   le risque de faux succès et le coût de transition. Conserver le front de Pareto,
   les hypothèses, les incertitudes et la raison du choix. Les prédictions apprises
   sont contextualisées par famille, variant, modèle, méthode et environnement ;
   hors distribution, réduire leur poids et privilégier un essai isolé.
5. **Exécuter selon l'autorité disponible** : une sélection initiale peut suivre
   le dispatch autorisé ; une comparaison shadow reste consultative. Une future
   transition active nécessitera, pour le même plan, décision Rust authentifiée,
   gouvernance, snapshot restaurable testé, contrôle de version CAS et reçu durable.
6. **Mesurer et apprendre** : relier la recette choisie, ses affectations réelles,
   les coûts mesurés et le résultat à un oracle indépendant. Apprendre seulement
   d'issues admissibles et vérifiées. Conserver séparément les échecs du mécanisme,
   les preuves manquantes et les échecs de la tâche.

## Exploration et économie de preuve

L'exploration dispose d'une tranche explicite du budget et d'un plafond de risque.
Elle privilégie les candidats qui réduisent une incertitude décisionnelle utile,
sur des capsules isolées ou en shadow. La valeur d'information guide l'allocation
des vérificateurs ; un clone sans oracle ne crée pas de preuve. Une recette coûteuse
ne devient admissible que si son gain vérifié justifie son coût complet. Les choix
et leurs probabilités sont journalisés pour permettre une analyse causale ; les
résultats des candidats non exécutés restent inconnus, jamais imputés comme échecs.

Le contrôleur surveille le décalage entre score local et verdict externe. Une hausse
de score causée par la duplication de claims, de liens ou de critiques corrélées
déclenche une vérification, pas une promotion. Sous dérive, il réévalue aussi le
champion précédent : une réussite passée peut devenir non pertinente.

## Protocole de qualification

Préenregistrer tâches, variantes admissibles, hypothèses et falsificateurs.
Comparer par blocs appariés, avec mêmes tâches, graines, modèles et budgets :
orchestrateur simple, topologie fixe, sélection heuristique, sélection apprise,
recette composite et adaptation. Garder des familles entières hors entraînement,
puis inverser volontairement la relation entre famille et meilleure forme.
Exécuter des ablations du choix de variant, du rebind, de l'apprentissage et de la
composition. Répéter sur un commit et un environnement figés.

Le critère principal est la réussite d'un livrable vérifié par un oracle extérieur
aux workers. Rapporter coût total, latence de queue et de bout en bout, regret par
rapport aux alternatives effectivement observées, calibration, temps de récupération
après dérive, transitions inutiles et taux d'abstention. Afficher les intervalles
d'incertitude et les échecs par famille ; une moyenne globale peut cacher une
régression critique. La promotion exige aussi des contrôles négatifs : preuve
fabriquée ou dupliquée, worker indisponible, daemon en panne, budget épuisé, lease
expirée, snapshot périmé et course de versions. Chaque faux positif est bloquant.

Une campagne où seuls le composeur, le dispatch ou les probes de session passent
prouve le câblage du mécanisme, pas la supériorité causale de la recette. Le
benchmark `benchmarks/topology-morphogenesis/` fournit un point de départ, mais
ses adaptateurs, probes et oracles manquants doivent être complétés avant un verdict
confirmatoire. Les résultats historiques doivent être datés et reliés au commit
testé.

## Deux scénarios limites

- Tous les workers produisent des rapports riches et concordants, mais un oracle
  externe réfute leur conclusion. Le système doit bloquer la promotion, rechercher
  une dépendance commune et réduire sa confiance dans ce signal local.
- Un daemon disparaît et le budget est épuisé pendant une adaptation. La mission
  doit conserver un état cohérent, une dette de preuve explicite et un chemin de
  reprise vérifié ; aucun reçu consultatif ne doit être converti en `committed`.

Voir aussi : ADR 0101 (shadow et CAS), ADR 0288 (barrière de preuve des missions),
ADR 0430 (transition collective fermée), ADR 0522 (dispatch et continuation),
et `docs/01-concepts/epistemologie-et-evidence.md`.

## Portefeuille consultatif de candidats topologiques

Cette tranche consultative est implémentée derrière `compileMissionStrategy`. Elle
joint au plan `NO_CHANGE`, toutes les topologies canoniques et toutes leurs variantes
inscrites au registre. Elle évalue leur admissibilité, leur maturité, les capacités
disponibles, leur budget et leurs compromis de Pareto. Les candidats non exécutables
restent visibles avec leur motif d’exclusion. Le résultat reste consultatif : aucun
candidat n’est activé par le seul compilateur.
Le compilateur produit aussi cinq phases heuristiques pour la topologie déjà choisie.

### Ce que le runtime sait déjà faire

Le catalogue canonique expose huit identifiants de topologie. La génération parcourt
maintenant chaque entrée du registre de variants sans plafond de candidats et le
classement reçoit l’ensemble complet. Le classement peut n’afficher que ses meilleurs
résultats dans le résumé, mais sa décision est calculée sur tous les candidats reçus.
Le coût estimé et les signaux de sélection ne constituent pas des mesures empiriques
de qualité ou de coût total.

### Classement des organisations dynamiques

La topologie structurelle et l'organisation de coordination sont deux axes distincts.
Après le classement des huit topologies, `organizationResolverService` évalue les
dix-neuf organisations canoniques sur une base commune : signaux de mission,
couverture des capacités, affinité avec la topologie retenue, domaine et continuité.
Une organisation explicitement demandée garde la priorité, mais le reçu conserve
quand même le classement complet, ses facteurs et les capacités manquantes.

Le candidat topologique gagnant est ensuite recompilé avec l'organisation retenue.
Le contrat de capacités, les recrutements, le graphe, `selectedOrganization` et la
transition versionnée décrivent ainsi la même morphologie. Le reçu de contrôle sépare
les classements `topology` et `organization`; `candidateOrganizations` expose les
dix-neuf candidats. Ce classement n'accorde aucune autorité : le lease, la quiescence,
le budget et les preuves restent obligatoires avant un commit collectif.

`strategy_arena` et `competitive_arena` possèdent désormais des pas distincts : la
première prépare une sélection Pareto suivie d'une promotion, tandis que la seconde
ordonne les compétiteurs par score d'évidence. Ces règles restent heuristiques tant
qu'une campagne appariée ne les a pas calibrées sur des issues vérifiées.

Le catalogue contient des variants de maturités différentes. Les variants atomiques
sont tous énumérés, mais seules les maturités `implemented`, `stable`, `partial` et
`experimental` sont prises en compte par le générateur ; une maturité inconnue est
conservée comme candidate rejetée. Le portefeuille produit aussi certaines
expressions `NEST` à deux feuilles, avec un plafond explicite de 128 paires examinées.
Il n’explore pas le produit cartésien complet des compositions ni les autres
opérateurs (`PARALLEL`, `SEQUENCE`, `COMPETE`, `GATE`, `WRAP`, `BRIDGE`, `FEDERATE`).
Les validations structurelles et les relations du registre ne prouvent pas qu’une
composition est exécutable. Cette tranche ne démontre pas d’avantage comparatif
empirique et ne lance pas chaque variante comme une expérience distincte.

### Génération exhaustive des variantes atomiques

Chaque candidat est une expression typée, versionnée et canonique, dont les feuilles
sont des couples `{topologie, variant}` et dont les nœuds internes décrivent les
opérateurs, les frontières d’état, les ports, les dépendances, les budgets et les
barrières de preuve. La génération part des capacités requises, du profil de risque,
des leases et workers disponibles, du budget restant, des preuves attendues et du
catalogue de maturité. Elle conserve systématiquement `NO_CHANGE` et une forme
simple de référence. L’imbrication ne doit être ajoutée que si elle résout une
contrainte identifiée (par exemple, travail parallèle contenu dans une délibération
à quorum), avec relation, adaptateur et frontières d’autorité explicitement validés.

La génération conserve toujours `NO_CHANGE` et énumère chaque variante enregistrée,
y compris celles qui échouent aux contrôles de capacité ou de typage : ces dernières
portent un motif de rejet et ne sont pas exécutables. Le classement prend toutes les
variantes atomiques en entrée ; son résumé peut en afficher un sous-ensemble. Les
compositions `NEST` restent bornées à 128 paires afin de maîtriser leur croissance
combinatoire. Cette borne ne s’applique pas aux variantes atomiques. L’exhaustivité
du portefeuille n’autorise pas l’exécution : la maturité, les capacités, la
calibration, les preuves, l’admission et le budget restent des conditions distinctes.

Filtrage avant classement : contrats de capacité satisfaits ou déficits explicitement
finançables, maturité admise dans le chemin concerné, compatibilité des variants,
relations et adaptateurs, arité et profondeur, frontières d’autorité et d’état,
indépendance requise, disponibilité réelle des workers/daemons, fan-out, leases,
budgets agrégés et possibilité de retour arrière. Une relation `UNSPECIFIED`, une
variante conceptuelle ou un adaptateur absent bloque l’admission opérationnelle ; le
candidat peut rester visible comme hypothèse de recherche. Un graphe valide au plan
syntaxique ne franchit pas ces filtres sémantiques.

### Classement explicable, Pareto et abstention

Pour chaque candidat survivant, le reçu de classement expose séparément :

- les contraintes dures satisfaites et rejetées, avec leur source dans le contrat ;
- les objectifs de mission et leur poids explicite (qualité vérifiée, coût complet,
  latence, robustesse, réversibilité, indépendance de preuve) ;
- les estimations, mesures observées, provenance, intervalle d’incertitude et
  contexte de validité ;
- les hypothèses, signaux manquants, pénalités de coordination et raisons de
  dominance ou de non-dominance ;
- les alternatives non exécutées, qui restent inconnues, et la raison de chaque
  exclusion ou abstention. L'admission conserve cette liste dans
  `unexecutedAlternatives` (résultat `unobserved`, qualité comparative `unknown`)
  et l'interdiction de revendication comparative dans `counterfactual`
  (`comparativeClaim: prohibited`) ; le reçu de transition scelle ces deux
  champs dans son identité, donc toute suppression les invalide.

Le classement reste principalement heuristique. Ses cinq dimensions
(`problemFit`, `capabilityFit`, `budgetFit`, `operationalFit`,
`coordinationEfficiency`) et ses coûts estimés ne constituent pas des mesures
comparatives de la qualité, du coût total, de la latence, de la robustesse et
de la capacité de reprise. Il calcule un front de Pareto sur ces estimations :
les compromis de Pareto, une confiance insuffisante ou une faible marge peuvent
conduire à l'abstention. Voir `adaptiveTopologyRanking.js:6` (`WEIGHTS`,
`tradeoffDecision`, `qualityDecision`, `caveat` consultatif,
`executionAuthorized: false`). Une priorité déclarée peut autoriser le
départage scalaire ; sans priorité, plusieurs candidats non dominés entraînent
l'abstention. Le classement s'abstient aussi si la confiance, la calibration
ou le gain estimé sont insuffisants. L'absence d'inventaire de capacités est
une inconnue ; un inventaire fourni, même vide, est appliqué comme contrainte
dure. Les poids et estimations ne sont pas des mesures apprises ou validées
empiriquement.

Les prédictions apprises ne sont utilisables qu’avec provenance et calibration
hors échantillon par famille de problème, topology, variant, opérateur, modèle,
méthode et environnement. Les issues sans reçu de réussite validé par un oracle
indépendant n’actualisent pas la qualité attendue. L’effet d’une recette composite
est mesuré au niveau de l’ensemble réellement exécuté ; les scores des feuilles ne
sont pas additionnés comme s’ils étaient indépendants.

Le sélecteur consultatif accepte désormais des issues appariées portant un reçu
indépendant vérifiable, une famille de tâche et un identifiant de modèle. Il exige
30 exemples d'entraînement et 10 de validation au minimum, avec familles et modèles
tenus à l'écart; les prédictions de gain et de coût doivent battre les références
neutres sur le jeu de validation. La compilation expose les estimations, leurs
incertitudes et les erreurs observées. Le gain prudent doit dépasser le coût marginal
prudent pour retenir une intervention. Sans preuve suffisante, `NO_CHANGE` gagne.

Quand le portefeuille retient une candidate sous la même identité que le classement,
`policy.decision.organizationExperiment` transforme ce choix en hypothèse
appariée : l'organisation courante constitue le contrôle `NO_CHANGE`, la candidate
forme le second bras et une part distincte du budget est proposée au vérificateur.
Le contrat expose le falsificateur, la métrique primaire, le coût total observé et
la règle prudente `borne basse du gain > borne haute du coût marginal`. Les deux
bras doivent rester isolés et le vérificateur doit utiliser un troisième espace.
Cette « mosaïque somatique appariée » limite le rayon d'effet de l'expérience ; le
terme est une analogie d'organisation, pas une propriété biologique démontrée.

Ce raccordement est **consultatif** : il ne réserve pas le budget, ne lance pas les
deux bras, ne produit pas le reçu externe et ne promeut aucune topologie. Une
abstention, une identité candidate divergente ou un budget incapable de financer
les deux bras et le vérificateur produit `NO_CHANGE`. Le runtime doit encore relier
ce plan au producteur d'issues appariées et à la porte d'admission séparée. Voir
[ADR 0646](../adr/0646-essai-apparie-des-organisations.md).

La validité externe reste bloquée tant que chaque domaine déclaré ne fournit pas
au moins deux répliques indépendantes (identifiants de réplication distincts et
espaces de vérification distincts), que tous les candidats ne couvrent pas les
mêmes domaines et que les domaines ne sont pas explicitement enregistrés. Les
comparaisons appariées appliquent une correction de multiplicité conservatrice
(`sqrt(m)` sur l'incertitude pour `m` comparaisons, alpha familial 0,05/m). Un
gagnant observé après cette correction est étiqueté comme supérieur sur le
holdout commun observé uniquement ; la gate conserve `externalValidity:
unproven` et interdit tout claim universel. Une réplication supplémentaire doit
être échantillonnée avec une graine, un espace de vérification et un manifeste
distincts ; une simple répétition du même reçu ne satisfait pas le protocole.
Un registre SQLite (`morphogenesisVerifiedOutcomeStore`, 8192 lignes max, 40
entraînement + 20 validation par candidat) et son raccordement au chemin standard
(`agentRoundService` → `planContinuation`) sont présents dans l'arbre de travail
actuel, mais n'avaient pas encore été validés dans un commit au moment de la
vérification. Ils n'acceptent que des issues *déjà* vérifiées ; ils ne produisent
pas de verdict indépendant à partir des rapports des workers (ADR 0564). La lecture
est stratifiée par candidat et split, plus récents d'abord dans chaque strate :
40 entraînement + 20 validation par candidat, plafond total 8192
(`morphogenesisVerifiedOutcomeStore.js:84`). L'ancienne lecture globale des 120
dernières lignes, qui pouvait évincer un candidat encore pertinent, est écartée
(ADR 0566). Avec 30 observations d'entraînement et 10 de validation minimales pour
qualifier une échelle, la couverture d'un vaste catalogue dépend de ces quotas et
du plafond ; le coût de la requête sur un grand corpus reste à mesurer. Le chemin
de continuation accepte un adaptateur `loadVerifiedOutcomes` ; chaque
ligne est vérifiée par son reçu et son empreinte. Un adaptateur absent, en erreur ou
hors limite produit un jeu vide et donc `NO_CHANGE`. Aucun corpus n'est livré avec
GenOS : `NO_CHANGE` reste le choix correct tant que le quota n'est pas atteint.
Le producteur d'issues appariées couvre désormais quatre échelles
(`COHORT_REPLACEMENT`, `COMMUNICATION_REDUCTION`, `RESOURCE_REALLOCATION`,
`ROSTER_REDUCTION`),
le store persiste toute ligne vérifiée (appariée ou non, dès que son reçu
indépendant est valide), et `describeCorpusDeficit` expose par candidat le
manque exact (`needsTrain`, `needsValidation`, holdouts). L'outil
`backend/bin/genos-morphogenesis-corpus.cjs` rapporte ce déficit depuis SQLite
et importe des lignes JSONL déjà vérifiées ; il n'invente jamais gains ni coûts. Le remplacement de cohorte est candidat; la réduction des communications a
maintenant une action runtime de relève et une échelle candidate au sélecteur. La
réallocation des ressources dispose aussi d'une candidate exacte et d'un effet de
financement appliqué à la relève, lié au reçu scellé qui inclut l'admission, les
workers et leurs budgets. Cette voie reste indisponible en production sans producteur
de reçus indépendants pour les besoins et sans corpus d'issues vérifiées. Le
sélecteur ne l'inclut que si `loadVerifiedCommunicationMetric({missionId})` fournit
un reçu indépendant valide
pour une mesure de redondance propre à la mission, puis si les issues appariées de
ce `candidateId` la calibrent hors famille et hors modèle. Le chemin standard raccorde
maintenant `communicationMetricProducer` aux observations intra-époque checkpointées;
une mesure absente, mal formée ou insuffisante échoue fermée. La mesure exige
une cadence `continuous_sync`, des outils de coordination loués mais non requis,
au moins dix observations et au moins 20 % d'échanges redondants. À la barrière,
la mission suivante passe en cadence `barrier_only` et perd seulement les leases
`genos_organization_state`, `genos_worker_inbox` et `genos_worker_publish`; les
obligations de mission ou d'organisation bloquent l'action. Le reçu de
transition lie le candidat calibré, le reçu métrique, les workers, leurs budgets,
la nouvelle cadence et la lease exacte; toute divergence avant dispatch bloque
l'envoi. La réallocation de ressources suit aussi cette règle d'abstention; son
empreinte candidate, son effet budgétaire et son reçu scellé sont décrits dans les
ADR 0552 et 0554. Voir aussi l'ADR 0555 pour la réduction des communications.

### Porte d’activation

Le portefeuille de recettes demeure consultatif : il comprend les
candidats et exclusions connues, les raisons, les scores décomposés, le front de
Pareto, l’arbitrage ou l’abstention et les inconnues. Il n’enregistre pas encore les
versions de registre, mesures et intervalles calibrés visés dans la conception.
Une porte d'admission distincte valide le plan heuristique concret avant la relève;
elle peut refuser une transition si le graphe, l'inventaire de capacités, le budget,
le lease ou la quiescence ne sont pas démontrés. Pour un graphe composite, chaque
feuille `TOPOLOGY` doit disposer de ses propres affectations financées, attribuées
explicitement (`morphologyTopology` ou `topology`) et couvrant ses exigences :
une affectation sans attribution ne peut pas couvrir plusieurs feuilles à la fois.
Une admission n'est ni une
calibration ni une preuve de gain. Le runtime ne lance pas de daemon et ne modifie
pas les leases pour rendre une recette admissible. Les preuves de restauration et de
persistance de l’ADR 0430 sont satisfaites uniquement par le chemin authentifié et
durable des ADR 0566 et 0569; les autres chemins restent refusés. La qualification comparera
les candidats sur tâches appariées et familles tenues à l’écart avec un oracle
indépendant ; un dispatch ou un reçu de compilation n’est pas une preuve de gain.

La décision et le périmètre implémenté sont consignés dans l’ADR 0536.

## Résolution runtime : observation, pool libre et revalidation atomique

Le roster consultatif utilise le catalogue `workerExecutorRegistry.executorCatalog()`
pour énumérer des couples type/méthode exécutables par le runtime, puis les confronte
aux affectations courantes, aux contrats déjà présents et à l’inventaire de capacités
transmis au compilateur. Cet inventaire comprend `missionCapabilityPlan.availableCapabilities`
ou `autonomyPlan.capabilityInventory.available` et les capacités déclarées par les
kinds workers affectés; il n’inclut pas les seules exigences de mission. Les capacités
dérivées du kind ne certifient pas l’état runtime de l’instance. Le roster peut établir
une shortlist compatible et indiquer qu’un worker de ce type manque, qu’un contrat
entre en conflit ou qu’une capacité requise n’est pas satisfaite. Le plan observe
les IDs de workers affectés avec des `SELECT` sur `agents` et
`garage_queue`. Il rapporte `idle_observed`, `busy`, `unavailable` ou `unknown` avec
la limite d’observation correspondante. Une observation fraîche `busy` ou `unavailable`
retire l’instance affectée des options retenues; `idle_observed` reste informatif
et n’est pas un feu vert d’admission.
Le rôle `resident_daemon` est retenu seulement si
`autonomyPlan.operationalConstraints.daemonAllowed` vaut explicitement `true`; ce
contrôle d’autorisation ne suffit pas : il est complété par l’inventaire daemon.

Le compilateur joint désormais à chaque phase proposée un reçu
`runtime_resource_resolution` : rôles requis, instances libres du pool
(`readFreeWorkerPoolSnapshot` : `agents` `idle` sans claim `garage_queue` actif),
profils daemon (`readDaemonRuntimeSnapshot` : `daemon_runtime_state` joint à
`daemon_territories`, santé, activité, fraîcheur du heartbeat), leases avec
provenance et fraîcheur. Le reçu distingue `READY_FOR_ADMISSION`, `BLOCKED` et
`UNKNOWN`. L’inventaire absent, périmé ou contradictoire mène à `UNKNOWN`,
jamais à une préférence implicite. Un pool explicitement vide ou sans instance
compatible mène à `BLOCKED`. Une ressource suggérée ne devient pas une
affectation : le reçu reste consultatif (`executionAuthorized: false`) et exige
une revalidation atomique avant dispatch.

Au point d’usage, `revalidateAndReserveResources` revérifie et réserve en une
seule transaction : chaque worker `READY` est revendiqué par
`UPDATE agents ... WHERE status = 'idle'` (échec si course perdue ou claim
`garage_queue` apparu entre-temps), chaque daemon `READY` est vérifié
(santé, territoire, heartbeat frais) puis réveillé explicitement
(`DORMANT`/`SURVEYING` → `FOCUSED`); tout échec annule l’ensemble
(tout-ou-rien, sans réservation partielle). La porte d’admission refuse
`daemon_availability_unproven` quand un plan exige `resident_daemon` sans
résolution, refuse `BLOCKED`/`UNKNOWN`, exige la fraîcheur (30 s) et la
couverture des affectations par la résolution, ainsi qu’une réservation
`reserved: true` postérieure à l’observation. Une capacité déclarée ou un
worker `idle_observed` ne garantit donc jamais seul la disponibilité au dispatch.

L’apprentissage sur les résultats vérifiés et la mutation automatique des
affectations ou des daemons restent des étapes distinctes, couvertes par
l’ADR 0538.

## Décision réévaluée à chaque époque

À chaque barrière de quiescence, `morphogenesisEpochDecisionService` compile un
diagnostic depuis les résultats, choisit une représentation de raisonnement parmi
graphe de tâche, hypothèses, causalité, provenance et contraintes, puis expose les
topologies/variants candidats, le roster worker/méthode, les obligations de preuve et
les bornes de budget. Cette politique reste consultative; les recettes non calibrées
ne sont pas activées par le classement seul.

Si les workers ont fourni des évaluations de stratégie explicites, `strategyCritiqueService`
regroupe les rapports qui partagent une source, une lignée ou une référence. Un
consensus corrélé peut provoquer une branche de contestation `COMPETE`; un worker est
affecté à la branche alternative et reçoit une hypothèse et un falsificateur précis.
Son rapport reste diagnostique : seul le vérificateur de mission peut établir la
résolution.

Les besoins `resourceNeeds` sont arbitrés entre groupes par gain marginal pondéré par
confiance. Une candidate `RESOURCE_REALLOCATION` n'est admissible que si chaque
allocation financée porte un reçu indépendant signé lié au digest du besoin et à une
référence de preuve; des références déclarées seules ne suffisent pas. Le plan financé
exact doit avoir des issues vérifiées calibrées, être admis et être lié au même reçu de
transition. Sans cela, `NO_CHANGE` conserve la répartition standard. Les transferts,
recrutements et changements de gouvernance restent des propositions : aucune autorité
de spawn ou de transition n'est déduite du score. Le producteur de reçus indépendants
pour ces besoins n'est pas encore raccordé en production, donc cette voie reste
indisponible sans preuve admissible.

Ces décisions sont appliquées à la relève après quiescence. Le recrutement d'une cohorte
remplaçante est disponible pour les transitions morphogénétiques et utilise des IDs
déterministes pour reprendre une intention interrompue sans créer de doublons. Le
checkpoint et le balayage au démarrage sont bornés; les états ambigus deviennent
`recovery_required`. Trinity conserve son allocation et ses mondes scellés hors de ce
chemin. L’orchestrateur peut remodeler la structure locale de raisonnement au point
sûr d'une génération; le roster, l'identité, les leases et la topologie collective
restent modifiés seulement par une transition admise et restaurable. Voir ADR 0541,
0544, 0546, 0549 et 0570 pour les décisions et limites vérifiables.
