# Run réel LLM — échec de bootstrap A/E

- Date : 2026-10-22 (Europe/Paris)
- Révision testée : `616bcaab68ce46eea574e40958d20241cf5ee461`
- Modèle local : `qwen2.5:14b` via Ollama `127.0.0.1:11434`
- Runner : `benchmarks/cognitive-key-ablation/runtime-ablation.cjs --model qwen2.5:14b --missions 1 --timeout 300`
- Résultat : ÉCHEC, aucune paire exploitable, 0/2 missions acceptées.

## Observations

1. Le préchauffage Ollama a réussi. `/api/ps` a confirmé le chargement du modèle (digest `7cdf5a0187d5c58cc5d369b255592f7841d1c4696d45a8c8a9489440385b22f6`). Cela prouve que le serveur LLM a répondu, mais pas qu’un agent GenOS a achevé une mission.
2. Le bras A a été refusé par le runner avec stdout/stderr vides après son délai interne de 30 s. Aucun ID d’orchestrateur n’a été recueilli.
3. Le bras E a été refusé au premier bootstrap GenOS : `GENOS_ADMIN_PASSWORD must be configured`. Aucun ID d’orchestrateur n’a été recueilli.
4. Le collecteur a échoué sur `SQLITE_ERROR: no such table: cognitive_recipe_performance`. Il lit `backend/genos.db`, alors que cette exécution a créé sa base runtime dans `.genos/data/operational/genos.db`.

## Interprétation

Ce lancement ne constitue pas une expérience valide : aucun dossier, aucune décision d’agent et aucune mesure A/E ne sont disponibles. La présence du modèle chargé ne compte pas comme une réussite de l’agent. Prochaine correction : configurer explicitement l’environnement synthétique, aligner le chemin SQLite du collecteur sur `GENOS_DB_PATH` et conserver stdout/stderr ainsi que les IDs de run même en cas d’échec.
