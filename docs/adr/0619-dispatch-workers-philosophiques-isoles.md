# ADR 0619 — Dispatch de workers philosophiques isolés

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : philosophie opérationnelle, workers, isolation, preuve
- **Décideurs** : mainteneurs GenOS
- **Lié à** : [ADR 0615](0615-comparaisons-organisations-philosophiques.md), [ADR 0617](0617-attestation-independante-contrats-philosophiques.md)

## Contexte

Les comparaisons organisationnelles exécutent quatre ordonnanceurs dans le
processus Node principal. Elles prouvent l'ordre, les messages calculés et la
parité des issues, mais pas qu'un worker distinct a reçu et exécuté chaque audit.

## Décision

Exécuter chaque contrat d'une mission représentative dans un `worker_thread`
Node séparé, avec environnement vide, limites mémoire et délai de cinq secondes.
Le parent transmet le contrat avec un identifiant logique et un nonce. Le worker
doit retourner ce lien avec le résultat apparié contrôle/traitement ; toute
discordance, absence, erreur ou expiration est refusée.

Chaque combinaison mission/organisation produit un reçu lié aux trois résultats,
aux six messages parent-worker, aux coûts, à l'ordre des contrats et au plan de
messages de l'organisation. La vérification relance de vrais workers avec le même
nonce et exige une empreinte identique. La couverture exécute quatre missions sous
quatre organisations, soit 16 exécutions et 48 dispatchs workers.

Le reçu porte `actualWorkerDispatch: true`, mais conserve
`actualTopologyExecution: false` : les threads communiquent avec le parent et ne
constituent pas un réseau distribué inter-worker. Il conserve aussi
`externalFactsVerified: false`, `independentValidation: false` et
`promotionEligible: false`.

## Conséquences

- Le dispatch, l'isolation mémoire, le timeout et le round-trip deviennent exécutables.
- Une altération du reçu ou un résultat non lié au nonce échoue au replay.
- Les 48 dispatchs restent locaux à un processus hôte.
- La latence et la disponibilité d'un fournisseur externe ne sont pas mesurées.
- Cette preuve n'accorde aucune permission ni autorité de promotion.

## Alternatives

- Conserver les appels directs : rejeté, car ils ne prouvent aucun dispatch worker.
- Marquer les traces organisationnelles comme topologie réelle : rejeté, car les
  messages inter-worker ne sont pas exécutés.
- Lancer des processus ou fournisseurs distants sans configuration explicite :
  rejeté, car cela étendrait l'autorité et les coûts de la mission.
