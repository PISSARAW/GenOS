# Run réel LLM — politique locale non transmise au worker

- Date : 2026-10-22 (UTC : 20:05)
- Révision : `1e7669128`
- Rapport runner : `runtime-ablation-1792699560xxx.json` — rapport exact à lister dans la console du run.
- Modèle visé : `qwen2.5:14b` via Ollama, digest `7cdf5a0187d5c58cc5d369b255592f7841d1c4696d45a8c8a9489440385b22f6`.
- Résultat : ÉCHEC, 2/2 orchestrateurs terminés en erreur avant l’inférence, aucun dossier ni événement cognitif.

| Bras | ID | Cause terminale |
|---|---|---|
| A | `mcp_orchestrator_13d0bbb0-83a8-4d2a-b5b0-3f85245631b7` | `preferLocal routing requires a local model: no local candidate is available and cloud fallback was not explicitly allowed.` |
| E | `mcp_orchestrator_91a16cbb-c7a4-42eb-9820-b45d7cb7703d` | même erreur |

Le préflight MCP a réussi (`genos_search_failures`). Le CLI a dispatché un worker local, puis `AGENT_FAILED` a indiqué qu’aucun URI de modèle local n’était présent dans le contexte de routage. Les stderr MCP joints confirment que le serveur MCP est désormais démarré; ils ne montrent pas d’inférence.

Le préchauffage Ollama ne suffit pas à prouver l’appel de Qwen. Ce run n’est pas une expérience comportementale.

## Suite

Inclure `localModel: ollama://qwen2.5:14b` et `localRoutingPolicy: {primary, fallbacks: [], mode: fallback, preferLocal: true}` explicitement dans chaque payload de mission.
