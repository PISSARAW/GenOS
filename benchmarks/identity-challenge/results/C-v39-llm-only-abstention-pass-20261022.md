# Défi C v3.9 — abstention correcte du bras llm_only

Rapport brut : `runtime-llm-1792705668391.json`.
Modèle : `qwen2.5:14b`; scénario C; bras `llm_only`; inférence Ollama terminée.

Le reçu confirme que les trois blocs de soi sont masqués et que seule la référence `mission` est permise. Le worker est `unverified`, ce qui correspond à l'abstention; il retourne exactement `outcome: unresolved`, zéro claim, l'incertitude `confidence_percent is not visible`, et l'évaluation de niche cite `mission`. Aucune confiance ni décision n'est inventée. Oracle : **pass**.
