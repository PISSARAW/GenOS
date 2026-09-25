# ADR 0065 — Homéostasie de l'environnement hôte

## Contexte

Les ressources visibles par GenOS changent selon la machine et la charge. Le backend
créait jusqu'à quatre processus à partir du nombre de processeurs physiques, tandis
que le routage des modèles locaux utilisait d'autres mesures. Les magasins de données
employaient un chemin fixe. Une installation existante peut aussi posséder une base
SQLite historique à la racine du dépôt.

## Décision

Le module `hostEnvironment` joue le rôle de récepteurs : il observe le parallélisme
disponible, la mémoire, le volume de données et, sous Linux, les délais de pression
CPU, mémoire et E/S. Il tient compte de la limite mémoire cgroup v2 lorsqu'elle est
lisible. Les observations manquantes restent `null` ; elles ne sont pas inventées.

Une politique déterministe joue le rôle d'homéostasie. Au démarrage, elle borne le
nombre de processus backend. Le routage local consulte une observation récente avant
de confier une tâche à un modèle local. Les motifs de limitation sont exposés par
`node backend/bin/genos-environment.cjs`. Les seuils sont conservateurs ; ils ne
constituent pas une preuve d'optimalité sur toutes les charges.

Pour une nouvelle installation, GenOS examine les volumes locaux fixes sous Windows
et les montages de périphériques sous Linux. `GENOS_STORAGE_CANDIDATES` permet de
restreindre les racines autorisées, séparées par le séparateur de chemins de la
plateforme. La sélection
privilégie le meilleur ratio d'espace libre parmi celles qui passent le seuil
`GENOS_STORAGE_MIN_FREE_BYTES` (1 Gio par défaut). Le choix est fixé dans
`.genos/storage-location.json`. `GENOS_DATA_ROOT` permet un choix explicite.
Une racine de données déjà présente et la base SQLite historique restent à leur
emplacement. Le système n'effectue pas de migration automatique de bases ouvertes.

## Conséquences

- Le nombre de processus est choisi au démarrage ; le modifier à chaud demandera un
  superviseur capable de drainer et remplacer les processus.
- Les conditions de disque et mémoire sont visibles dans le diagnostic.
- Un pointeur de stockage indisponible bloque le démarrage au lieu de créer une base
  vide silencieusement.
- L'apprentissage futur des politiques devra comparer les résultats avec cette base
  déterministe et rester soumis aux mêmes limites de sécurité.

## Sources

- Documentation Linux PSI : <https://docs.kernel.org/accounting/psi.html>
- Documentation Node.js `os.availableParallelism` et `fs.statfs` :
  <https://nodejs.org/api/os.html>, <https://nodejs.org/api/fs.html>
- SQLite WAL et fichiers associés : <https://www.sqlite.org/wal.html>
- Mao et al., *Learning Scheduling Algorithms for Data Processing Clusters* :
  <https://arxiv.org/abs/1810.01963>
