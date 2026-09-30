# ADR 0187 — Quarantaine avant dispatch de mission

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Décideurs** : Runtime GenOS

## Contexte

La surveillance clinique était appelée lors de l'incarnation d'un worker,
mais son résultat ne contrôlait pas le dispatch. Une anomalie exigeant une
quarantaine pouvait donc coexister avec la création d'une nouvelle mission.

## Décision

Avant de construire l'identité, le lease ou le descriptor du worker, le runtime
lit l'état clinique du parent, initialise un état s'il est absent et exécute
la surveillance. Si la surveillance déclenche une quarantaine, l'état du parent
est persisté en `blocked`, le cycle cellulaire est arrêté et l'incarnation
échoue avec `AGENT_QUARANTINED`. Une erreur de surveillance persistante bloque
aussi le dispatch (`IMMUNE_SURVEILLANCE_UNAVAILABLE`).

## Conséquences

- La quarantaine devient un point d'application bloquant dans le vrai chemin de
  création de worker.
- L'événement `quarantine_initiated` conserve la synthèse des détections.
- Le traitement reste au niveau du parent demandeur; aucune thérapie n'est
  appliquée automatiquement par ce gate.

## Preuve

- `backend/src/services/agents/agentIncarnationService.js`
- `backend/src/services/medical/missionQuarantineGate.js`
- `backend/tests/test_mission_quarantine_gate.js`
