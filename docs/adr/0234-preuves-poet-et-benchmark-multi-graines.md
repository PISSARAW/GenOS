# ADR 0234 — Preuves POET et benchmark multi-graines

## Décision

Chaque tentative matérialise un snapshot de l’environnement dans un répertoire distinct. Le modèle ne modifie pas le modèle d’environnement utilisé par la tentative suivante. Un artefact doit être un fichier nouveau ou changé, confiné au workspace, de taille bornée, dont le SHA-256 figure dans le snapshot vérifié. Les chemins protégés du contrat de vérification doivent rester identiques au snapshot initial.

Seul `AGENT_COMPLETED` permet de vérifier un artefact. Un échec, un arrêt ou une échéance ne devient pas un succès. Une deadline couvre le lancement, l’attente de terminaison et la vérification ; elle demande aussi l’arrêt du runtime. Un événement de complétion prématuré ne permet plus une attente infinie de la promesse de lancement.

Le split est contrôlé par les IDs et les fingerprints de son contenu (objectifs, contraintes, fichiers). La sélection de l’agent est faite sur l’entraînement puis figée avant le split tenu à l’écart. Le benchmark crée deux identités exécutantes neuves pour une politique identique afin de ne pas réutiliser un organisme dormant ni ses apprentissages entre les splits. Ces identités restent soumises aux contrôles normaux du runtime.

## Protocole de production

Dans PowerShell : `$env:GENOS_POET_EXECUTOR='local'; node backend/bin/genos-poet-benchmark.cjs 1,7,42`.

Le harness utilise `agentRuntimeAdapter.startMission`, les contrats de stratégie, les permissions, les budgets et les fournisseurs configurés. Il n’utilise aucun mock. Il conserve SQLite, snapshots, fichiers, preuves d’exécution et rapport dans `.genos/benchmarks/poet/`. Le rapport porte révision, hashes du protocole, graines, budgets et provenance runtime. Le budget demandé est de 140 000 tokens, 1 USD et 120 s par tentative ; l’allocation effective du runtime peut être plus basse et figure dans sa télémétrie. Les commandes de vérification restent soumises à l’allowlist du sandbox.

Les entrées et la vérification sont reproductibles. Les réponses du fournisseur LLM ne sont pas garanties déterministes : une graine définit les problèmes, pas l’aléatoire interne du fournisseur. La famille actuelle est synthétique et arithmétique ; elle ne démontre pas une généralisation à des tâches réelles.

## Résultats du 1er octobre 2026

Le runtime `local-codex-runtime` a exécuté six missions sur `ollama://qwen2.5-coder:7b`, graines 1, 7 et 42 : **0/3 entraînement et 0/3 tenu à l’écart**. Trois fichiers ont été capturés puis rejetés par le véritable vérificateur pour résultat arithmétique incorrect ; trois missions terminées n’ont pas produit de fichier exploitable et ont été refusées. Ces scores ne constituent pas une preuve de bonne généralisation.

Rapport local : `.genos/benchmarks/poet/43a06c63-a857-4ad8-a318-6074de1b6e60/report.json`. Ses hashes de protocole décrivent la version testée avant ajout des derniers champs de provenance du rapport ; il ne faut pas l’attribuer à un HEAD ultérieur sans réexécuter.

Les essais Codex ont rencontré des arrêts de budget, puis une complétion sans fichier. Ils ne valident pas une chaîne positive Codex→POET. Les gates ont refusé ces issues. Le benchmark a aussi révélé et corrigé une dépendance circulaire du garage et un import `path` manquant dans le runtime.

## Tests

`node backend/tests/test_poet_execution_evidence.js` vérifie les refus : artefact inchangé, événement d’échec, lancement bloqué après complétion, contrat modifié, split copié, sortie du workspace. `node backend/tests/test_nce_workflows_e2e.js` vérifie le chemin positif avec runtime contrôlé, vrais fichiers, snapshots et commande de vérification. Il reste nécessaire d’étendre le corpus et d’obtenir des succès réels avant toute revendication de généralisation utile.
