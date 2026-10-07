# ADR 0363 — Lier les messages d’organisation à l’identité runtime

- **Statut** : accepté.
- **Date** : 2026-10-07.

## Contexte

Le pont MCP acceptait `senderAgentId` et `requesterAgentId` des arguments de l’appel, puis prenait l’orchestrateur comme identité par défaut. Un client muni du bail pouvait ainsi publier ou lire comme un autre membre sans identité runtime attestée.

## Décision

Les actions de publication, d’inbox et de lecture de l’état exigent `GENOS_AGENT_ID` du processus lancé par le runtime. Les champs d’identité du payload ne servent plus de repli. Le service métier continue de vérifier l’appartenance au parent demandé et les règles de routage.

## Conséquences et limites

Un client MCP lancé hors session d’agent ne peut plus utiliser ces trois actions, même s’il possède le bail. Le test `stdio` couvre le refus des identités forgées sans variable runtime et l’absence de publication ; le test d’inbox couvre une identité worker liée et un message persistant. La variable d’environnement doit être fournie par un lanceur de confiance : cet ADR ne transforme pas l’environnement d’un processus contrôlé par l’attaquant en preuve cryptographique.
