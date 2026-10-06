# ADR 0330 - Bancs externes pour l'immunité et la navigation

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : évaluation, sécurité, navigation

## Contexte

Les tests internes ne suffisent pas à comparer une défense contre injection ou
une organisation de navigation. Un blocage systématique peut améliorer un score
de sécurité tout en détruisant l'utilité de la mission.

## Décision

Ajouter un lecteur borné des résultats AgentDojo, qui conserve séparément les
verdicts `utility` et `security`, et un exécuteur BrowserGym à nombre de pas
borné pour une politique fournie. Ces adaptateurs restent hors du runtime de
production. Ils ne modifient ni les gates de preuve ni les permissions.

## Conséquences

Une campagne réelle demande des modèles, tâches et environnements installés,
ainsi que des budgets comparables. Les tests locaux vérifient seulement le
contrat de lecture et la boucle d'environnement avec une imitation contrôlée.
