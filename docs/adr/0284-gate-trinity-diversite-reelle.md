# ADR 0284 — Bloquer les expériences hétérogènes sans diversité effective

## Statut

Acceptée.

## Contexte

Le variant heterogeneous pouvait lancer trois mondes avec le même modèle et signaler `passes:false` sans bloquer l'expérience. La diversité des recettes de prompt était alors présentée comme diversité de modèles.

## Décision

Le plan de lancement attribue un URI de modèle distinct à chaque monde à partir des routes disponibles et calcule la diversité sur ces modèles et recettes. L'expérience est bloquée si le seuil n'est pas atteint. Le seuil et les poids privilégient maintenant les familles de modèle et les recettes; les versions d'une même famille ne suffisent pas à elles seules.

## Conséquences

Une configuration locale monoculture ne peut pas revendiquer une exécution heterogeneous. L'orchestration reste possible avec un variant controlled ou avec des routes de modèles suffisamment différentes.
