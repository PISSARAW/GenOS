# ADR 0558 — Isoler le replay Natural Search de l’initialisation de la DB

- **Statut** : Accepté
- **Date** : 2026-10-16
- **Domaine** : Natural Search, dépendances runtime et validation isolée
- **Décideurs** : GenOS
- **Lié à** : ADR 0032, Natural Search Control Plane; ADR 0323, reprise atomique

## Contexte

Le chargement de `CausalReplayService` importait directement
`agentOrchestrationState`. Ce dernier importe le module backend `db`, dont le
chargement peut tenter une sauvegarde pré-migration de `backend/genos.db`. Un
benchmark de phases qui n’utilise aucune base héritait ainsi d’un effet de bord
coûteux et sans rapport avec le replay. Le graphe observé est
`ActuatorModules` → `CausalReplayService` → `agentOrchestrationState` → `db`.

## Décision

1. Injecter l’émetteur d’événements dans `CausalReplayService`.
2. Résoudre l’émetteur runtime par import différé au moment du replay lorsque
   l’appelant n’en fournit pas. L’émission runtime conserve son comportement.
3. Laisser `ActuatorModules` accepter un `emit` ou un service de replay injecté,
   afin que les tests isolés puissent exercer le replay sans initialiser la DB.
4. Vérifier cette frontière par un test qui bloque tout chargement de
   `backend/src/db/index.js` pendant l’import et l’exécution du replay isolé.

## Conséquences

### Positives

- L’import des modules Natural Search n’ouvre pas la DB ni ne déclenche sa
  sauvegarde pré-migration.
- Le runtime conserve l’émission d’événement via le fournisseur existant si
  l’appelant ne configure pas d’émetteur.
- Les benchmarks peuvent cibler les modules Natural Search sans toucher à la
  base par défaut.

### Négatives et limites

- L’appel runtime au replay résout encore l’émetteur orchestration par import
  différé lorsqu’aucun émetteur n’est injecté.
- Cette décision ne raccorde pas les artefacts des phases 6–12 au solveur
  planning-gap et ne constitue pas une preuve de réussite de mission.

## Alternatives

- Laisser l’import global inchangé et créer une base temporaire pour chaque
  benchmark : rejeté, car cela masque la dépendance de module et conserve
  l’effet de bord au simple chargement.
- Supprimer l’émission d’événements : rejeté, car le runtime s’appuie sur cette
  télémétrie.
