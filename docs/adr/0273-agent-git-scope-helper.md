# ADR 0273 — Extraction du helper de portée AgentGit

- **Statut** : Accepté
- **Date** : 2026-10-27
- **Domaine** : Backend, AgentGit, dépendances de modules

## Contexte

Plusieurs modules AgentGit chargent `index.js` pendant que celui-ci construit
ses exports. `dagOperations.js` lit alors `scopeSql` avant que l'export existe,
ce qui émet un avertissement de dépendance circulaire et peut laisser le
helper indisponible selon l'ordre de chargement.

## Décision

Déplacer `scopeSql` dans un module autonome sans dépendance sur AgentGit. Le
point d'entrée et les opérations qui en ont besoin importent ce module partagé.
La clause tenant et ses paramètres restent inchangés.

## Conséquences

- Le chargement du service AgentGit ne dépend plus de l'ordre d'initialisation
  de ses exports pour calculer la portée SQL.
- Le helper reste neutre en l'absence de contexte HTTP tenant, comme avant.
