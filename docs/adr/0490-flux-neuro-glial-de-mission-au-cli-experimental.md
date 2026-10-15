# ADR 0490 — Flux neuro-glial de mission au CLI expérimental

- **Statut** : Accepté pour le contrat CLI local expérimental
- **Date** : 2026-10-15
- **Domaine** : Neurobiologie, glie, journal de mission
- **Décideurs** : Mainteneur GenOS
- **Lié à** : ADR 0192, réponse neuro-gliale corrélée aux événements de mission

## Contexte

L'ADR 0192 relie les événements admissibles de mission à une réponse neurale,
gliale et de quorum, puis l'API Rust persiste un flux ordonné et rejouable.
Avant cet ADR, aucun chemin CLI n'appelait cette API de flux.

## Décision

Le CLI expose `neuro-glia-stream` sous un opt-in `--experimental`. Il accepte
uniquement les types d'événements reconnus par le runtime, lie les entrées à un
UUID de mission déclaré par l'appelant, et délègue la persistance, le chaînage
par digest, l'idempotence et la restauration au contrat Rust existant. Le
journal est confiné au répertoire local `biological-receipts` du workspace et
les appels sont sérialisés par le verrou de mission existant.

## Conséquences

### Positives

- Le flux neuro-glial a maintenant un appelant CLI qui survit aux redémarrages.
- Les tests couvrent l'ordre, la réponse gliale, la reprise et le rejeu exact.

### Négatives

- Le CLI ne prouve pas l'identité ni l'autorité de l'opérateur sur la mission.
- Le quorum reste local et le modèle glial demeure une simulation logicielle.

## Alternatives

- Garder l'API Rust sans chemin d'exécution accessible : rejeté, car cela ne
  démontre pas l'intégration demandée.
- Présenter l'UUID fourni par l'appelant comme une autorité authentifiée :
  rejeté, car aucune authentification de principal n'est établie.
