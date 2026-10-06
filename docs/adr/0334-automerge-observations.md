# ADR 0334 - Automerge pour observations seulement

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : Syncytium, état partagé

## Décision

Utiliser Automerge uniquement pour des observations textuelles attribuées.
Avant et après fusion, rejeter tout champ non prévu. Les permissions, dépenses,
leases, reçus et décisions de promotion restent dans leurs circuits autoritatifs.
Une fusion technique ne certifie pas la véracité des observations.

## Conséquences

Les notes concurrentes peuvent se rejoindre après déconnexion. Le prototype
ne traite ni authentification des auteurs, ni synchronisation réseau, ni
résolution sémantique de contradictions.
