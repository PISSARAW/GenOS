# Morphogenèse adaptative : stratégie cible

## Statut et frontière actuelle

Ce document décrit une architecture cible, pas une capacité de production déjà qualifiée.
Le dispatch principal sait préparer une topologie et lier un graphe aux affectations
des workers (ADR 0522). Une continuation peut replanifier une fois à une frontière
quiescente. Le runtime Morphogenèse V2 refuse encore le `commit` d'une transition
collective : ni un graphe préparé ni un reçu consultatif ne prouvent que l'état des
processus, des workspaces, des baux et des budgets peut être restauré (ADR 0430).

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

## Intention

Faire de la morphogenèse un contrôleur de décisions sous contraintes, capable de
changer de forme selon le problème et les preuves observées, tout en sachant garder
la forme courante ou s'abstenir. L'optimisation porte sur la qualité vérifiée du
livrable, le coût total, la latence, la robustesse et la possibilité de reprise.
Un score de rapport worker est un signal de diagnostic ; il ne remplace jamais un
oracle indépendant ni la barrière de preuve de mission.

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
joint au plan un portefeuille borné comprenant `NO_CHANGE`, les topologies canoniques,
leurs variants connus et certaines expressions imbriquées `NEST`. Elle évalue leur
admissibilité, leur maturité, les capacités disponibles, leur budget et leurs
compromis de Pareto. Le résultat reste consultatif : aucun candidat n’est activé.
Le compilateur produit aussi cinq phases heuristiques pour la topologie déjà choisie.

### Ce que le runtime sait déjà faire

Le catalogue canonique expose huit identifiants de topologie. Le planificateur peut
compiler des candidats par topologie dans certains modes de sélection, mais son
résumé ne contient que les capacités manquantes, le nombre de spawns et un coût
estimé. Ce coût et les signaux de la fonction de sélection ne constituent pas des
mesures empiriques de qualité ou de coût total. Le profil de variantes est résolu
pour chaque topologie compilée, mais la sélection actuelle n’explore pas le produit
cartésien des variants de tous les candidats et ne produit pas un front de Pareto.

Le catalogue contient des variants de maturités différentes. Le portefeuille actuel
ne produit que des expressions `NEST` à deux feuilles ; il n’explore ni le produit
cartésien des variants ni les autres opérateurs (`PARALLEL`, `SEQUENCE`, `COMPETE`,
`GATE`, `WRAP`, `BRIDGE`, `FEDERATE`). Les validations structurelles et les relations
du registre ne prouvent pas qu’une composition est exécutable. Cette tranche ne
démontre pas d’avantage comparatif empirique.

### Génération bornée proposée

Chaque candidat est une expression typée, versionnée et canonique, dont les feuilles
sont des couples `{topologie, variant}` et dont les nœuds internes décrivent les
opérateurs, les frontières d’état, les ports, les dépendances, les budgets et les
barrières de preuve. La génération part des capacités requises, du profil de risque,
des leases et workers disponibles, du budget restant, des preuves attendues et du
catalogue de maturité. Elle conserve systématiquement `NO_CHANGE` et une forme
simple de référence. L’imbrication ne doit être ajoutée que si elle résout une
contrainte identifiée (par exemple, travail parallèle contenu dans une délibération
à quorum), avec relation, adaptateur et frontières d’autorité explicitement validés.

La génération applique un plafond par défaut de 10 candidats, configurable jusqu’à
32, et borne à 128 le nombre de paires testées pour l’imbrication. Elle garde au plus
quatre recettes exclues faute de capacités pour rendre le déficit visible. Ces bornes
maîtrisent le coût de recherche ; elles ne garantissent pas la qualité et ne sont pas
encore calibrées par benchmark.

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
  exclusion ou abstention.

Le classement actuel expose cinq dimensions heuristiques et calcule le front de
Pareto. Une priorité déclarée peut autoriser le départage scalaire ; sans priorité,
plusieurs candidats non dominés entraînent l’abstention. Le classement s’abstient
aussi si la confiance, la calibration ou le gain estimé sont insuffisants. L’absence
d’inventaire de capacités est une inconnue ; un inventaire fourni, même vide, est
appliqué comme contrainte dure. Les poids et estimations ne sont pas des mesures
apprises ou validées empiriquement.

Les prédictions apprises ne sont utilisables qu’avec provenance et calibration
hors échantillon par famille de problème, topology, variant, opérateur, modèle,
méthode et environnement. Les issues sans reçu de réussite validé par un oracle
indépendant n’actualisent pas la qualité attendue. L’effet d’une recette composite
est mesuré au niveau de l’ensemble réellement exécuté ; les scores des feuilles ne
sont pas additionnés comme s’ils étaient indépendants.

### Porte d’activation

Le résultat de cette tranche demeure consultatif : le portefeuille comprend les
candidats et exclusions connues, les raisons, les scores décomposés, le front de
Pareto, l’arbitrage ou l’abstention et les inconnues. Il n’enregistre pas encore les
versions de registre, mesures et intervalles calibrés visés dans la conception.
L’intégration ne lance pas de daemon, ne change pas de lease, n’attribue pas de
variant à un worker et ne commite pas de transition. Une tranche distincte devra lier la recette
sélectionnée aux affectations et ressources réellement disponibles, vérifier de
nouveau tous les budgets et contrats, obtenir l’autorité et produire les preuves de
restauration et de persistance exigées par l’ADR 0430. La qualification comparera
les candidats sur tâches appariées et familles tenues à l’écart avec un oracle
indépendant ; un dispatch ou un reçu de compilation n’est pas une preuve de gain.

La décision et le périmètre implémenté sont consignés dans l’ADR 0536.

## Résolution runtime partielle : observer les affectations existantes

Le roster consultatif utilise le catalogue `workerExecutorRegistry.executorCatalog()`
pour énumérer des couples type/méthode exécutables par le runtime, puis les confronte
aux affectations courantes, aux contrats déjà présents et à l’inventaire de capacités
transmis au compilateur. Cet inventaire comprend `missionCapabilityPlan.availableCapabilities`
ou `autonomyPlan.capabilityInventory.available` et les capacités déclarées par les
kinds workers affectés; il n’inclut pas les seules exigences de mission. Les capacités
dérivées du kind ne certifient pas l’état runtime de l’instance. Le roster peut établir
une shortlist compatible et indiquer qu’un worker de ce type manque, qu’un contrat
entre en conflit ou qu’une capacité requise n’est pas satisfaite. Le plan observe
maintenant les IDs de workers affectés avec des `SELECT` sur `agents` et
`garage_queue`. Il rapporte `idle_observed`, `busy`, `unavailable` ou `unknown` avec
la limite d’observation correspondante. Il ne recherche pas de nouveaux workers dans
un pool global et ne prouve ni la vie du processus ni l’admission d’une instance.
Une observation fraîche `busy` ou `unavailable` retire l’instance affectée des options
retenues; `idle_observed` reste informatif et n’est pas un feu vert d’admission.
Le rôle `resident_daemon` est retenu seulement si
`autonomyPlan.operationalConstraints.daemonAllowed` vaut explicitement `true`; ce
contrôle d’autorisation ne découvre ni ne réveille un daemon.

La prochaine tranche complète cette observation avec un reçu de résolution par
recette : rôles requis, instances libres dans le pool, profils de daemon pertinents,
charge, limites, leases avec provenance et fraîcheur, et revalidation atomique.
Elle doit distinguer `READY_FOR_ADMISSION`, `BLOCKED` et `UNKNOWN`. L’inventaire absent,
périmé ou contradictoire mène à `UNKNOWN`, jamais à une préférence implicite. Une
ressource suggérée ne devient pas une affectation : réservation, activation et
transition restent soumises à une autorité explicite et à une revalidation atomique
des leases, budgets, capacités et états runtime.

L’observation read-only des affectations est implémentée. Le protocole complet et les
portes d’admission restent proposés dans l’ADR 0538; ils ne sont pas une preuve que
cette résolution complète existe déjà. L’apprentissage sur les
résultats vérifiés et la mutation automatique des affectations ou des daemons restent
des étapes distinctes.
