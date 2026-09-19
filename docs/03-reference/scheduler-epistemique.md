# Scheduler épistémique mathématique

- **Statut** : Implémentation progressive
- **Portée** : scheduler backend Node.js
- **Dernière revue** : 2026-09-19

## Registre des tâches actives

`ActiveTaskRegistry` calcule une empreinte SHA-256 canonique à partir de l'énoncé,
des hypothèses, du domaine et des dépendances. Une tâche identique déjà active est
regroupée par défaut, ou refusée lorsque `duplicatePolicy` vaut `reject`.

Le registre ne rapproche pas deux énoncés seulement similaires. Toute équivalence
non syntaxique doit être portée par une preuve distincte.

```js
const { ActiveTaskRegistry } = require('./src/services/epistemicScheduler');

const registry = new ActiveTaskRegistry();
const decision = registry.register(task, { duplicatePolicy: 'coalesce' });
```

Le résultat contient `decision`, `fingerprint` et `canonicalTaskId`. Les décisions
possibles à ce stade sont `accepted`, `coalesced` et `rejected`.

## Vérifications indépendantes

`registerVerificationReplica` autorise une redondance bornée sans désactiver la
déduplication générale. Chaque réplica déclare son acteur, son modèle et sa version,
sa stratégie, sa source de preuve et son workspace. Deux exécutions partageant le
même acteur ou le même workspace ne sont pas qualifiées d'indépendantes.

La distance minimale vaut trois dimensions différentes par défaut. Le nombre de
réplicas est borné, tandis que `verificationReplicaTarget` recommande zéro réplica
pour un cas normal, un pour une vérification explicitement demandée, deux pour un
risque élevé et trois pour un risque critique.

## Voir aussi

- [ADR 0031](../adr/0031-scheduler-epistemique-mathematique.md)
- [Résultats formels MessagePack](resultats-formels-messagepack.md)
