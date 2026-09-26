# Plan d'implémentation des variants des huit topologies

- **Statut** : Implémentation en cours; couverture initiale branchée sur les huit topologies
- **Dernière revue** : 2026-09-25
- **Décision d'architecture** : [ADR 0124](../../adr/0124-selection-automatique-des-variants.md)

## Objectif

Pour toute mission lancée dans une topologie, choisir automatiquement un variant adapté,
appliquer réellement sa politique, permettre une sélection explicite validée et expliquer
le choix. « Adapté » signifie le meilleur variant exécutable selon les signaux et
contraintes connus; le système ne doit pas prétendre à une optimalité parfaite sans
comparaison mesurée.

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
| Biocénose | Recommandation par type de question; explicite validé | Constitution et protocole runtime; concepts non compatibles exclus de l'auto-choix | Certaines politiques restent `PARTIAL` |
| Holobionte | Douze identifiants et sélection par mission; préconditions vérifiées | Politique jointe à la composition host/symbiotes | Les modules mémoire, succession, outils et réseau n'appliquent pas tous encore leur politique à leurs opérations |
| Syncytium | Auto-sélection et choix explicite | Schéma, session, cohérence, réplication et réparation | Human–AI reste conditionné aux capacités d'interface |
| Rhizome | Douze choix disponibles et sélection par signaux | Routage, croissance, pruning et portée persistante | Les transitions de politique en cours de session restent à mesurer |
| Métapopulation | Douze variants documentés et quatre alias historiques; sélection explicite/automatique persistée | Quorum, migration, diversité inter-îles, corridors initiaux et source-sink adaptatifs, trials de recolonisation Classic Patch, patches éphémères, contrôleur Anti-Synchrony, gates fédérés/culturels, adaptateurs de recherche et d'évolution | Rescue SLA observé mais secours soumis aux adaptateurs; l'évaluateur de colonie, le solveur et le moteur Rust doivent être fournis; pas encore de réserve persistante de fondateurs, QD/speciation, phylogénie culturelle complète, démons résidents ou rebouclage automatique de la cryptobiose |
| Biome | Onze variants; explicite validé et sélection par mission | `advance_variant` persistant; allocation vectorielle/enchères, foraging-curiosité et archive, QD/CVT, succession à preuves, extinction/refuge/recolonisation, saisons inter-missions, génération POET bornée, coévolution adversariale abstraite, écologie des sources, scheduler compute, feedback multi-échelle | Le scheduler ne migre/exécute pas les fournisseurs; POET, attaques et fitness demandent des preuves externes; pas encore de daemon autonome ni benchmarks par variant |
| Trinity | Douze identifiants classés; variantes exécutables/partielles choisies par signal | Consignes par monde et sélection comparative existante | Factorial, Recursive et Oracular sont conceptuels; Jury, Adaptive, diversité fournisseurs et interventions contrefactuelles restent partiels |

Ces branchements rendent le choix traçable et opérant au dispatch, mais ne valident pas encore
la fin de l'objectif. La maturité centrale reste `partial` quand une politique n'agit pas sur
tous les mécanismes de son variant. La vague suivante doit compléter les adaptateurs listés,
puis produire les missions de validation par variant avant de promouvoir leur maturité.

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
- Pour Trinity et Biome, créer les politiques et adaptateurs absents du catalogue central.
- Ne pas auto-sélectionner une variante sans adaptateur et critère de succès observables.

### Vague 3 — Adaptateurs et exécution par topologie

- **Trinity** : relier les modes de comparaison aux trois mondes et aux barrières de
  preuve; limiter les variantes factoriales/recursive/adaptive aux capacités disponibles.
- **A-Team** : faire appliquer les formes de graphe, handoff, autorité, équipe et phase;
  distinguer sélection automatique des variantes multiteam partiellement prises en charge.
- **Biome** : appliquer allocation, foraging, diversité, succession, résilience, mémoire,
  adversarialité, substrat compute ou échelle selon le variant.
- **Biocénose** : garder actifs les protocoles déjà supportés; implémenter ou exclure
  explicitement les variantes `PARTIAL` jusqu'à leurs critères de fin.
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
  erreur claire si variant inconnu, partiel interdit ou préconditions absentes.
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
