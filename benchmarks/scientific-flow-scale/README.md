# Échelle du flux scientifique ciblé

Ce banc exerce la création d'identités d'agents, l'abonnement à une version de
référence avant publication, la publication transactionnelle, l'outbox, le
transport Signal Plane, la rétractation et sa livraison. Il vérifie les comptes
de destinataires et de signaux persistés. Le test porte sur des **identités
logiques** dans un seul processus et une base SQLite en mémoire. Il ne lance
pas autant de workers physiques.

Le reçu initial et le rejeu de l'autorité utilisent le même exécuteur
synthétique dans le banc. Les mesures ne prouvent donc aucune vérité
mathématique ni la performance de Lean.
Elles ne couvrent pas le réseau, le modèle, la persistance disque, les pannes
ou la reprise de l'autorité. Ces propriétés sont vérifiées dans les tests
fonctionnels dédiés.

Depuis la racine du dépôt :

```powershell
node benchmarks/scientific-flow-scale/run.cjs --agents=100 --subscribers=3
node benchmarks/scientific-flow-scale/run.cjs --agents=1000 --subscribers=3
node benchmarks/scientific-flow-scale/run.cjs --agents=10000 --subscribers=3
node benchmarks/scientific-flow-scale/run.cjs --agents=1000 --subscribers=1000
node benchmarks/scientific-flow-scale/run.cjs --agents=10000 --subscribers=10000
```

Les trois premières tailles représentent un réseau croissant à diffusion
sélective ; la dernière éprouve une diffusion dense. Chaque commande exécute
un processus neuf et imprime un JSON. `setupMs` mesure l'insertion des agents,
`subscriptionMs` la déclaration des intérêts, `publishMs` et `retractMs` les
transactions métier, et `published`/`retracted` le temps jusqu'à la persistance
du dernier signal ciblé. Les percentiles mesurent la fin de mise en file, avec
un dispatcher séquentiel ; ils incluent l'attente des autres destinataires.

Une seule mesure par taille permet de repérer une rupture fonctionnelle et
d'indiquer un ordre de grandeur local. Une courbe de capacité exige des
répétitions sur une machine isolée, plusieurs dispatchers, une base disque et
des consommateurs indépendants.

## Premier passage local

Le 10 octobre 2026, Windows x64, Node 24.18.0, AMD EPYC 7543P (8 CPU logiques
visibles), base SQLite en mémoire, un dispatcher séquentiel, lot de 100,
checkout partagé à `3e7f7792` avec les modifications de ce banc non encore
commitées. Un seul passage par taille, sans isolation de la charge de la
machine :

| Identités | Abonnés | Installation | Abonnements | Transaction publication | Livraison publication | Transaction retrait | Livraison retrait | Signaux | RSS final |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 3 | 16 ms | 5 ms | 5 ms | 28 ms | 4 ms | 8 ms | 6 | 70 Mo |
| 1 000 | 3 | 187 ms | 6 ms | 7 ms | 28 ms | 6 ms | 10 ms | 6 | 74 Mo |
| 10 000 | 3 | 2 456 ms | 7 ms | 12 ms | 38 ms | 7 ms | 15 ms | 6 | 121 Mo |
| 1 000 | 1 000 | 170 ms | 1 217 ms | 281 ms | 5 041 ms | 364 ms | 3 862 ms | 2 000 | 109 Mo |
| 10 000 | 10 000 | 1 645 ms | 7 433 ms | 2 101 ms | 26 223 ms | 2 019 ms | 23 769 ms | 20 000 | 283 Mo |

Les 10 000 identités avec trois abonnés produisent six signaux ; les 9 997
autres identités n'en reçoivent aucun. Le cas dense livre 20 000 signaux de
publication et de retrait en deux phases. Son p95, mesuré depuis le début de
chaque dispatch et incluant la file séquentielle, est de 25,0 s pour la
publication et 22,4 s pour le retrait. Ces chiffres caractérisent ce banc
local ; ils ne valident ni 10 000 agents actifs ni une capacité de production.
