# Inventaire d'atteignabilité des services

L'inventaire couvre chaque fichier JavaScript de `backend/src/services`. Exécuter
`node scripts/ci/audit_service_reachability.js --json` pour obtenir une ligne
par service avec son chemin et `staticReachable`. La commande sans `--json`
résume les résultats et affiche les premiers services à examiner.

Au 27 septembre 2026, la première passe trouve **1 803 services**, dont **1 309**
atteignables par des imports relatifs littéraux depuis `backend/server.js`,
`mcp/index.js` ou les programmes de `backend/bin`. **494** nécessitent une
revue supplémentaire. Le chiffre change avec les fichiers du dépôt; la commande
est la source de vérité pour le checkout courant.

`staticReachable` signifie seulement qu'une chaîne d'imports existe. Elle ne
prouve ni sélection pendant une mission, ni effet sur une décision, ni action,
ni preuve, ni apprentissage. Un service marqué `false` peut être chargé par un
import dynamique ou un registre. L'étape suivante est donc la vérification
fonctionnelle par le parcours `Sense → Select → Invoke → Affect decision → Act
→ Observe → Learn → Persist → Reuse` de la [matrice de câblage](wiring-matrix.md).

Ce relevé rend visibles les services isolés au lieu de les déclarer connectés
sur la seule base de leur existence. Les familles Rust, les outils et les
intégrations externes demandent des inventaires équivalents et une preuve de
pont typé vers le contrôle Node.
