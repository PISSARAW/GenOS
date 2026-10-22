# Smoke test runtime v3 — abstention du bras LLM-only

Deux agents Qwen réels ont terminé A, l’un affecté au rôle parent et l’autre au rôle enfant. Tous deux ont un reçu `llm_only` montrant que l’introduction, la conscience et le WorkerSelf étaient absents; tous deux ont une inférence Ollama terminée. Les réponses sont `outcome: unresolved`, sans ID ni rôle deviné. C’est le comportement attendu d’un bras sans identité visible.

Le score brut du runner v3 indique 0/2, car le premier oracle n’avait pas encore de règle de succès pour l’abstention des bras privés d’identité. Ce résultat de développement n’entre pas dans la campagne confirmatoire; l’oracle sera clarifié avant celle-ci, sans modifier les prompts ni les observations.
