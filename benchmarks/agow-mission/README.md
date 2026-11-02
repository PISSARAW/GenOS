# Mission AGOW instrumentée

Démonstrateur local déterministe : agréger les quantités strictement positives
par client, puis trier les clients. Le vrai pool, l'ignition, le choix de mode,
le frame, la diffusion locale et les reçus AGOW transmettent l'entrée au receiver.
Le worker est lancé après la liaison durable mission/run/décision. Un oracle dans
un second processus recalcule les totaux avec une implémentation différente.

```powershell
node benchmarks/agow-mission/run.cjs
node benchmarks/agow-mission/verify.cjs <repertoire-retourne>
```

Chaque run crée un répertoire neuf sous
`.genos-agent-worlds/agow-mission-observation/` : manifeste écrit avant les
exécutions, rapport et base SQLite. Le manifeste fixe les entrées, les deux
conditions et les hashes de sources importantes, dont l'oracle et le contrat.
Il ne constitue pas une archive exhaustive de toutes les dépendances transitives.
Le vérificateur refuse un manifeste différent ou des sources épinglées modifiées,
relit SQLite et réexécute l'oracle dans un nouveau processus.

`GENOS_AGOW_DEMO_ROOT` permet de choisir une autre racine de sortie, par exemple
sur D:. Utiliser la même valeur pour exécuter et vérifier ; le contrôle de
confinement résout les chemins réels et reste limité à cette racine.

Les deux workers terminent normalement et déclarent un succès de processus. Le
second ajoute volontairement 1 au total du premier client. L'oracle mesure la
fraction des totaux clients incorrects : **0** pour le worker correct, **0,5** pour
le worker avec faute. L'observation des mesures est vérifiée dans les deux cas ;
la tâche est réussie uniquement dans le premier.

Le temps du processus worker est mesuré par l'hôte. Tokens et coût financier
restent `null` ; réserve de ressources, stabilité et nombres de blocages ne sont
pas mesurés et restent `null`. Une absence n'est pas une valeur nulle de perte.

Le banc utilise `skipTransport: true` pour la livraison locale documentée. Il
n'exécute pas le superviseur complet ni ses gates métier, ne sollicite aucun LLM,
ne fournit pas de comparaison causale entre politiques et ne promeut rien.
L'oracle connaît les entrées d'origine indépendamment de la diffusion ; le worker
reçoit uniquement les entrées effectivement transmises par le receiver.

Contrat : [observation des missions](../../docs/03-reference/observation-mission-agow.md).
