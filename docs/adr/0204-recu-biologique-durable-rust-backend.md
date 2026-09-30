# ADR 0204 — Reçu biologique durable Rust/backend

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Domaine** : Biologie computationnelle, persistance, homéostasie
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : `biologie-computationnelle.md`, `maturite-biologique.md`

## Contexte

Le tick Rust émet des reçus d'exécution et peut les persister dans un journal
append-only. Le backend conserve séparément les évaluations et reçus
d'homéostasie. Aucun transport de production ne raccorde encore les deux
registres. Les concepts du tick sont appliqués au niveau organisme; attribuer
une cellule ou un génome exécutant à ces opérations serait une identité
fabriquée.

## Décision

- Garder le contrat `genos.biological-execution-receipt/v1` compatible et
  ajouter `tick` ainsi que `execution_scope: "organism"` aux reçus du tick.
- Exposer un point d'ingestion backend explicite qui valide mission, reçu,
  résultat et coût, persiste le payload et son empreinte, et traite un même
  `receipt_id` de façon idempotente.
- Corréler à l'état d'homéostasie déjà persisté pour la mission lors de
  l'ingestion; un futur transport devra gérer les événements arrivés dans un
  autre ordre.
- Laisser `cell_id` et `genome_id` absents pour les opérations organismiques.
  Ne pas déduire l'exécutant d'un snapshot de population.
- Conserver explicitement le transport Rust/backend comme travail restant
  jusqu'à ce qu'un chemin runtime authentifié et un test E2E le prouvent.

## Conséquences

### Positives

- Les coûts et décisions du tick peuvent être associés durablement à une
  mission et à l'état homéostatique disponible sans confondre les registres.
- Les doublons et conflits d'identifiant ont un comportement vérifiable.
- Les limites de l'identité d'exécution restent visibles dans les données.

### Négatives

- L'ingestion explicite n'est pas encore une intégration automatique.
- Une corrélation reçue avant l'évaluation homéostatique demande une reprise
  ultérieure; l'ingestion initiale ne crée pas une relation rétroactive.

## Alternatives

- Inférer la cellule active depuis le snapshot de population : rejeté, car cela
  ne prouve pas quelle cellule a exécuté un concept au niveau organisme.
- Fusionner budget ATP Rust et budget de mission backend : reporté; ces
  registres ont des unités, autorités et cycles de vie distincts.
