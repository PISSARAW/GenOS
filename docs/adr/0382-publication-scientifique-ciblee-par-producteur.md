# ADR 0382 — Production et abonnement scientifique ciblés

Statut : accepté le 2026-10-10.

## Contexte

Le magasin de références vérifiées et l'outbox scientifique existaient, mais
aucun producteur mathématique ne les appelait. La découverte des destinataires
reposait sur des dépendances de résultats déjà publiés : un agent intéressé
par une preuve future ne pouvait pas s'abonner avant sa publication.

## Décision

`createScientificMathematicalRuntime` compose un `LeanIncrementalGate`,
l'autorité durable des reçus, le magasin de références, le workflow et le
producteur scientifique. La preuve vérifiée par le runtime apporte la source
Lean exacte ; le producteur exige une liaison directe entre l'énoncé, le reçu
et cette source, demande un rejeu à l'autorité, puis publie la référence
versionnée par le workflow. Un échec d'attestation ou de publication interrompt
le pas du runtime avant sa sélection, mutation ou transmission et reste visible
dans son historique.

Une table d'abonnements indépendante du graphe des dépendances enregistre
l'intérêt d'un agent pour une version exacte de référence encore absente. Le
workflow contrôle son espace de travail et sa portée, puis l'ajoute dans une
transaction. La publication choisit seulement les abonnements ouverts,
enregistre les signaux dans l'outbox et satisfait les abonnements. La
rétractation prévient les abonnés et les marque périmés. Un abonnement tardif
ou une réactivation après rétractation sont rejetés ; un doublon conservé est
idempotent. Les abonnements ne sont jamais traités comme des preuves dérivées.

Le serveur actuel n'instancie pas `MathematicalOrganismRuntime`. L'appelant
doit donc utiliser la fabrique, fournir l'exécuteur Lean de confiance et les
valeurs d'environnement épinglées, initialiser une formalisation directe,
puis appeler `step()` ou `run()`. La fabrique n'annonce aucun démarrage
automatique du service de recherche.

## Vérification et limites

Les tests couvrent le producteur, sa composition, la portée et l'idempotence
des abonnements, la publication ciblée et leur fermeture lors de la
rétractation. Le banc `benchmarks/scientific-flow-scale` mesure séparément
10 000 identités logiques avec trois destinataires et une diffusion dense.
Il utilise un exécuteur synthétique et SQLite en mémoire ; il ne mesure pas
Lean, des agents physiques, le réseau ou la reprise après panne. Le rejeu
après redémarrage est couvert par l'ADR 0381 et son test dédié.
