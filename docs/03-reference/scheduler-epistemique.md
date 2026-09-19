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

## Affectation par nouveauté attendue

`allocateByNovelty` classe chaque couple tâche–agent selon six signaux bornés :
distance sémantique, couverture d'obligations ouvertes, potentiel de falsification,
adéquation des capacités, nouveauté pour cet agent et indépendance de la source de
preuve. Une pénalité de coût tient compte du budget disponible.

L'allocation est déterministe, un agent et une tâche ne sont sélectionnés qu'une
fois par passe, et des agents peuvent être réservés aux vérifications indépendantes.
Les scores et leurs composantes sont retournés pour audit ; ils ne sont jamais
présentés comme une probabilité de vérité.

## Propagation des contre-exemples

`CounterexamplePropagator` utilise l'index inverse des dépendances pour atteindre
immédiatement tous les descendants d'un nœud réfuté. Un recouvrement de domaine
explicite invalide le descendant ; un domaine explicitement disjoint reste actif ;
une relation de domaine inconnue suspend le descendant en attente d'une preuve
d'applicabilité.

Chaque transition publie un événement horodaté lié au résultat de contre-exemple.
Cette propagation ne transforme donc jamais une incertitude de domaine en
réfutation automatique.

## Réallocation du budget des lignées

`reallocateLineageBudget` construit un front de Pareto à partir de la force de
preuve, la nouveauté, la couverture, la progression Lean et l'efficacité de coût.
Une lignée est dominée seulement si une autre n'est pire sur aucun axe et lui est
strictement supérieure sur au moins un axe.

Le budget transférable des lignées dominées est distribué entre les lignées du
front selon leur score de promesse. Un plancher configurable préserve une capacité
d'exploration. La somme entière des jetons est conservée et chaque mouvement porte
un reçu `fromLineageId`, `toLineageId`, `tokens` et `reason`.

## Graphe de dépendances mathématiques

`MathematicalDependencyGraph` stocke des nœuds typés `conjecture`, `lemma`,
`theorem`, `counterexample`, `artifact` ou `obligation`. Les arêtes sont `uses`,
`implies`, `specializes`, `contradicts` ou `verifies`. Pour une dépendance causale,
l'arête va du prérequis vers son consommateur.

Les cycles dans `uses`, `implies` et `specializes` sont refusés. Le graphe expose
la frontière actuellement ouvrable, les descendants, les racines, les feuilles et
une exportation structurée `genos.mathematical-dependency-graph/v1`. Il peut être
construit directement à partir de résultats `genos.formal-result/v1` ; leurs
dépendances deviennent alors des arêtes, sans passer par un résumé textuel.

## Vérification Lean incrémentale

`LeanIncrementalGate` n'ouvre un lemme ou un théorème que lorsque tous ses
prérequis possèdent un reçu Lean réussi. Le nœud doit être `formalized`; un succès
le passe à `verified`, tandis qu'un échec le place à `blocked` et ferme la frontière
de ses descendants.

Le gate refuse avant exécution les placeholders `sorry` et `admit`. Il échoue aussi
si l'exécuteur est absent, si la version du toolchain diverge ou si un axiome non
autorisé est signalé. Chaque reçu engage par SHA-256 le source, la version Lean,
l'environnement, les reçus parents, les axiomes et l'horodatage.

`executeLeanCheck` fournit l'exécuteur local : il vérifie d'abord `lean --version`,
compile le source dans un répertoire temporaire isolé, puis détruit ce répertoire.
Le scheduler exige une version épinglée ; il ne transforme jamais l'absence de Lean
en succès simulé.

La suite complète s'exécute avec :

```bash
npm --prefix backend run test:epistemic-scheduler
```

## Voir aussi

- [ADR 0031](../adr/0031-scheduler-epistemique-mathematique.md)
- [Résultats formels MessagePack](resultats-formels-messagepack.md)
