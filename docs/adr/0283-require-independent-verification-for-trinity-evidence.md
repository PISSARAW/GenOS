# ADR 0283 — Exiger une vérification indépendante pour les preuves Trinity

## Statut

Acceptée.

## Contexte

Les citations sous forme d'URL ou de chemin de dépôt étaient comptées comme preuve sans que leur contenu soit lu, relié au claim ou vérifié. Les rapports pouvaient également déclarer eux-mêmes leur couverture et leurs tests.

## Décision

Une référence localisable reste une provenance, pas une preuve. Les claims ne sont comptés comme prouvés qu'après une receipt indépendante validée par le vérificateur. Les rapports de couverture, dimensions Pareto et tests exigent aussi une receipt vérifiée; une valeur ou un statut fourni seul par le modèle ne contribue pas à la décision.

## Conséquences

Les missions sans plan de vérification indépendant escaladent, même si leurs citations semblent plausibles. Les profils Pareto ont besoin de receipts associées aux mesures avant de produire un front.
