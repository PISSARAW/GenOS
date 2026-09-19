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

## Voir aussi

- [ADR 0031](../adr/0031-scheduler-epistemique-mathematique.md)
- [Résultats formels MessagePack](resultats-formels-messagepack.md)
