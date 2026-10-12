# Plan d'implémentation des variants des huit topologies

- **Statut** : Implémentation en cours; couverture initiale branchée sur les huit topologies
- **Dernière revue** : 2026-10-11 (parcours public et frontières de snapshot)
- **Décision d'architecture** : [ADR 0124](../../adr/0124-selection-automatique-des-variants.md)

## Objectif

Pour toute mission lancée dans une topologie, choisir automatiquement un variant adapté,
appliquer son mode d'utilisation, permettre une sélection explicite validée et expliquer le
choix. Les variants ont la même valeur : ce sont des modes d'utilisation distincts de leur
topologie, pas des options classées par maturité. « Adapté » désigne le variant dont les
signaux correspondent à la mission sous les contraintes de compatibilité; le système ne
prétend pas à une optimalité parfaite sans comparaison mesurée. Le niveau d'exécution décrit
la couverture et les limites du parcours, indépendamment du choix du variant.

## Inventaire documentaire

Les noms ci-dessous viennent des fiches de topologie. Leur présence dans cette liste ne
signifie pas qu'ils soient implémentés. Les états exacts doivent rester attachés à chaque
variant dans le registre.

| Topologie | Variants décrits |
| --- | --- |
| Trinity | Controlled, Heterogeneous, Adversarial, Counterfactual, Factorial, Pareto, Jury, Recursive, Adaptive, Temporal, Oracular, Exploratory |
| A-Team | Expert Committee, Pipeline, Project DAG, Cross-Functional Pod, Boundary-Spanner, Matrix Team, Tiger Team, Incident Command, Multiteam System, Adaptive A-Team, Relay Team |
| Biome | Resource, Exploration, Quality-Diversity, Successional, Resilience, Persistent, Open-Ended, Adversarial, Knowledge, Compute, Multi-scale |
| Biocénose | Epistemic Jury, Delphi Community, Adversarial Assembly, Forecasting Crowd, Argumentation Community, Polycentric Council, Byzantine-Resilient Community, Minority-Preserving Jury, Representative Community, Persistent Community, Human–AI Deliberation, Hybrid Oracle Community |
| Holobionte | Organelle, Adaptive Microbiome, Immune-Critical, Local-First, Cloud-Core/Edge-Symbionts, Edge-Core/Cloud-Symbionts, Memory-Rich, Competitive Partner, Regenerative, Procedural, Tool, Cloud-Core/Edge-Sync |
| Syncytium | Hard, Soft, Document, Code, Blackboard, Graph, Epistemic, Transactional, Local-First, Speculative, Hierarchical, Real-Time Control, Human–AI |
| Rhizome | Persistent, Ephemeral, Exploratory, Routing, Growth, Resilient, Sparse, Small-World, Private, Cross-Representation, Procedural, Self-Healing |
| Métapopulation | Classic Patch, Island Search, Heterogeneous Islands, Source-Sink, Rescue Network, Stepping-Stone, Anti-Synchrony, Federated, Ephemeral Patch, Persistent, Evolutionary, Cultural |

## État après la première vague d'intégration

| Topologie | Choix automatique et explicite | Effet runtime branché | Limites restantes |
| --- | --- | --- | --- |
| A-Team | Sélecteur, politiques et évaluateurs isolés ; clôture canonique commune | Progression indépendante, preuves, critères globaux et accusés versionnés | Évaluateurs non tous invoqués au dispatch ; adaptateur multiteam absent du parcours générique ([référence](../../03-reference/runtime-a-team.md)). |
| Biocénose | Recommandation par signaux de mission; explicite validé | Constitution et protocoles distincts; argumentation, fédération polycentrique, quarantaine, panel pondéré et historique persistant ont des effets runtime | Cinq parcours restent `PARTIAL`; voir la fiche pour leurs limites propres |
| Holobionte | Douze identifiants et sélection par mission; préconditions vérifiées | Politique jointe à la composition host/symbiotes | Les modules mémoire, succession, outils et réseau n'appliquent pas tous encore leur politique à leurs opérations |
| Syncytium | Auto-sélection et choix explicite | Schéma, session, cohérence, réplication et réparation | Human–AI reste conditionné aux capacités d'interface |
| Rhizome | Douze choix disponibles et sélection par signaux | Routage, croissance, pruning et portée persistante | Les transitions de politique en cours de session restent à mesurer |
| Métapopulation | Douze variants et quatre alias historiques ; sélection persistée | PLAN sans effet ; recolonisation à preuve locale, migration avec les quatre décisions receveur, rescue reprenable, profils et résultats d’îlot durables, réserves de fondateurs, résidents sous bail, mémoire versionnée et reçus de politique vérifiés | Évaluateur de colonie, fitness locale, solveur, moteur Rust et adaptateurs receveurs explicites ; QD/spéciation et phylogénie sont des mécanismes bornés, sans qualification scientifique globale ni restauration cryptobiotique externe automatique |
| Biome | Onze variants; explicite validé et sélection par mission | `advance_variant` persistant; allocation vectorielle/enchères, foraging-curiosité et archive, QD/CVT, succession à preuves, extinction/refuge/recolonisation, saisons inter-missions, génération POET bornée, coévolution adversariale abstraite, écologie des sources, scheduler compute, feedback multi-échelle | Le scheduler ne migre/exécute pas les fournisseurs; POET, attaques et fitness demandent des preuves externes; pas encore de daemon autonome ni benchmarks par variant |
| Trinity | Douze presets auto-sélectionnés par signal ou sélectionnés explicitement; le preset retenu est conservé au dispatch, avec retour contrôlé à `controlled` si ses préconditions manquent | Les douze runners sont reliés au chemin mission/superviseur; revues, continuations, expériences enfants, grille factorielle et réplicas QD ont des barrières de fin dédiées | Campagne R3 pré-correctifs du 2026-10-03 : 12 missions `ESCALATE`, 0 merge, avec sorties montrant plusieurs runners non invoqués. Les branchements correctifs n'ont pas encore été qualifiés par une nouvelle campagne; voir `topologies/trinity.md` et ADR 0292 |

Ces branchements rendent le choix traçable et opérant au dispatch. Le statut de Trinity reste
`partial` : la campagne R3 pré-correctifs a révélé les défauts de câblage et tous ses rapports
ont escaladé ; aucun run post-correctifs n'a encore qualifié les nouveaux chemins. La maturité centrale reste `partial` lorsque le parcours ne couvre pas
encore toutes les garanties ou tous les mécanismes visés. Elle informe sur la couverture; elle
ne constitue ni un score de valeur ni un facteur de classement des variants. La suite doit
qualifier Trinity avec des missions réussies et compléter les adaptateurs restants des autres
topologies avant de promouvoir leur maturité.

### Qualification technique — 2026-10-04

- Le catalogue central résout explicitement les 95 variants canoniques des huit topologies;
  `test_morphogenesis_variant_catalog.js` vérifie leur sélection et la projection de leur identité.
- Le balayage backend élargi passe sur 230 fichiers de tests liés aux topologies, variants
  et à Morphogenèse. La suite backend générale passe également (55/55). La matrice
  `test_topology_mission_variant_routing.js` exécute les 48 prompts complets de la fixture
  `backend/tests/fixtures/topology-missions-48.json` et vérifie leurs sélections attendues;
  le test de dispatch couvre aussi les workers, le schéma Syncytium et le contrat Trinity
  adversarial. Un test complémentaire vérifie la sortie de sécurité du watchdog et le planning
  non faisable du variant Syncytium `realtimeControl`.
- Ces tests prouvent des contrats codés et la sélection attendue, pas la réussite des missions
  par les modèles ni l'effet runtime spécifique des 95 variants. Les 48 missions réelles et
  la vérification d'un effet runtime propre par variant restent à rejouer; la parité de
  maturité n'est donc pas encore démontrée.
- Le compositeur A-Team reçoit désormais la capacité libre du garage au dispatch biologique;
  une mission nécessitant cinq domaines passe avec cinq slots disponibles et échoue de façon
  explicite avec quatre. Cette correction ferme un défaut de capacité, sans qualifier à elle
  seule les autres variants A-Team.
- Trinity transmet au superviseur le délai de mission, borné entre 180 et 600 secondes; un
  délai long explicitement demandé ne fait donc plus expirer la comparaison à 180 secondes.
  Le test `test_trinity_supervisor_timeout.js` couvre la valeur par défaut, le délai demandé,
  sa borne maximale et les tailles de chambre standard/factorielle.

### Vérification des frontières — 2026-10-11

Le dispatch public transmet maintenant une topologie et un variant explicites validés,
projette le profil local dans le graphe morphologique et conserve ce choix dans le
reçu. Une proposition ou une réponse de transport ne constitue pas un commit : le
commit versionné exige un `committer` et une preuve de transition. Le chemin
post-mission reste une proposition tant que le pont de production avec le noyau Rust,
la gouvernance et la transition CAS n'est pas disponible.

Les corrections de cette vague portent sur des frontières observables : composition
et taille du garage A-Team ; cycle public explicite Biocénose ; quiescence Biome et
Métapopulation ; arrêt prouvé Holobionte ; identité de mission Rhizome ; matérialisation
et clôture Syncytium ; preset, Oracle et récursion Trinity. Les ADR 0399 à 0407
décrivent les contrats et leurs limites. Les tests ciblés vérifient ces frontières ;
ils ne démontrent pas encore la réussite de missions représentatives pour chacun des
95 variants canoniques.

Une relance A-Team refuse désormais une politique d'autorité différente sous la même
clé idempotente. Le programme `multiteam` conserve son graphe et ses membres, mais le
dispatch générique ne lance toujours pas automatiquement les sous-runs.

### Deuxième vague — 2026-10-11

- Le parcours post-mission appelle le planner et la gouvernance Rust par une
  commande de lecture seule. Faute de proposition persistée, il soumet un
  ensemble vide : `NO_CHANGE`, `REJECTED` ou `UNAVAILABLE` restent des
  diagnostics sans autorité de commit ([ADR 0412](../../adr/0412-pont-rust-morphogenese-lecture-seule.md)).
- A-Team refuse l'exécution générique de `multiteam` et les faux reçus de
  sous-runs. Une sélection automatique peut se rabattre sur `project_dag`
  sous ses propres préconditions, avec la raison du repli ; une sélection
  explicite `multiteam` reste refusée ([ADR 0408](../../adr/0408-frontiere-preuve-multiteam-a-team.md)).
- Biocénose reprend une communauté existante par le dispatch biologique,
  avec identité de continuation et précondition de révision. Le jeton de
  reprise passe par `stdin` du CLI. Le transport ne
  recrée pas la communauté pour satisfaire une demande de reprise
  ([ADR 0410](../../adr/0410-reprise-publique-liee-a-la-communaute-biocenose.md)).
- Syncytium lie l'appelant identifié à la session : worker membre ou
  orchestrateur parent ayant un worker dans le même workspace. Un parent
  étranger ne peut pas matérialiser la session ([ADR 0411](../../adr/0411-appelant-lie-session-syncytium.md)).

Restent à construire avant une activation complète : l'autorité Rust
authentifiée, la liaison proposition–snapshot–décision au CAS, un exécuteur
`multiteam` qui charge et vérifie les sous-runs, ainsi que la qualification
de missions représentatives pour les 95 variants canoniques.

### Troisième vague — 2026-10-11

- Morphogenèse persiste le graphe préparé. Un verdict `unverified` déclenche
  une proposition du resolver Rust, persistée avec son empreinte et relue avec
  le snapshot avant adjudication. La décision demeure consultative : le graphe
  n'est pas un snapshot restaurable, et l'autorité authentifiée ainsi que le
  CAS de transition manquent toujours ([ADR 0416](../../adr/0416-propositions-rust-liees-snapshot-morphologie.md)).
- A-Team prépare des TeamRuns enfants durables et idempotents, liés au programme,
  au parent, à l'orchestrateur, aux membres et au budget. Le lancement et la
  clôture vérifiée des sous-runs restent à brancher ; `SUCCEEDED` demeure refusé
  ([ADR 0413](../../adr/0413-preparation-durable-sous-runs-a-team.md)).
- Biocénose refuse les reçus Hybrid Oracle dont les identifiants de claim,
  vérificateur ou communauté ne correspondent pas. L'authenticité de l'oracle
  reste à établir par l'intégration de confiance
  ([ADR 0417](../../adr/0417-liaison-recus-hybrid-oracle-biocenose.md)).
- Syncytium Human–AI lie une approbation au contenu revu et à l'agent autorisé.
  Son reçu atteste l'enregistrement, pas un effet externe ; une preuve d'exécution
  distincte reste nécessaire ([ADR 0414](../../adr/0414-approbation-liee-a-laction-human-ai-syncytium.md)).
- Trinity refuse une continuation adaptive ou QD sans rapport final et preuves
  requises. Une campagne en lecture seule qualifie les traces des douze variants,
  mais aucune nouvelle mission nominale n'a été exécutée dans cette vague : les
  douze restent non qualifiés ([ADR 0415](../../adr/0415-qualification-nominale-trinity-sur-traces-durables.md)).

### Quatrième vague — 2026-10-11

- Morphogenèse ferme le commit de graphe fondé sur des booléens d'autorisation
  fournis par l'appelant. Un reçu SQLite relisible lie la décision Rust
  consultative à la proposition et au snapshot ; l'autorité authentifiée et le
  snapshot de transition restaurable manquent encore pour `APPLY`
  ([ADR 0418](../../adr/0418-fermeture-commit-morphologie-et-recu-rust.md)).
- Biome `compute` tient compte des ressources du travail demandé et retourne
  une abstention si aucun provider annoncé n'est faisable. La capacité annoncée
  ne certifie pas les ressources physiques
  ([ADR 0419](../../adr/0419-capacite-reelle-du-travail-compute-biome.md)).
- Holobionte `tool` vérifie le résident et le contrat persistant avant l'appel
  externe, puis journalise refus, effet incertain ou résultat non vérifié. Cette
  frontière n'est pas une sandbox du système hôte
  ([ADR 0420](../../adr/0420-frontiere-contrat-outil-holobionte.md)).
- Rhizome fixe cinq variants à la session ; une transition impliquant l'un
  d'eux requiert une nouvelle session. Les autres transitions gardent une trace
  de la politique précédente et de la révision
  ([ADR 0421](../../adr/0421-transitions-de-variant-liees-a-la-session-rhizome.md)).
- Métapopulation lie le résultat du solveur à son dème, problème, seed et
  référence de preuve avant persistance. La qualité de l'objectif externe
  reste à vérifier indépendamment
  ([ADR 0422](../../adr/0422-liaison-des-resultats-solveur-metapopulation.md)).

### Cinquième vague — 2026-10-11

- Morphogenèse V2 refuse le mode `commit` avant les callbacks injectables :
  ceux-ci ne peuvent plus publier `APPLIED`. Le mode `shadow` reste disponible ;
  l'autorité Rust et le snapshot de transition restent à intégrer
  ([ADR 0423](../../adr/0423-fermeture-mode-commit-v2-morphogenese.md)).
- A-Team relit le TeamRun et le WorkGraph enfants, mais conserve le programme
  `WAITING` même après leur clôture : aucun reçu indépendant de budget ou de
  contrat ne permet encore `SUCCEEDED`
  ([ADR 0424](../../adr/0424-promotion-conditionnelle-des-sous-runs-a-team.md)).
- Trinity exige une empreinte de snapshot initial commune, des chemins de
  workspace distincts et la chaîne de transitions persistée avant une
  qualification nominale. Les douze missions restent à rejouer après correctif
  ([ADR 0425](../../adr/0425-liaison-campagne-nominale-trinity-aux-scellages.md)).
- Syncytium Human–AI exige désormais un consentement explicite, courant et de
  portée `session` pour l'agent qui enregistre l'action approuvée. Le reçu ne
  prouve toujours pas un effet externe
  ([ADR 0426](../../adr/0426-consentement-explicite-human-ai-syncytium.md)).
- Biocénose Hybrid Oracle revérifie un reçu HMAC lié au claim exact et au tour
  lors du routage, de l'agrégation et de la promotion. La signature locale ne
  prouve pas la vérité de l'oracle externe
  ([ADR 0427](../../adr/0427-recus-signes-hybrid-oracle-biocenose.md)).

### Sixième vague — 2026-10-11

- A-Team Relay Team vérifie chaque transfert adjacent d'une équipe de plus de
  deux membres, sa séquence et le chaînage des digests. Les accusés restent
  fournis par l'appelant et ne prouvent pas l'exécution des workers
  ([ADR 0428](../../adr/0428-chaine-de-transferts-relay-team-a-team.md)).
- Trinity recalcule les gates du variant depuis le journal durable de
  comparaison et vérifie son événement terminal ainsi que le monde promu. Les
  douze missions réelles restent à qualifier
  ([ADR 0429](../../adr/0429-gates-trinity-lies-au-journal-de-comparaison.md)).
- Morphogenèse ferme l'ancienne voie de transition collective avant tout effet
  : l'autorité authentifiée et le snapshot restaurable n'y existent pas. Une
  réévaluation porte un refus, pas un faux rollback
  ([ADR 0430](../../adr/0430-fermeture-transition-collective-sans-snapshot-restaurable.md)).
- Syncytium Hard et Human–AI calculent les échéances de bail à partir de
  l'horloge du runtime et refusent une heure fournie par l'appelant. Cela ne
  prouve ni la synchronisation inter-hôtes ni un effet externe
  ([ADR 0431](../../adr/0431-horloge-runtime-baux-syncytium.md)).
- Biome Open-Ended exige des références de preuve propres au candidat et à
  chaque réévaluation ; une niche déjà connue n'est pas recomptée comme
  promotion, y compris après reprise SQLite. Les mesures de l'hôte restent à
  vérifier indépendamment
  ([ADR 0432](../../adr/0432-preuve-par-candidat-et-promotion-unique-open-ended-biome.md)).

### Septième vague — 2026-10-11

- Holobionte Edge Sync compare les horloges vectorielles par composante : un
  ordre de clés différent ou une composante zéro absente ne crée plus de faux
  conflit. La livraison réseau et la provenance des événements restent des
  dépendances externes.
- Rhizome `resilient` et `self_healing` transmettent la deadline au retry de
  route et refusent le second appel si elle est expirée. L'effet éventuel de la
  première tentative n'est pas annulé
  ([ADR 0434](../../adr/0434-deadline-des-reprises-de-route-rhizome.md)).
- Métapopulation `persistent` lie le daemon du reçu au daemon du plan et au
  bail actif du même dème. Cette vérification des enregistrements ne prouve
  pas qu'un processus tourne après la restauration
  ([ADR 0435](../../adr/0435-identite-du-daemon-planifie-metapopulation.md)).
- Biocénose bloque la réexécution d'une action écologique dont l'appel a
  commencé sans reçu terminal. Un résolveur peut retrouver un reçu vérifié
  pour achever le journal sans répéter l'effet ; faute de preuve, le résultat
  reste incertain
  ([ADR 0436](../../adr/0436-reconciliation-actions-ecologiques-biocenose.md)).

### Huitième vague — 2026-10-11

- Morphogenèse rend append-only les versions de graphe préparées et les
  propositions consultatives persistées. Les triggers SQLite protègent leur
  relecture ordinaire, mais ne donnent ni signature, ni snapshot restaurable,
  ni autorité APPLY ; ce mode reste fermé
  ([ADR 0437](../../adr/0437-immutabilite-sources-recu-morphogenese.md)).
- A-Team `multiteam` retourne `PLANNED` après composition dans le runtime
  isolé. Il faut encore les TeamRuns enfants, leur budget et les contrats
  inter-équipes vérifiés pour annoncer une réussite
  ([ADR 0438](../../adr/0438-statut-planifie-runtime-isole-multiteam-a-team.md)).
- Trinity exige un rapport initial durable et cohérent pour chaque monde de
  la comparaison nominale, trois ou seize pour `factorial`. Les douze missions
  réelles restent à qualifier
  ([ADR 0439](../../adr/0439-rapports-initiaux-durables-pour-qualification-trinity.md)).
- Holobionte `tool` fige le bail et recontrôle son échéance après la lecture
  asynchrone du contrat, avant l'exécuteur. L'isolation système et l'effet
  externe restent à attester par l'intégrateur
  ([ADR 0440](../../adr/0440-bail-outil-immuable-holobionte.md)).

### Neuvième vague — 2026-10-12

- Morphogenèse insère et relit son reçu consultatif dans une même transaction.
  Une proposition absente annule l'insertion au lieu de laisser un reçu
  append-only orphelin. APPLY reste fermé faute d'autorité, de snapshot
  restaurable et de commit CAS vérifié
  ([ADR 0441](../../adr/0441-atomicite-recu-consultatif-morphogenese.md)).
- Rhizome ne compte pour la convergence qu'un reçu signé dont la route reste
  actuellement permise, y compris sous `private`. La signature ne suffit pas
  si la politique de route a changé
  ([ADR 0442](../../adr/0442-preuve-route-actuelle-rhizome.md)).
- Syncytium `speculative` lie la validation déclarée à l'empreinte courante
  de la branche et revérifie ses opérations sous verrou lors de la promotion.
  Le gate déclaré reste à authentifier indépendamment
  ([ADR 0443](../../adr/0443-preuve-revision-branche-speculative-syncytium.md)).
- Biome Quality-Diversity n'ajoute un enfant recombiné à la file que si son
  candidat devient élite dans l'archive. Les mesures et preuves fournies par
  l'appelant demandent toujours une vérification indépendante
  ([ADR 0444](../../adr/0444-enfants-depuis-elites-admises-biome.md)).

### Dixième vague — 2026-10-12

- Common refuse les champs d'autorité ajoutés à la racine d'un manifeste
  snapshot topologique après scellement. Le préflight reste consultatif et
  APPLY fermé sans snapshot collectif restaurable ni commit CAS attesté
  ([ADR 0445](../../adr/0445-refus-des-champs-non-scelles-snapshot-topologique.md)).
- Métapopulation refuse `SESSION_QUIESCED` si une affectation de mission
  référence un worker absent. Le snapshot exige que chaque lien vers un agent
  soit présent et inactif
  ([ADR 0446](../../adr/0446-refus-des-affectations-orphelines-en-quiescence-metapopulation.md)).
- Biocénose `forecasting_crowd` ne persiste et ne score une résolution que
  si son reçu vérifié lie la communauté, l'événement, le domaine et le résultat.
  Le validateur externe reste responsable de l'authenticité du reçu
  ([ADR 0447](../../adr/0447-lier-resolution-et-score-forecasting-biocenose.md)).
- Trinity exige que l'unique monde au statut `promoted` appartienne aux mondes
  initiaux qualifiés et corresponde
  au monde retenu dans la comparaison et à l'agent source du candidat. La
  campagne nominale réelle des douze variants reste à exécuter
  ([ADR 0448](../../adr/0448-liaison-monde-promu-candidat-trinity.md)).

### Onzième vague — 2026-10-12

- Common lie le graphe préparé à la liste complète des workers demandés. Une
  modification des rôles ou de la composition rend le snapshot caduc et empêche
  son usage dans l'adjudication persistée. APPLY reste fermé sans snapshot
  collectif restaurable ni commit CAS attesté
  ([ADR 0463](../../adr/0463-lier-workers-au-graphe-prepare-morphogenese.md)).
- A-Team `expert_committee` calcule le quorum sur les membres distincts du
  comité et refuse les bulletins extérieurs ou répétés. L'identité réelle des
  auteurs et les références de preuve restent à authentifier
  ([ADR 0460](../../adr/0460-quorum-lie-aux-membres-expert-committee.md)).
- Holobionte exclut l'hôte et l'acteur du collège des vérificateurs
  indépendants au préflight et au verdict. Une mission sans collège suffisant
  demeure inconclusive et sa session active
  ([ADR 0461](../../adr/0461-verificateurs-independants-holobionte.md)).
- Rhizome lie les reçus de route signés à leur session. Un reçu valide dans une
  session ne qualifie pas les métriques d'une autre, même si le graphe est
  identique. L'identifiant de session est généré par le runtime pour empêcher
  sa réutilisation volontaire après fermeture. Les anciens reçus sans cette
  liaison restent historiques
  ([ADR 0462](../../adr/0462-lier-recu-route-session-rhizome.md)).

### Douzième vague — 2026-10-12

- Common refuse un graphe préparé dont le JSON est illisible ou dont
  l'identité interne contredit la ligne SQLite et la référence. Le statut
  consultatif demeure inchangé : APPLY exige encore un snapshot collectif
  restaurable et un commit CAS attesté
  ([ADR 0467](../../adr/0467-lier-identite-interne-graphe-prepare-morphogenese.md)).
- Biocénose `representative_community` reconstruit les sièges et les poids
  depuis l'échantillon scellé de la constitution. Un panel fourni par l'appelant
  ou un sceau incohérent ne peut plus qualifier le vote ; la représentativité
  statistique reste à démontrer
  ([ADR 0468](../../adr/0468-scellement-panel-representatif-biocenose.md)).
- Biome `open_ended` ne met à jour l'archive des environnements qu'à partir
  des candidats admis avec leurs preuves propres. Une réévaluation rejetée ne
  peut plus contaminer le parent d'une génération future
  ([ADR 0465](../../adr/0465-preuve-des-reevaluations-open-ended-biome.md)).
- Métapopulation `rescue_network` exige que chaque fondateur annoncé par
  `STAGE_FOUNDER_RESERVE` soit encore présent dans la réserve persistée, avec
  sa multiplicité. Cette présence ne prouve pas sa viabilité future
  ([ADR 0466](../../adr/0466-preuve-de-reserve-fondatrice-metapopulation.md)).

## Plan par vagues

### Vague 1 — Contrat commun et traçabilité

- Définir le schéma `VariantDefinition` : identifiant, maturité, compatibilités, signaux,
  préconditions, paramètres, adaptateur, effets attendus et vérificateur.
- Ajouter un `MissionProfile` typé; distinguer faits fournis, signaux extraits et inconnues.
- Ajouter `selectVariant(topology, missionProfile, constraints, explicitVariant)` avec
  filtrage dur des incompatibilités, score explicable, seuil de confiance et baseline sûre.
- Produire un reçu comprenant variant retenu, scores, motifs, variants rejetés, origine
  explicite/automatique et version du profil.
- Persister `variantId` dans le plan Morphogenèse, graphe, dispatch et session runtime.

### Vague 2 — Catalogue complet et statut honnête

- Réconcilier les catalogues locaux et les fiches documentaires des huit topologies.
- Déclarer pour chaque variant s'il est exécutable, partiel, expérimental ou conceptuel.
- Pour Trinity, maintenir le lien entre catalogue, douze runners et critères de sortie; pour
  Biome, créer les politiques et adaptateurs qui manquent encore au catalogue central.
- Le statut de maturité ne doit pas exclure un variant de la sélection automatique. Si un
  mécanisme requis n'a pas d'adaptateur ou de critère de succès observable, le parcours doit
  exposer cette limite et bloquer ou escalader l'action concernée sans déclasser le variant.

### Vague 3 — Adaptateurs et exécution par topologie

- **Trinity** : qualifier les douze runners branchés par des missions nominales avec reçus
  vérifiables. Le facteur requiert seize cellules; récursion, adaptation et QD attendent leurs
  exécutions additionnelles et preuves dédiées. La campagne R3 pré-correctifs n'a validé aucun
  cas nominal (12 escalades); conserver le statut partiel jusqu'à une qualification réussie.
- **A-Team** : faire appliquer les formes de graphe, handoff, autorité, équipe et phase;
  distinguer sélection automatique des variantes multiteam partiellement prises en charge.
- **Biome** : appliquer allocation, foraging, diversité, succession, résilience, mémoire,
  adversarialité, substrat compute ou échelle selon le variant.
- **Biocénose** : garder les douze modes sélectionnables; compléter chaque parcours `PARTIAL`
  selon ses critères propres, sans en faire une catégorie de valeur inférieure.
- **Holobionte** : relier les profils host/symbiotes aux politiques de sécurité, localité,
  mémoire, régénération, outils et concurrence; ne pas promouvoir les concepts sans runtime.
- **Syncytium** : connecter le variant sélectionné au schéma, zones de cohérence,
  réplication et réparation; traiter Human–AI selon ses exigences propres.
- **Rhizome** : relier le profil choisi au routage, croissance, taille, confidentialité,
  ponts, persistance et réparation.
- **Métapopulation** : qualifier les adaptateurs externes et les missions réelles à
  budget égal. Le runtime livré couvre patches/îlots, migration revue, rescue,
  souveraineté, réserves, résidents et reprise ; dix suites dédiées couvrent les
  douze variants et les quatre profils historiques. Voir
  [la référence](../../03-reference/runtime-metapopulation.md) et ADR 0330.

### Vague 4 — Sélection automatique et choix opérateur

- Profiler à la création de mission et à chaque dispatch de topologie, pas seulement dans
  l'outil Morphogenèse.
- Appliquer le variant recommandé automatiquement si confiance suffisante; sinon retenir
  la baseline sûre et exposer l'incertitude dans le reçu.
- Accepter `variantId` explicite dans API/MCP/CLI, valider la compatibilité et renvoyer une
  erreur claire si le variant est inconnu ou si ses préconditions d'exécution sont absentes.
  La maturité ne bloque jamais le choix explicite ni automatique; les gardes portent sur la
  compatibilité et les capacités réellement disponibles.
- Autoriser une réévaluation en cours de mission uniquement sur nouvel événement ou
  changement de contraintes; tracer et vérifier toute transition.

### Vague 5 — Validation, documentation et activation graduelle

- Ajouter des tests par variant pour le contrat, les incompatibilités, le dispatch,
  l'effet runtime et le reçu de choix.
- Ajouter des missions fixtures discriminantes par topologie et comparer à des baselines.
- Mesurer qualité, preuves, coût, latence, diversité et défaillances selon les objectifs
  pertinents; une préférence heuristique ne vaut pas preuve de supériorité.
- Activer l'auto-sélection par variant après réussite de ses critères; garder un fallback
  conservateur et une trace expliquant chaque choix.
- Mettre à jour les fiches et le catalogue central pour refléter l'état réellement livré.

## Critères de fin

1. Les huit topologies acceptent le choix automatique et le choix explicite validé.
2. Chaque variant documentaire a un état, des préconditions, un adaptateur et des critères
   de validation; aucun variant conceptuel n'est présenté comme exécuté.
3. Une mission représentative par variant déclenche l'adaptateur prévu et produit une
   trace montrant l'effet propre au variant.
4. Le choix automatique est reproductible sur le même profil, respecte les exigences
   bloquantes et expose son raisonnement et son niveau de confiance.
5. Les critères de qualité, de sécurité et de promotion propres à chaque topology restent
   inchangés et contraignants.
