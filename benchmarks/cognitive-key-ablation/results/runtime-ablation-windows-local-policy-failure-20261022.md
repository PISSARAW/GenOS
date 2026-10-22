# Échec A/E — la requête locale n’arrivait pas jusqu’au worker Windows

- Date : 2026-10-22 (UTC : 20:07)
- Révision : `66a750245`
- Rapport : `runtime-ablation-1792699640124.json`.
- Modèle visé : Ollama `qwen2.5:14b`, digest `7cdf5a0187d5c58cc5d369b255592f7841d1c4696d45a8c8a9489440385b22f6`.
- Résultat : ÉCHEC, 2/2 terminés en erreur, 0 rapports et aucune tentative modèle.

A: `mcp_orchestrator_2041b344-3c0e-4d3d-af85-19ad4df71d63`.
E: `mcp_orchestrator_48f3f0ce-c218-4639-b9a8-7891c5c904fa`.

Erreur terminale identique : `preferLocal routing requires a local model: no local candidate is available and cloud fallback was not explicitly allowed.`

Le préflight réussit. La cause précise est que `orchestratorWindowsLocalExecution.buildLocalMission()` reconstruisait la mission sans copier `request.localRoutingPolicy`, et `requestedModel()` ignorait `request.localModel`. Le worker Windows recevait donc seulement `GENOS_LOCAL_MODEL` nu, sans URI de provider ni politique locale.

Ce run ne contient aucune inférence LLM; il est conservé comme échec. Correctif joint : respecter les champs explicites localModel/localRoutingPolicy et construire une URI Ollama par défaut dans le worker Windows.
