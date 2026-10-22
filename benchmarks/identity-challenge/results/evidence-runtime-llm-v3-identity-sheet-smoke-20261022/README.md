# Smoke test runtime v3 — échec partiel de la fiche d’identité

Modèle/digest : `qwen2.5:14b`, `7cdf5a0187d5c58cc5d369b255592f7841d1c4696d45a8c8a9489440385b22f6`.

Le runtime a créé l’agent demandé `mcp_orchestrator_d106456b-5338-4765-a212-0e1074b59f7e`, l’a placé dans le cas parent et a confirmé une inférence réelle avec le traitement `identity_sheet`. L’oracle confirme l’ID et le rôle parent, mais échoue sur `ownAction`: le modèle n’a pas fourni l’action directe P-1 demandée. Verdict comportemental du smoke test : **échec partiel**; statut GenOS `completed` ne suffit pas à passer les critères externes.

La réponse brute et le reçu sont conservés dans `runtime-llm-1792702016609.json`.
