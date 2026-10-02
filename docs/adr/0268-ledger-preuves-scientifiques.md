# ADR 0268 — Ledger partagé de preuves scientifiques

- **Statut** : Accepté
- **Date** : 2026-10-02
- **Domaine** : épistémologie, expériences, provenance, topologies
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0019, 0024, 0049, 0051

## Contexte

La reproductibilité traverse Trinity, Biocénose, A-Team, Rhizome, Biome,
Métapopulation, Syncytium et Holobionte. Des tables parallèles pour chaque fichier
de manifeste dupliqueraient les faits et risqueraient de diverger de l'état déjà
persisté par ces topologies. Le runtime a déjà des registres de claims, des graphes
d'arguments, des expériences Trinity et des événements append-only, mais aucune
surface commune ne relie explicitement une expérience scientifique, ses claims, ses
preuves sourcées et ses évaluations.

## Décision

Ajouter au backend un ledger SQLite partagé avec quatre entités : expériences,
claims, preuves et évaluations. Il constitue une surface relationnelle additionnelle
et conserve les identifiants des topologies existantes comme références; il ne remplace
pas leurs stores ni ne prétend être leur unique état logique canonique.

Les niveaux `L1` à `L5` enregistrent le protocole de conservation et de reproduction
demandé. `L0` reste éphémère et ne peut être persisté dans ce ledger. Le choix d'un
niveau ne déclenche pas automatiquement une topologie. Les références des huit
topologies sont validées contre le catalogue GenOS.

Chaque preuve relie un claim dans la même expérience à une source typée, conserve le
contenu et son SHA-256, et peut déclarer empreinte d'environnement, classe de
réplication, dème et topologie. Les preuves et évaluations sont append-only. Une
évaluation de consensus ne peut pas définir le statut du vérificateur. Le statut
calculé préserve le dissensus (`SUPPORTED_WITH_DISSENT`), garde le résultat du
vérificateur séparé et laisse toujours la promotion aux gates existantes.

## Conséquences

### Positives

- Une expérience peut relier observations favorables et contradictoires sans écraser
  les objections minoritaires.
- Le digest du contenu et la source accompagnent chaque preuve persistée.
- Le niveau de preuve est explicite et les travaux éphémères restent hors registre.
- Les évaluations de consensus ne deviennent pas une vérification déterministe.

### Limites

- Le REST du ledger couvre le cycle expérience, claim, preuve et évaluation sous la
  route tenant-scoped `/api/experiments/:id/evidence-ledger`; aucun outil MCP ni
  adaptation automatique des huit topologies n'est encore fourni.
- Les contrôles de complétude de chaque niveau et l'admission aux gates de promotion
  restent à connecter aux protocoles Trinity, Biocénose et Métapopulation.
- Les empreintes et statuts déclarés ne certifient pas la vérité des observations.

## Alternatives

- Créer un fichier manifeste par artefact : rejeté comme registre primaire, car les
  représentations redondantes pourraient diverger.
- Remplacer les stores de topologie par `nucleus.sqlite` : rejeté, car cela
  outrepasserait leurs contrats et migrerait leur autorité sans plan compatible.
- Lancer les huit topologies pour chaque expérience : rejeté, car le niveau de
  conservation décrit une exigence de preuve et non une séquence d'exécution forcée.
