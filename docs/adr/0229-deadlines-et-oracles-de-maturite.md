# ADR 0229 — Deadlines et oracles de maturité

## Contexte

Une échéance de navigation ne borne pas le traitement d'image. TrapChain
imposait une clé évitable et violait l'admissibilité annoncée.

## Décision

Le foraging partage un AbortSignal global : navigateur fermé à expiration,
fetch annulé et travail Sharp dans un worker terminable. Aucun reçu de succès
n'est publié après expiration. La session navigateur expirée doit être recréée.
TrapChain utilise la distance avec portes relâchées ; BFS contrôle les douze
optimums, avec une borne d'oracle indépendante du budget des politiques.

## Conséquences

Le crop a un coût de démarrage de worker. Une deadline est un échec explicite,
pas un résultat vide valide. Les garanties restent celles des tâches testées.

## Alternatives

Une simple Promise.race laisserait des effets tardifs. Imposer toute clé
surestime les détours ; le relâchement des portes conserve une borne inférieure.
