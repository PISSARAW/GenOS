# GQEL V2 — validation locale du 2 novembre 2026

## Périmètre

Base inspectée : `0460180ff7f0eb59ab34ce81bca458d2a8d0dfad`.
Publication préparée sur `813784c6b791c775445207a37799e10be85834b7` : six commits
intermédiaires comparés, sources GQEL inchangées, documentation V1 nouvelle archivée.
Le workspace local est un snapshot partiel des sources concernées, pas un clone
complet du monorepo. Node.js `v22.16.0`.

## Résultats exécutés

- `node backend/tests/test_gqel_v2.cjs` : **50/50 réussis**. Contrôleur, contrats,
  budget, construction par scènes, comparaison, hook et adaptateur Ollama réels ;
  réponses de modèles et de HTTP synthétiques.
- `node --check` sur les fichiers JavaScript/CJS livrés : réussi.
- Scanner ciblé des règles GenOS (400 lignes, 3 paramètres, complexité 10) sur
  les fichiers livrés : exécuté, sans nouvelle violation après corrections.
  Ce n'est pas le gate global de tout le dépôt.

Les chemins positifs incluent une génération admissible, une réparation préférée
dans les deux ordres, un plan relu suivi d'une scène et un reçu worker lié à son
texte exact. Les cas négatifs couvrent l'ancien V3, les mots-clés, faux tests,
citations inventées, omissions, avis inconnus, juges systématiques, biais d'ordre,
fausse indépendance, quotas, timeout, troncation, modèle substitué, contrat changé,
reprise non vérifiée et erreurs d'écriture de checkpoint.

## Non exécuté

`npm test`, `cargo test --workspace`, gate global, serveur/MCP, vraie génération
Ollama et validation artistique humaine ne sont pas exécutés dans ce snapshot.
Le point d'entrée `test_quality_elevation_loop.js` conserve l'assertion native
A-Team, à exécuter sur le checkout complet ; aucune substitution de dépendance
n'est présentée comme une preuve de cette intégration.

Aucune invocation native AGOW/GQWF/GVX/Morphogenèse et aucun gain causal ou
littéraire ne sont revendiqués. Les 50 tests établissent les mécanismes logiciels,
pas le talent d'un modèle. La qualification sur le scénario est laissée à l'essai
réel demandé par l'opérateur.

## Essai opérateur

```bash
node backend/tests/test_gqel_v2.cjs
node backend/tests/test_quality_elevation_loop.js
node scripts/experiments/run_writing_mission_gqel.cjs --model=llama3.1:8b --out=artifacts/gqel-v2-run
```

Le serveur Ollama doit être joignable et le tag exact installé. Le répertoire doit
être neuf. Inspecter critiques, refus, changements et consommations, pas seulement
`promoted`. Exécuter les validations globales avant fusion.
