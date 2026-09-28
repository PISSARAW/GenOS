# ADR 0168 — Validation sémantique des réponses biologiques

## Statut

Acceptée

## Contexte

Le détecteur de conflits Syncytium reçoit des opérations concurrentes. Les réponses finales des workers suivent un autre contrat et peuvent se contredire sans produire d'opération CRDT contradictoire.

## Décision

Les workers Syncytium publient des affirmations structurées sujet/prédicat/valeur avec leurs preuves. Avant l'agrégation, le dispatch attend la fin des workers ou l'expiration du délai, lit leurs rapports d'évidence persistés, puis compare les affirmations. Toute couverture incomplète ou contradiction non résolue produit un statut partiel.

## Conséquences

Les affirmations en texte libre ne sont pas interprétées comme des faits par le détecteur. La validation dépend de rapports `EVIDENCE_REPORT` persistés et de la présence des affirmations structurées; un résultat partiel ne peut pas être promu comme convergence sémantique complète.
