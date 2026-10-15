# ADR 0541 — Répéter les époques morphogénétiques sous budget

- **Statut** : accepté pour le cycle backend en mémoire; reprise durable du contrôleur non implémentée
- **Date** : 2026-10-15
- **Domaine** : orchestration, morphogenèse, budget, épistémologie
- **Lié à** : ADR 0288, 0430, 0522, 0534, 0536, 0538

## Contexte

Le backend adaptait une seule continuation après la première vague. Un orchestrateur
adaptatif doit réobserver les résultats de chaque vague, reconsidérer la morphologie,
et poursuivre tant qu'une forme admissible et une tranche de budget existent. Le rapport
d'un worker ne peut pas, à lui seul, déclarer la mission résolue.

## Décision

Après chaque époque, attendre les résultats terminaux de tous les workers dispatchés,
ignorer les événements d'époques anciennes ou les doublons, puis vérifier un reçu
indépendant contre l'identité de mission, le workspace et les contrôles requis. Un reçu
valide arrête le cycle comme résolu. Sinon, sélectionner des survivants depuis leurs
résultats, réserver une tranche minimale du pool de continuation et recalculer le plan
Morphogenèse. Le pool est la borne par défaut du nombre d'époques; `maxEpochs` peut le
réduire. Les tokens déclarés non dépensés par un worker ne sont pas recrédités. Le cycle
s'arrête si le budget ne finance plus la tranche minimale, si la reconfiguration est
inadmissible ou si une limite explicite est atteinte. Trinity conserve ses mondes scellés
et son traitement dédié.

La continuation reste soumise aux gates et à la barrière de preuve existants. La
présente décision ne promeut pas le graphe consultatif et n'autorise aucune transition
collective qui requerrait le commit fermé par l'ADR 0430.

## Conséquences

### Positives

- Les signaux de chaque époque peuvent influencer la forme suivante, au lieu de figer
  la décision à la première continuation.
- Le budget est réservé avant dispatch, avec une allocation minimale vérifiée par worker.
- La résolution est réservée à un reçu vérifié; les raisons d'arrêt sont exposées par
  `MORPHOGENESIS_EPOCHS_STOPPED`.

### Négatives et limites actuelles

- L'automate `autonomousRounds` reste en mémoire. Les missions de continuation sont
  durables, mais un redémarrage ne reconstruit pas le compteur, le pool réservé et la
  barrière de l'époque active. La reprise durable de l'automate est une tranche requise.
- Le planificateur compose des topologies et peut choisir leurs variants, mais la
  continuation rebind les workers existants et conserve leur `workerKind` et méthode.
  Il ne recrute pas un nouveau type ni ne résout ou démarre un daemon.
- Les rapports de workers restent des signaux de sélection; une mission sans reçu
  valide s'arrête avec une raison explicite au lieu d'être présentée comme résolue.

## Vérification requise

Les tests couvrent les tranches répétées, le minimum par worker, les arrondis, la limite
explicite, une réservation active, les identifiants d'époque périmés et la barrière qui
attend chaque worker. Une intégration complète doit ensuite couvrir un reçu indépendant
valide, une mission non résolue jusqu'à épuisement, un blocage de reconfiguration,
l'interruption/reprise du processus et les gates finaux de mission.

## Alternatives écartées

- **Boucle illimitée sans réserve de budget** : rejetée, elle pourrait dispatcher sans
  tranche financée et empêcher une borne de coût.
- **Déclarer succès sur le score moyen des workers** : rejeté, les scores locaux ne sont
  pas un oracle indépendant.
- **Déduire la consommation réelle des rapports workers** : rejeté, cette donnée n'est
  pas une comptabilité d'autorité et ne peut pas reconstituer une réserve fiable.
