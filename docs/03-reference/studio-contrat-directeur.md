# GenOS Studio — contrat directeur de la cible

- **Statut** : Cible produit fixée ; implémentation et parité non certifiées.
- **Version de cible** : `STUDIO-TARGET-V1`.
- **Dernière revue** : 2026-10-07.
- **Décision** : Étape A demandée par l'opérateur ; [ADR 0360](../adr/0360-studio-cible-unifiee-et-zones-de-livraison.md).
- **Base de rédaction** : `69e9d07e55db1581b514989c448f131d731d7676`, après synchronisation du worktree Studio avec V3.

## 1. Finalité et portée

GenOS Studio est l'atelier pour concevoir, exécuter, comprendre, vérifier,
améliorer, publier et exploiter des systèmes agentiques. Un même produit réunit :

- les capacités usuelles des studios, IDE agentiques, plateformes d'évaluation,
  d'automatisation, d'observabilité et d'exploitation ;
- le modèle GenOS, ses objets, mécanismes, concepts et limites ;
- les exigences propres à un outil fiable, lisible, accessible et cohérent.

L'origine d'un besoin est une étiquette de traçabilité, jamais un menu séparant
« concurrents » et « GenOS ». Une fonctionnalité peut satisfaire les trois axes.
L'utilisateur doit pouvoir commencer sans maîtriser les métaphores biologiques,
puis inspecter les mécanismes réels et leurs preuves sans changer de produit.

La cible comprend les parcours locaux Windows et Linux/Docker, les configurations
mono-opérateur et collaboratives, ainsi que les usages distants autorisés.
macOS, haute disponibilité, fournisseurs, connecteurs et médias ne sont annoncés
comme supportés qu'après qualification explicite de leur configuration.
Une référence documentaire est requise même lorsqu'un concept n'a pas de runtime.
Elle ne crée pas d'obligation de rendre une théorie philosophique ou biologique vraie.

## 2. Autorité des documents et gel de cible

Ce contrat fixe la cible et ses règles d'acceptation. Le
[programme de parité](../06-qualite-preuves/studio-parite-plan.md) conserve ses
identifiants F01–F04, C01–C26 et S01–S10. Ses états « à la base » sont historiques,
pas une nouvelle mesure du checkout courant. Le
[suivi](../06-qualite-preuves/studio-parite-suivi.md) et les rapports de
[qualification](../06-qualite-preuves/studio-qualification.md) décrivent les
livraisons et preuves effectives ; ce contrat ne les remplace pas.
Le [contrat produit GenOS](contrat-produit-et-completude.md) reste la référence
de maturité du runtime. Une page Studio n'en relève pas automatiquement le statut.

Une nouvelle cible majeure reçoit une version distincte. Toute modification de
périmètre consigne motif, source, impacts, zones, critères et décision opérateur.
Les ajouts au catalogue canonique deviennent des écarts à traiter, pas des oublis
silencieux ni des fonctionnalités immédiatement « livrées ». Un changement externe
chez un rival alimente une revue, sans changer automatiquement cette cible gelée.

Non-objectifs : cloner des interfaces ou du code propriétaire ; prétendre à une
supériorité universelle ; exposer des raisonnements internes non observables ;
contourner les contrôles runtime ; fabriquer des métriques ou une conscience
subjective ; rendre déterministes les fournisseurs externes par un bouton replay.
Aucun framework nouveau, moteur d'exécution parallèle ou réécriture générale
n'est décidé par cette étape documentaire.

## 3. Espaces de navigation

Les espaces sont des destinations produit, pas des fichiers ni des moteurs.
Leurs routes finales restent à spécifier ; les liens existants doivent être préservés.

| ID | Espace | Question et contenu principaux |
| --- | --- | --- |
| N01 | Accueil et boîte de réception | Que regarder ou décider ? Activité, assignations, approbations, blocages, alertes, reprises et accès récents. |
| N02 | Construire | Quel système créer ? Agents, organismes, workflows, prompts, recettes, contrats, topologies, organisations et templates. |
| N03 | Workspace | Quels fichiers et artefacts ? Explorateur, édition, Git, worktrees, diffs, snapshots, résultats et revue. |
| N04 | Exécuter | Que se passe-t-il ? Playground, conversations, missions, runs, workers, budgets, outils et contrôle immédiat. |
| N05 | Mondes | Quelles alternatives ? Branches, lignages, forks, comparaisons, snapshots, replay et causalité. |
| N06 | Vérifier et rechercher | Pourquoi accepter ou rejeter ? Hypothèses, preuves, expériences, contre-exemples, datasets, évaluations, arènes et promotions. |
| N07 | Connaissances et mémoire | Que sait-on et d'où ? Sources, RAG, mémoires, retrieval, apprentissage, consolidation, fossilisation et héritage. |
| N08 | Organisme | Comment se constituer et se réguler ? AgentDNA, organes, cognition, perception, créativité, physique, AEIS et nosologie. |
| N09 | Publier et exploiter | Comment rendre disponible et fiable ? Versions, environnements, déploiements, canaux, ressources, incidents et reprise. |
| N10 | Gouverner | Qui peut faire quoi ? Identités, équipes, politiques, leases, secrets, budgets, risques, conformité et audit. |
| N11 | Référentiel | Que signifie ce concept ? Fiches canoniques, écoles, contrats, capacités, outils, maturité et liens vers leurs usages. |

Chaque objet possède une destination canonique. Les autres espaces le référencent
ou en offrent une projection, sans créer une seconde identité ou une copie mutable.
La vue courante, l'inspection avancée et la référence technique sont trois niveaux
de détail. Ils n'accordent aucun droit supplémentaire et ne masquent jamais un
refus, un budget épuisé, une contradiction ou une limite de validité.

## 4. Objets et invariants partagés

| Objets | Distinction obligatoire |
| --- | --- |
| Agent, cellule, worker, organisme | Identité/configuration, spécialisation, unité d'exécution et composition. |
| Workflow, topologie, organisation dynamique | Déroulement, structure de coopération et méthode collective. |
| Mission, tâche, run, job, expérience, évaluation | Objectif, travail, occurrence d'exécution et protocole/mesure ; relations explicites. |
| Connaissance, mémoire, dataset, preuve | Information, expérience conservée, corpus d'essai et justification d'une affirmation. |
| Snapshot d'agent, de workspace, version de configuration | Contenu capturé, portée et possibilités de restauration distincts. |
| Résultat, reçu, décision, promotion | Une sortie ou un transport réussi ne vaut pas validation ni autorisation. |

Les ressources persistées ont des identifiants stables, un scope, une version
lorsque mutable/versionnable, une provenance, des liens typés et un historique
adapté. Le vocabulaire métier s'appuie sur les contrats existants, sans imposer
une migration globale des stores. Une définition, son instance et son concept
de référence restent distingués. Les liens ne contiennent ni secret ni autorité.

Toute action expose autorité, préconditions, limites, confirmation appropriée,
suivi et effet observé. Le serveur demeure responsable des droits et gates.
Annulation, expiration, révocation, conflit de version, double clic, idempotence
et résultat externe incertain ont une sémantique explicite selon l'action.
Undo n'est proposé que si réellement possible ; compenser n'efface pas un effet
externe irréversible. Un refresh ne doit pas réexécuter une mutation.

Trois axes restent séparés : état technique de l'objet ; état épistémique du
résultat ; maturité du mécanisme et portée qualifiée. Les valeurs inconnues,
absentes, non exécutées, simulées et nulles ne sont pas interchangeables.
Les capacités requises, disponibles, autorisées et effectivement exercées sont
également distinctes. Une fiche ou un registre déclaratif n'est pas une exécution.

La chaîne de mission est navigable : mission → différenciation → contrat → lease
→ exécution isolée → observation → action bornée → reçus → preuve → falsification
→ décision → promotion, rejet, récupération ou fossilisation. Elle lie les objets
sans inventer les étapes ni les preuves absentes.

## 5. Zones de responsabilité

Une zone regroupe une responsabilité, pas nécessairement une page ou un commit.
Les frontières ci-dessous sont produit ; leurs modules et API seront spécifiés
dans les points de livraison. Z18 et Z20 s'appliquent dès la première tranche.

| Zone | Responsabilité | Dépendances structurantes |
| --- | --- | --- |
| Z00 | Contrat produit, sources, couverture et changements de cible | aucune |
| Z01 | Design system, navigation, contexte, routes, recherche, états et accessibilité | Z00, Z02, Z18 |
| Z02 | Ressources communes, adaptateurs API, versions, liens et contrats d'action | Z00, Z18 |
| Z03 | Construction d'agents, workflows visuels/texte, prompts, recettes et templates | Z01, Z02, Z05 |
| Z04 | Workspace, fichiers, édition, Git, worktrees, snapshots, diffs et artefacts | Z01, Z02, Z18 |
| Z05 | Providers, modèles, routing, outils/MCP, connecteurs, triggers et canaux | Z02, Z18 |
| Z06 | Playground, conversations, streaming, sessions et entrées multimodales | Z03, Z05, Z07 |
| Z07 | Missions, runs, workers, Garage Fabric, budgets, files et interruptions | Z02, Z05, Z18 |
| Z08 | Mondes, lignages, forks, comparaisons, replay, bisection et Self-Twin causal | Z04, Z07, Z12 |
| Z09 | Traces, événements, alertes, métriques, coûts, physique et ressources hôte | Z02, Z07 |
| Z10 | Sources/RAG, mémoires, retrieval, plasticité, transmission et héritage | Z02, Z05, Z12 |
| Z11 | Datasets, expériences, évaluations, NaturalSearch, arènes et recherche adaptative | Z07, Z09, Z12 |
| Z12 | Claims, hypothèses, reçus, GVX, contradictions, décisions et promotion/invalidation | Z02, Z07, Z18 |
| Z13 | Génomes, organismes procéduraux, ontogenèse, topologies et organisations | Z03, Z07, Z12 |
| Z14 | Cognition, indicateurs fonctionnels, perception, biomimétisme et NCE | Z09, Z10, Z11, Z13 |
| Z15 | AEIS, nosologie, diagnostics, quarantaine, autopsie, réparation et continuité | Z07, Z09, Z12, Z13 |
| Z16 | Inbox, assignations, commentaires, revues, approbations et partage | Z01, Z02, Z12, Z18 |
| Z17 | Releases, environnements, déploiements, Sentinel, sauvegardes et exploitation | Z05, Z07, Z09, Z15, Z18 |
| Z18 | Identités, tenants, politiques/Cedar, leases, secrets, audit et gouvernance | Z00 ; contrats partagés avec Z02 |
| Z19 | Concepts, écoles, outils, capacités, contrats, maturité et documentation | Z00, Z01, Z02 ; liens vers les zones métier |
| Z20 | Qualification, accessibilité, captures, performances et benchmarks comparatifs | toutes les zones livrées |

Une dépendance indique un contrat partagé, pas l'obligation de terminer toute
une zone en amont. Les adaptations existantes sont réutilisées quand adéquates.
Les contrats sont définis avant leurs consommateurs et qualifiés par tranche.

## 6. Couverture des trois sources

### 6.1 Capacités communes et différenciation déjà enregistrées

Les critères détaillés restent ceux du programme de parité. Ce rattachement
n'en certifie pas l'exécution et ne réduit aucun engagement antérieur.

| Exigences conservées | Zones propriétaires principales |
| --- | --- |
| F01, F02, F03, F04 | Z00 ; Z00 ; Z02/Z18 ; Z20 |
| C01, C02, C03, C04 | Z01 pour chaque capacité |
| C05, C06, C08 | Z03 : catalogue, workflows, prompts |
| C07 | Z06 : playground |
| C09, C10, C11 | Z05 : modèles, outils, déclencheurs |
| C12 | Z10 : connaissances/RAG |
| C13, C14 | Z09 : traces et dashboards |
| C15, C16, C17 | Z11 : datasets/évaluations ; Z18/Z20 : sécurité adversariale |
| C18, C19 | Z07/Z15 : durabilité ; Z07 : ressources |
| C20, C22 | Z16 : humain et collaboration |
| C21 | Z04 : workspace |
| C23 | Z05/Z06/Z17 : canaux et médias |
| C24 | Z18 : gouvernance |
| C25, C26 | Z17 : publication et exploitation |
| S01, S02, S03 | Z08 : mondes, contrefactuels, rejeu |
| S04, S05 | Z12 : preuve, promotion/invalidation |
| S06 | Z10 : mémoire de branches |
| S07, S10 | Z11 : trials et arène durable |
| S08 | Z07 : budgets inter-branches |
| S09 | Z13 : topologies/morphogenèse |

Le futur registre concurrentiel doit rattacher chaque rival retenu à ses capacités,
sources officielles datées, versions, éditions/licences et scénarios comparables.
Une offre arrêtée reste historique. Les capacités non applicables ou non retenues
exigent une justification opérateur ; aucune exclusion implicite par manque d'API.
Les offres spécialisées ne justifient pas des copies séparées de fonctions communes.

### 6.2 Domaines GenOS obligatoires

Chaque domaine doit être décliné entrée par entrée dans le registre d'exigences.
La table fixe les propriétaires ; elle n'est pas ce registre exhaustif déjà rempli.
Les sources sont les [concepts](../01-concepts/README.md),
l'[orchestration](../02-orchestration/README.md), les
[capacités topologiques](../02-orchestration/topologies-et-capacites.md) et le
[registre philosophique](registre-philosophique.md), liés au code canonique.

| Domaine | Zone(s) et couverture minimale à détailler |
| --- | --- |
| G01 — Principes fondateurs | Z02/Z07/Z08/Z12/Z18 : reproductibilité, autorité, budgets, isolation, preuves et décisions. |
| G02 — Biologie computationnelle | Z13/Z14/Z15 : cellules, développement, HOX, organes, métabolisme, survie, reproduction et écosystèmes. |
| G03 — AgentDNA et génome | Z13 : AgentGenome distinct, 11 sections, expression, mutations, signatures, greffes/leurres, migrations, compatibilité et scellement. |
| G04 — Épistémologie | Z12/Z11 : savoir/croyance, justification, Gettier, hypothèses, réplication, falsification, Brier, consensus et gates. |
| G05 — Cognition et mental | Z14/Z19 : soi, attention, simulation, métacognition, indicateurs et concepts philosophiques avec limites explicites. |
| G06 — Mémoire/apprentissage | Z10/Z08 : huit familles de mémoire, STDP, plasticités, enseignement, cambium, infini sous contrat et Self-Twin causal. |
| G07 — Coordination/collectif | Z07/Z09/Z13 : SignalPlane, ACK, coalescing, communication, parenté, relations, G-CIR, obligations, AGOW et SHEV. |
| G08 — Créativité/recherche | Z11/Z14 : NCE, NaturalSearch, Active Query, simulation prospective, méristème, spirale, chronotaxie et contre-exemples. |
| G09 — Physique | Z09 : inertie/friction/entropie, matériaux, pression, énergie, dégradation, blast radius et régulation hôte. |
| G10 — Orchestration/exécution | Z03/Z04/Z07/Z08/Z11/Z17 : contrats, portfolios, survivants, retries/jitter/dead-letter, WAL, AgentGit, benchmarks et chargeback. |
| G11 — Huit topologies | Z13 : Trinity, A-Team, Biocénose, Holobionte, Syncytium, Biome, Rhizome, Métapopulation ; Garage Fabric transversal en Z07. |
| G12 — Organisations dynamiques | Z13/Z19 : chacune des 19 entrées du catalogue, configuration, instances et résultats. |
| G13 — Capacités topologiques | Z02/Z13/Z19 : chacune des 37 capacités ; exigences, disponibilité, autorité, exercice et preuve séparés. |
| G14 — Types de workers | Z07/Z13/Z19 : chacun des 19 types, familles, modes cognitifs, rôles épistémiques et contraintes. |
| G15 — Cycle du worker | Z07/Z09/Z12 : chacune des étapes et décisions, de l'incarnation à la terminaison. |
| G16 — Biomimétisme spécialisé | Z05/Z14 : Charnov, fovéation, GAIA, cinq sens, cellules spécialisées, contrôle animal et boucle incarnée. |
| G17 — AEIS | Z15/Z12 : antigènes, anticorps, sélection/affinité, inflammation, tolérance/Treg, oracles, reçus et calibration FP/FN. |
| G18 — Nosologie | Z15 : neuf familles, marqueurs, diagnostics, pharmacopée, effets iatrogènes/nosocomiaux, quarantaine et autopsie. |
| G19 — Philosophie/mondes possibles | Z19/Z08/Z12 : tous les concepts/écoles/contrats canoniques, relations, temps A/B, identité, altérité, audits et non-promotion. |
| G20 — Surfaces techniques | Z02/Z05/Z09/Z17/Z19 : REST, gRPC, MCP/stdio, CLI/g, IDE, TUI, MsgPack, sessions, SQLite/WAL et observabilité. |
| G21 — Autorité/gouvernance | Z18/Z16 : tenants, rôles, scopes, leases, approbations, secrets, SSO/OIDC/SAML, Cedar et conservation des preuves. |
| G22 — Exploitation/résilience | Z07/Z15/Z17 : Sentinel, heartbeat, crash, corruption, WAL, checkpoint cryptographique, idempotence, rétention, déploiements et HA. |

Les nombres ci-dessus sont les cardinalités des référentiels documentés à la
rédaction, pas des compteurs de fonctionnalités terminées. Le registre détaillé
doit les réconcilier avec la version de ses sources. MathematicalOrganism et GVX
sont rattachés à Z11/Z12 ; les cinq capacités transversales gardent leurs fiches
propres. Aucun terme ne peut être couvert uniquement par le mot « Atlas ».

### 6.3 Exigences indépendantes du métier

| ID | Obligation Studio | Zone responsable |
| --- | --- | --- |
| U01 | Contexte constant, destinations canoniques, historique, liens profonds et recherche respectant les droits. | Z01/Z02/Z18 |
| U02 | Création guidée, onboarding sans effet caché, états vides utiles et aide contextuelle. | Z01 et zone métier |
| U03 | Design system cohérent, densité adaptée, responsive, thèmes et localisation sans modifier la sémantique. | Z01/Z20 |
| U04 | Clavier, focus, labels, zoom, contrastes et audit d'accessibilité sur les parcours. | Z01/Z20 |
| U05 | Brouillons, sauvegarde, conflits, changements de scope et restauration sans perte silencieuse. | Z02/Z03/Z04 |
| U06 | Chargement, fraîcheur, déconnexion, reconnexion, refus, erreurs et effets incertains explicités. | Z01/Z02/Z09 |
| U07 | Action sûre : permissions serveur, préconditions, confirmation, idempotence et annulation définies. | Z02/Z18 et zone métier |
| U08 | Objets, versions, provenance, statuts et vocabulaire cohérents entre toutes les projections. | Z02/Z19 |
| U09 | Budgets de performance, pagination, volumes de référence et mesure sur matériel/profil déclarés. | Z01/Z09/Z20 |
| U10 | Réversibilité réelle, export/import documentés, compatibilité et migration sans promesse d'undo universel. | Z02/Z04/Z17 |
| U11 | Attribution, collaboration, confidentialité, rétention et partage révocable. | Z16/Z18 |
| U12 | Documentation, diagnostics, tests, captures et preuves reproductibles liés à la version livrée. | Z19/Z20 |

Les seuils de performance et profils de charge sont fixés avant l'implémentation
des points concernés, dans leur contrat d'acceptation ; aucune valeur mesurée
n'est inventée ici. Ils ne doivent pas être ajustés après mesure pour masquer
une régression. Un budget de livraison non fixé reste un prérequis ouvert.

## 7. Parcours de livraison

| ID | Tranche utilisable | Zones dominantes et sortie attendue |
| --- | --- | --- |
| P01 | Fondations et couverture | Z00/Z01/Z02/Z18/Z19/Z20 : vocabulaire, registre détaillé, contrats, navigation et harnais. |
| P02 | Créer → tester → inspecter | Z03/Z05/Z06/Z07/Z09 : définition versionnée, exécution réelle, sorties et traces reliées. |
| P03 | Mission → workspace → résultat → revue | Z04/Z07/Z12/Z16 : travail confiné, budgets, tests, diff et décision humaine. |
| P04 | Fork → comparer → vérifier → décider | Z08/Z11/Z12 : alternatives isolées, provenance, preuves, contre-exemples et gate sans bypass. |
| P05 | Connaître → apprendre → transmettre | Z10/Z12 : sources, mémoire, droits, consolidation et héritage vérifiables. |
| P06 | Composer → observer → améliorer un organisme | Z13/Z14/Z09/Z11/Z12 : transformation traçable et effets bornés comparés. |
| P07 | Détecter → diagnostiquer → récupérer | Z15/Z07/Z09/Z12 : incident, intervention autorisée et effet observé. |
| P08 | Publier → exploiter → améliorer | Z17/Z16/Z18/Z20 : version servie observée, collaboration et reprise qualifiée. |

L'ordre est une progression de parcours, pas l'interdiction de développer en
parallèle des zones aux contrats stabilisés. Chaque parcours réutilise le socle
et le référentiel. La boîte de réception existe dès les premiers besoins humains.

## 8. Registre d'exigences et définition de terminé

Chaque entrée atomique du prochain registre doit contenir :

- identifiant stable, titre, origine(s) concurrent/GenOS/Studio et sources datées ;
- objet concerné, parcours, destination canonique/page/onglet et zone propriétaire ;
- dépendances, contrats API/runtime, autorité, budget et plateformes visées ;
- critères observables nominal/refus/erreur/conflit/reprise applicables ;
- état de livraison, maturité distincte, preuve attendue et preuves exécutées ;
- références des tests, mesures, captures, limites, décision et commit de livraison.

Chaîne de traçabilité : exigence → objet → parcours → page/onglet → zone → contrat
→ test → preuve → commit. L'identifiant d'une source canonique doit être conservé,
notamment pour chaque concept, organisation, type de worker et capacité.

La cible est atteinte sur une version et une portée définies lorsque :

1. aucune entrée retenue n'est orpheline ; toute exclusion est explicitement décidée ;
2. les capacités opérationnelles sont qualifiées de bout en bout, pas seulement affichées ;
3. les concepts sans mécanisme restent consultables avec limites, sans action fictive ;
4. les huit parcours et leurs refus/reprises applicables ont leurs preuves exécutées ;
5. versions, droits et provenance restent cohérents à travers les vues ;
6. qualité visuelle/accessibilité/performance et opérations ont leurs critères satisfaits ;
7. la parité est mesurée par capacité/scénario et non déduite d'une ressemblance ;
8. les gates dépôt passent, ou leurs échecs et la portée bloquée sont explicités.

Pas de pourcentage global mélangeant fiche documentaire, écran et runtime validé.
Les couvertures documentaire, fonctionnelle, ergonomique, opérationnelle et
comparative sont suivies séparément. Un concept philosophique interprétatif peut
avoir une fiche complète sans être une théorie implémentée ou validée.

## 9. Sortie de l'étape A et étape suivante

L'étape A fixe et versionne la finalité, les espaces, objets/invariants, zones,
domaines obligatoires, exigences transversales, parcours et critères de fin.
Elle ajoute l'ADR et les liens depuis les documents existants, dans un commit
documentaire atomique. Elle ne livre aucun nouvel écran ou mécanisme.

La prochaine étape est le registre détaillé : réconciliation entrée par entrée
des sources canoniques et des rivaux, état réel à une révision donnée, destinations,
contrats, budgets de qualification et points atomiques ordonnés par dépendance.
Cette réconciliation n'est pas déclarée réalisée par les tables de domaines ici.
Les livraisons suivantes conservent un commit par point avec tests et preuves.
