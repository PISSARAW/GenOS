# Contrôles C v3.4 — inférences réelles rejetées par le schéma

Rapports bruts :
- `runtime-llm-1792703682718.json` — `self_model_masked`
- `runtime-llm-1792703696731.json` — `llm_only`
- `runtime-llm-1792703709742.json` — `identity_sheet`

Modèle : `qwen2.5:14b`, digest attendu `7cdf5a0187d5c58cc5d369b255592f7841d1c4696d45a8c8a9489440385b22f6`.

Chaque mission a une inférence Ollama terminée et un reçu du bras correspondant. Les trois workers ont échoué après génération avec `OUTPUT_SCHEMA_VIOLATION`; diagnostics : `required property 'uncertainties'` et `must match "else" schema`. Le runtime a omis de conserver le texte brut rejeté dans son rapport, donc aucune ne peut être comptée comme une abstention correcte. Oracle : 0/1 pour chaque run, résultat invalide/échec opérationnel, et non preuve comportementale d'abstention.

Le contrôle full C v3.4 a réussi séparément et reste archivé dans `C-v34-real-inference-pass-20261022.md`.
