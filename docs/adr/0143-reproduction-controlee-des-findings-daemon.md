---
title: Reproduction contrôlée des findings daemon
date: 2026-09-27
status: accepted
authors: Bruney
decision-id: 0143
---

# ADR 0143 : reproduction contrôlée avant promotion causale

## Contexte

La gate ADR 0135 comparait des identifiants de snapshots et des champs déclaratifs.
Un caller pouvait indiquer un hash initial sans rapport avec le snapshot ou
affirmer deux répétitions sans exécution contrôlée.

## Décision

`controlledFindingRunnerService.runControlledFinding` reçoit un finding déjà
`REPRODUCED`, deux snapshots distincts de son workspace et une commande de test
autorisée. Il exécute deux fois la même commande dans chaque snapshot isolé.
Il ne produit une preuve causale que si le test échoue deux fois sur la référence
et réussit deux fois après intervention, sans sortie tronquée. Le service
enregistre les résultats et les hashes de sortie dans `provenance_records`,
puis ajoute la preuve typée au finding.

La gate vérifie la cohérence des hashes des snapshots, le workspace, le hash du
payload de provenance, le finding et les résultats des quatre exécutions.
Une déclaration seule ne permet plus `CAUSALLY_SUPPORTED` ou `REPAIRABLE`.

## Limites

La comparaison d'un test entre deux snapshots apporte une preuve contrôlée de
régression/récupération sur cette commande. Elle ne prouve pas que tous les
facteurs de l'environnement ou toutes les autres causes sont identiques.
Le runner est appelé explicitement par le contrôleur de mission; aucun daemon
observateur n'obtient le droit d'écrire ou d'exécuter une réparation.
