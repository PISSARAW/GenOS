# ADR 0646 — Apprentissage qualifié et exécution ETT reprenable

- **Statut** : Accepté
- **Date** : 2026-10-19
- **Portée** : pensée endogène, mémoire vectorielle, exécution worker, reprise

## Contexte

Le reçu d'apprentissage ETT pouvait être durable alors que son écriture en mémoire
vectorielle avait échoué. Le résultat annonçait alors malgré tout
`searchImpact.modified = true`. Quand l'écriture réussissait, son contenu ne
conservait que l'étiquette de l'épisode et quelques références, pas la croyance,
sa méthode de réfutation et l'attestation indépendante qui la qualifiait.

Le runner appelait par ailleurs un callback avant de réserver durablement
l'exécution. Une interruption entre cet effet et l'insertion du run autorisait une
nouvelle invocation ambiguë. L'usage provenait du callback lui-même et aucune
frontière n'imposait un sandbox ni une annulation effective.

## Décision

Le contrat d'apprentissage passe en `v2`. Son reçu atteste seulement qu'une entrée
vérifiée est apprise dans l'épisode ; il ne prétend plus que la mémoire de
production a déjà été mutée. Le lecteur reste compatible avec les reçus `v1`.
La mutation de recherche est annoncée uniquement après obtention d'un identifiant
de mémoire non vide. La mémoire contient un document canonique avec la croyance,
la méthode, le falsificateur, les preuves attendues, le verdict, l'oracle,
l'attestation et la provenance complète.

Avant toute invocation externe, le runner insère une réservation SQLite et un run
Ontogenèse `running`, consomme l'autorisation et réserve la tâche. L'identifiant
d'exécution est déterministe à partir du run et de sa requête. Une réservation
`running` n'est jamais réexécutée : le sandbox doit récupérer son résultat par cet
identifiant, sinon le runner échoue fermé avec `ENDOGENOUS_RUN_RECOVERY_REQUIRED`.

Un worker injecté est accepté seulement avec un adaptateur déclaré
`isolated-read-only`, sans réseau, mutation ni action externe, ainsi qu'un compteur
d'usage externe. L'usage renvoyé par le worker est ignoré. Si un `AbortSignal` est
fourni, le sandbox doit exposer `cancel`; l'annulation place durablement la
réservation en `cancelled` et le run en `failed`.

## Conséquences

Une découverte supportée devient récupérable avec son contenu scientifique et sa
provenance. Un échec de stockage reste visible et ne produit plus de faux impact
de recherche. Les anciens reçus d'apprentissage restent lisibles.

Le protocole ne promet pas une exécution exactement une fois face à un système
externe arbitraire. Il fournit une réservation avant effet, une clé idempotente et
une récupération explicite ; un adaptateur incapable de récupérer un effet ambigu
est refusé. Les callbacks nus et les consommations auto-déclarées ne satisfont plus
le contrat des workers injectés.

## Alternatives

- Réinvoquer automatiquement le callback avec la même clé : rejeté, car le runner
  ne peut pas démontrer que le système externe respecte cette clé.
- Conserver les usages déclarés par le callback : rejeté, car producteur et
  mesureur ne seraient pas indépendants.
- Faire échouer l'apprentissage entier quand la mémoire vectorielle est
  indisponible : rejeté, car le reçu vérifié reste une preuve durable distincte ;
  l'échec de projection mémoire doit être explicite et récupérable.

## Vérification

- `node backend/tests/test_endogenous_thought_learning.js`
- `node backend/tests/test_endogenous_thought_runner.js`
- `python scripts/ci/check_code_quality.py`
