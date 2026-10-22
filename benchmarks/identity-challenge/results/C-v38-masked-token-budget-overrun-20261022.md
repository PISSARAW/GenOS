# Défi C v3.8 — dépassement du plafond de tokens

Rapport brut : `runtime-llm-1792705369141.json`.
Modèle : `qwen2.5:14b`; scénario C; bras `self_model_masked`; budget fourni 8 192 tokens et 1 USD.

Le run a une inférence Ollama terminée, mais le worker est `blocked` sans texte de réponse. La raison de mission indique « Actual model cost 0 exceeds budget 1 », libellé trompeur. La base opérationnelle montre la réservation terminée avec `actual_cost_usd: 0`, `actual_tokens: 9304`, `token_ceiling: 8192`; c'est le plafond de tokens qui a été dépassé. L'oracle échoue sur `responsePresent`.

Ce résultat n'est pas une abstention. Le prochain run conserve un budget positif commun à tous les bras et relève le plafond de tokens avant toute génération.
