# Rapport du pilote Qwen — 2026-10-30

## Résultat

Le parcours s'est arrêté à la mission 01. **Aucun run n'a satisfait les gates du worker**, donc les missions 02–12 et les répétitions ne sont pas lancées. Le protocole exige de vérifier la route modèle et les artefacts avant de poursuivre.

Le worker GenOS a toutefois appelé Qwen depuis le runtime situé sur D:. Cela prouve le transport jusqu'au modèle, mais pas la réussite fonctionnelle de la mission.

## Runs observés

| Modèle | Run GenOS | Statut | Observation |
|---|---|---|---|
| `qwen2.5-coder:7b` | `strategy_run_1793338173830_254cf29b` | `failed` | Appel Ollama mesuré : 2 432 tokens d'entrée, 23 de sortie. Le worker a rendu `unresolved` : « Insufficient evidence to complete the task. » |
| `qwen2.5-coder:7b` | `strategy_run_1793338407087_52e4a0e5` | `failed` | Appel Ollama mesuré : 2 484 tokens d'entrée, 40 de sortie. Malgré un objectif et une référence de fixture plus explicites, Qwen a rendu `unresolved`, en demandant une capacité machine qui n'était pas nécessaire. |
| `qwen2.5-coder:32b` | `strategy_run_1793338735271_5e278a49` | `failed` | Appel au modèle terminé en environ 102 s. La barrière a rejeté la sortie : `OUTPUT_SCHEMA_VIOLATION`, champ `artifactText` absent et branche conditionnelle non satisfaite. |
| `qwen2.5-coder:32b` | `strategy_run_1793339027230_212ac305` | `failed` | Même violation de schéma. Le retry suivant a été bloqué par la réservation du budget partagé. |

Les runs et leur base SQLite sont conservés sous `D:\GenOS-runs\qwen-worker-missions-*`. Les événements `LOCAL_WORKER_STARTED`, `MODEL_ROUTE_FAILED` et `AGENT_FAILED` ainsi que les lignes `strategy_execution_runs` fournissent les receipts d'inspection. Le serveur Ollama temporaire sur `127.0.0.1:11435` a été arrêté après les essais.

## Blocages de lancement

- Un `dispatch_worker` local lancé seul par `backend/bin/genos-orchestrate.cjs` est refusé avec `A dispatched worker requires its parent model budget scope.` Le run rejeté n'a émis aucun appel modèle.
- L'essai préalable via `genos_orchestrate` MCP a répondu `accepted` et créé `mission_a8712721-63eb-4ae9-9c61-541bfb9901b9`, mais l'inspection de la base de l'application n'a montré ni worker enfant ni run d'exécution. Après la sortie du runner, la mission a été fermée en statut `failed` avec le service de cycle de vie GenOS. Elle n'est pas comptée comme un lancement Qwen réussi.
- Les essais d'inférence ont utilisé une copie isolée d'une base de qualification et un scope budgétaire explicitement persisté dans cette copie. Aucun plafond ni gate de la base de travail n'a été modifié.
- L'Ollama visible sur C: (`0.40.13`) ne contient pas `llama-server.exe`; le modèle Qwen présent sur D: ne pouvait pas être chargé par cette instance. L'instance `D:\Ollama\ollama.exe` (`0.40.12`) possède le runtime et les modèles. Elle a été lancée temporairement sur le port 11435 pour ces essais.

## Suite

### Reprise sur D:

Après correction du schéma et création du scope parent, le run `strategy_run_1793339528135_6151967b` a appelé `qwen2.5-coder:32b` et obtenu `completed`. **La mission 01 échoue à la vérification indépendante** : le dossier annonce deux charges de 40 minutes sans affectation, alors que les durées totalisent 70 minutes. `missionOutcome.status` vaut `unmeasured`. La base et les événements sont conservés dans `D:\GenOS-runs\qwen-reprise-92a2647e5b5e4a12b7d3e3197d6ebc73\protocol.sqlite`. Ce run révèle que la validation du dossier ne vérifie pas la correction arithmétique.

La reprise avec le 7B a effectué deux appels, tous deux `unresolved`, sans rejet de réservation. Le budget parent était de 16 000 tokens et le plafond du worker de 6 000 par appel.

Un autre run sur une base neuve, `strategy_run_1793339829392_be780cd7`, a appelé Qwen 32B et a terminé : A+D = 17+19 = 36, B+C = 23+11 = 34, total 70 et makespan 36. Ces calculs et l'unicité des quatre affectations ont été contrôlés indépendamment. Le run conserve `missionOutcome.status: unmeasured` : ce contrôle externe ne constitue pas une attestation sémantique GenOS. Sa base est `D:\GenOS-runs\qwen-validation-d788b80f9ff04b119d4ea3b4ba301375\protocol.sqlite`. Les répétitions et le cas négatif restent à exécuter.

La reprise a franchi les blocages de budget et de schéma. Répéter la mission 01 avec le même prompt et le même snapshot, ajouter son cas négatif, puis poursuivre les cartes 02–12. Pour chaque résultat, distinguer le statut terminal de l'exécution, le contrôle indépendant et une éventuelle attestation sémantique GenOS. Ne compter ni `accepted`, ni `LOCAL_WORKER_STARTED`, ni un texte de modèle seul comme réussite.
