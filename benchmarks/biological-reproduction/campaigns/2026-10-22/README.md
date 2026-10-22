# Campagne de reproduction GenOS — 22 octobre 2026

Exécution dans le worktree `D:\GenOS\identity-real-llm-worktree`. Les sept commandes de la batterie et Qwen S07 ont été exécutés sur D:. Le commit testé par les relances finales est `ebf7bbf722b68a3f8e17ba065d02071f481c6727`. Les sorties brutes et codes de sortie sont sous `logs/`.

## Résultats

- Les quatre suites Rust passent : cycle autonome (9 tests), rejeu de lignée (3), graine/idempotence (2), campagne CLI biologique (1).
- Le test transactionnel backend passe (3 vérifications).
- La fusion chimérique passe comme **simulation de métadonnées** (`runtime_agent_created: false`); elle ne démontre pas la naissance d’un agent runtime.
- Les 19 appels MCP `status` passent avec un bail limité aux outils du test. Le test couvre l’enregistrement et le dispatch `status`, pas une naissance runtime.
- Qwen `qwen2.5:14b`, graine 7, passe à la tentative 3 : les trois types de relation et leurs directions correspondent exactement à l’oracle du graphe de fixture. La tentative 2 a expiré pendant que le runtime local était bloqué sur un autre modèle Ollama; le timeout est conservé séparément.
- `npm test` passe (code 0).
- `cargo test --workspace` passe (code 0), y compris les suites et doctests.
- Le contrôle global `python scripts/ci/check_code_quality.py` échoue : 21 violations dans 8 fichiers hors du périmètre des correctifs de reproduction. Son journal et son code de sortie sont conservés.

## Défauts corrigés

1. Le handler chimérique bloquait une simulation de métadonnées sur une feature Rust inexistante. Le probe Rust a été retiré; le contrat indique toujours `metadata_simulation` et l’absence de création d’agent.
2. Les fixtures chimériques ne créaient pas les identités référencées, en contradiction avec les clés étrangères. Le test crée désormais trois agents de fixture uniques.
3. `listRelations` triait sur `created_at`, absent du schéma `agent_relations`. La requête trie maintenant sur `updated_at`, champ garanti par les migrations, avec repli de `createdAt` sur ce champ.
4. Pour les outils dont le CLI ne connaît pas la feature, une requête `status` peut utiliser l’état backend. Les erreurs d’autorisation et les erreurs de feature sur les autres actions restent bloquantes; les assertions vérifient ces frontières.

## Limite de preuve

Cette campagne exécute les sept commandes existantes proposées et un scénario Qwen. Elle ne couvre pas les expériences A01–D03 ni les démonstrations complètes décrites dans le document source. Elle ne prouve donc pas la création de triplets fonctionnels, de chimères exécutables ou une évolution cognitive intergénérationnelle.
