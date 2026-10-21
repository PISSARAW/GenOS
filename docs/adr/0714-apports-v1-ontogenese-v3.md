# ADR 0714 — Retenir les apports ergonomiques et observables de la V1 dans l'ontogenèse V3

## Statut

Proposé — 2026-10-21.

## Contexte

La V1 des contrats d'ontogenèse (portée « contrats stables V1 », revue
2026-10-01, commit `5a86dce3`) est le précurseur direct de la V3 (portée
« V2 », revue 2026-10-18). La V3 a conservé le socle (machine à états,
sélecteur de topologie, pression mémoire, intégrateur tatoué, CLI) et a
comblé la plupart des non-garanties documentées par la V1 (Job Objects
Windows, validation des budgets et des topologies, validation des statuts
d'inbox/notification).

La comparaison V1 → V3 montre cependant que plusieurs choix de simplicité de
la V1 ont été abandonnés au profit de mécanismes plus stricts, parfois au
détriment de l'ergonomie, de l'observabilité et de la robustesse en
dégradation :

- les `operation_id` de claim sont devenus opaques (UUID) au lieu d'être
  lisibles (`${owner}:${Date.now()}`, `renewed:${Date.now()}`) ;
- la comparaison d'expiration mélange `Date.parse` (JS) et `julianday` (SQL),
  avec un cas `NaN → expiré` ;
- `resolveVariant` peut bloquer la sélection (`variante-indisponible`,
  `baseline-indisponible`) là où la V1 repliait silencieusement vers
  `default` avec une note de rationale ;
- les réveils système et opérateur partagent le type `user_reply`, alors que
  la V1 distinguait le réveil générique `wake` ;
- la section « non-garanties » de la V1, qui servait de feuille de route,
  n'est plus maintenue avec la même rigueur.

L'enjeu est de récupérer ces apports sans affaiblir les garde-fous que la V3 a
instaurés (fencing par `operation_id`, pas de réentrée implicite dans le
claim, fail-closed sur les variantes explicitement demandées).

## Décision

Cinq ajustements sont retenus, tous bornés et non régressifs.

### 1. Unifier la comparaison d'expiration des claims

Toute comparaison d'expiration utilise une seule représentation et une seule
règle : la valeur persistée est comparée à l'instant courant dans la même
unité et le même fuseau. On conserve `julianday(expires_at) <= julianday('now')`
côté SQL pour le vol conditionnel, et côté JS on remplace `Date.parse` par
une fonction `parseExpiresAt` qui retourne `null` sur valeur illisible au lieu
de traiter `NaN` comme expiré. Une valeur illisible est alors rejetée avec
`claim-expiration-invalide` plutôt que silencieusement considérée expirée.

### 2. Distinguer `wake` (système) de `user_reply` (opérateur)

- `resumeProject` et `startProject` émettent `user_reply` (réponse
  opérateur), comme aujourd'hui.
- Les réveils issus du daemon, de la recon, du sensoriel et des ticks
  automatiques émettent `wake`.
- `wakeupPolicy.shouldWake` conserve la règle actuelle : `WAITING_INPUT` ne se
  réveille que sur `user_reply` ; `SLEEPING_RESOURCE` sur `resource` ; les
  autres états acceptent tout événement de `WAKE_EVENTS`, y compris `wake`.

Cela permet d'auditer l'origine d'un réveil et d'appliquer des politiques
différenciées (acquittement automatique vs attente humaine) sans changer les
transitions.

### 3. Repli silencieux vers `default` comme dernier recours

- Une variante explicitement demandée et indisponible reste bloquante
  (`variante-indisponible:${demandee}`), comme aujourd'hui.
- Lorsqu'aucune variante n'est demandée (ou `default`) et qu'aucune variante
  implémentée n'est trouvée, on replie vers `default` avec la note
  `variante-indisponible:${selectionnee}` ou `catalogue-indisponible`, au
  lieu de renvoyer `baseline-indisponible`.
- Le blocage dur `baseline-indisponible` est conservé uniquement pour les
  cas où la variante par défaut elle-même n'est pas implémentée.

Ce comportement reprend la simplicité de la V1 tout en préservant la sécurité
sur les demandes explicites.

### 4. Traçabilité propriétaire/date des claims dans les reçus

Le `operation_id` reste un UUID (unicité, fencing). On ajoute dans les reçus
de claim et dans la vue d'activité un champ `claimOwner` et `claimExpiresAt`
déjà disponibles côté ligne, et on journalise l'origine (`acquis`, `volé`,
`étendu`) dans le message de reçu. Aucun changement de schéma n'est requis :
les colonnes `owner` et `expires_at` existent déjà.

La réentrée implicite (`refreshClaim`) n'est pas réintroduite dans le chemin
de fencing. Elle peut être proposée ultérieurement comme primitive séparée
pour les contextes non fencés (monitoring, sondes), sous ADR dédié.

### 5. Maintenir la section « non-garanties » comme feuille de route

La section 10 du document `ontogenese-contrats.md` est tenue à jour à chaque
itération : chaque non-garantie ouverte est listée avec son état (ouvert,
en cours, fermé) et la référence de l'ADR ou du service qui la traite. Ce
pattern, instauré par la V1, est la seule manière de garder une vision
honnête des limites du contrat.

## Configuration

Aucun nouveau réglage. Les points 1 à 4 sont des changements internes aux
services `claimService`, `topologySelector` et `wakeupPolicy`. Le point 5 est
documentaire.

## Conséquences

- Meilleure cohérence et testabilité de l'expiration des claims, sans
  affaiblir le vol conditionnel.
- Distinction claire entre réveils système et opérateur, sans nouvelle
  transition d'état.
- Moins de blocages en dégradation (repli `default`), tout en gardant le
  fail-closed sur les variantes demandées.
- Observabilité accrue des claims sans changement de schéma.
- Gouvernance documentaire restaurée : les non-garanties redeviennent un
  outil de pilotage explicite.

Ces ajustements reprennent la simplicité éprouvée de la V1 là où elle ne
contredit pas les garde-fous de la V3, et les documentent comme décisions
explicites plutôt que comme héritage implicite.