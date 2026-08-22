# Protocole de preuve reproductible

Ce protocole remplace les valeurs non sourcées de la matrice par des mesures
qui peuvent être rejouées depuis un checkout donné.

## Commandes GenOS

Depuis la racine du dépôt :

~~~bash
cargo test -p genos-core --lib
cargo test -p genos-store --test replay_tests
cargo test -p genos-world --test file_isolation
cargo test -p genos-world --test isolation_boundaries

cargo run --release -p genos-store --bin replay_benchmark -- \
  --iterations 500 --events 100 --warmups 20

cargo run --release -p genos-world --bin world_benchmark -- \
  --iterations 500 --warmups 20
~~~

Les deux exécutables produisent du JSON avec :

- p50, p95, p99, moyenne, écart-type, minimum et maximum ;
- le nombre de runs et de warmups ;
- la taille des événements ou du snapshot ;
- OS, architecture, version Rust, hostname et révision Git ;
- la ligne de commande exacte ;
- l'empreinte du replay.

## Portée des garanties

Le harness de replay garantit uniquement la reproductibilité du reducer
genos-store pour un flux d'événements donné. Il ne garantit pas la
reproductibilité d'un modèle, d'un réseau, d'une horloge ou d'un outil externe.

Le provider DirectoryWorldProvider garantit une séparation des fichiers
relatifs entre worlds. Il ne fournit pas de sandbox OS : l'environnement est
hérité par les processus enfants et aucune politique réseau n'est appliquée.
Les tests isolation_boundaries rendent cette limite explicite.

Le fork benchmark mesure donc une copie de répertoire, pas un fork Copy-on-Write.
Il est incorrect de comparer son résultat à une promesse de fork CoW.

## Comparaison des concurrents

Chaque adaptateur externe doit consommer le scénario
benchmarks/scenarios/agent-runtime-boundaries.json et produire le même
schéma JSON. Un adaptateur doit déclarer unsupported lorsqu'il ne peut pas
mesurer une métrique ; 0, une valeur vide ou une absence de résultat ne
signifient pas « aucune fuite » ou « replay parfait ».

La comparaison doit utiliser :

1. la même machine ou des machines documentées ;
2. la même version de runtime et le même modèle ;
3. le même nombre d'événements, snapshot et fault profile ;
4. les mêmes warmups et répétitions ;
5. les mêmes critères de succès ;
6. les distributions complètes, pas seulement une moyenne.

Sans adaptateur exécuté pour LangGraph, AutoGen, CrewAI, Langfuse, Braintrust
ou Phoenix, aucune valeur comparative ne doit être inscrite dans la matrice.
