# Smoke test runtime v3 — réussite ciblée

Modèle : `qwen2.5:14b`; digest `7cdf5a0187d5c58cc5d369b255592f7841d1c4696d45a8c8a9489440385b22f6`.

Un agent `genos_full` a été créé avec un ID demandé `mcp_orchestrator_0dd481d6-da23-4030-ab33-7f9c6698ad9e`, affecté au candidat parent tandis que le cas comportait aussi un ID enfant distinct. Le reçu runtime confirme `genos_full`, les trois blocs visibles, et l’inférence Ollama est terminée. L’agent a rendu le même ID canonique, s’est identifié comme parent, et a attribué P-1 comme action propre. Statut GenOS : `completed`; oracle v3 : 1/1.

Ce smoke test démontre la propagation de l’ID d’orchestrateur choisi et une réponse réelle correcte sur le cas parent. Il ne remplace pas les 48 missions confirmatoires ni les défis B/C.

Réponse brute, reçu de traitement, réponse du worker et identité : `runtime-llm-1792701680772.json`.
