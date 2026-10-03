# Plan d'implémentation des variants des huit topologies

- **Statut** : Implémentation en cours; couverture initiale branchée sur les huit topologies
- **Dernière revue** : 2026-10-04
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
| A-Team | Sélecteur et plan organisationnel existants | Graphe, communication et autorité de dispatch | Les formes multiteam restent soumises aux capacités disponibles |
| Biocénose | Recommandation par signaux de mission; explicite validé | Constitution et protocoles distincts; argumentation, fédération polycentrique, quarantaine, panel pondéré et historique persistant ont des effets runtime | Cinq parcours restent `PARTIAL`; voir la fiche pour leurs limites propres |
| Holobionte | Douze identifiants et sélection par mission; préconditions vérifiées | Politique jointe à la composition host/symbiotes | Les modules mémoire, succession, outils et réseau n'appliquent pas tous encore leur politique à leurs opérations |
| Syncytium | Auto-sélection et choix explicite | Schéma, session, cohérence, réplication et réparation | Human–AI reste conditionné aux capacités d'interface |
| Rhizome | Douze choix disponibles et sélection par signaux | Routage, croissance, pruning et portée persistante | Les transitions de politique en cours de session restent à mesurer |
| Métapopulation | Douze variants documentés et quatre alias historiques; sélection explicite/automatique persistée | Quorum, migration, diversité inter-îles, source-sink adaptatif; les rotations temporelles source/sink sont persistées comme événements, relues par l'observateur régional et vérifiées contre les transitions périmées; trials Classic Patch, patches éphémères, Anti-Synchrony, gates fédérés/culturels, adaptateurs de recherche et d'évolution | Rescue SLA observé mais secours soumis aux adaptateurs; l'évaluateur de colonie, le solveur et le moteur Rust doivent être fournis; pas encore de réserve persistante de fondateurs, QD/speciation, phylogénie culturelle complète, démons résidents ou rebouclage automatique de la cryptobiose |
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
  `test_topology_mission_variant_routing.js` couvre les signaux de sélection des 48 missions
  de référence; le test de dispatch vérifie aussi les workers, le schéma Syncytium et le
  contrat Trinity adversarial. Un test complémentaire exercé séparément vérifie la sortie de
  sécurité du watchdog et le planning non faisable du variant Syncytium `realtimeControl`.
- Ces tests prouvent des contrats codés et la sélection attendue, pas la réussite des missions
  par les modèles ni l'effet runtime spécifique des 95 variants. Les 48 missions réelles et
  la vérification d'un effet runtime propre par variant restent à rejouer; la parité de
  maturité n'est donc pas encore démontrée.

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
- **Métapopulation** : implémenter patches/îles, migration, réseau de secours, souveraineté,
  temporalité, évolution ou transfert culturel selon le variant.

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
