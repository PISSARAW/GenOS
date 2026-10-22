# Défi C v3.7 — inférence terminée, blocage par budget nul

Rapport brut : `runtime-llm-1792705049747.json`.
Modèle : `qwen2.5:14b`; bras `self_model_masked`; scénario C; reçu de traitement présent.

Ollama a signalé une inférence terminée après 260 419 ms. GenOS a ensuite mis le worker en statut `blocked` avec `Every model route failed. ollama://qwen2.5:14b: Actual model cost 0 exceeds budget 0.` Aucun texte de réponse n'est parvenu au rapport et l'oracle a échoué sur `responsePresent`.

Le runner ne fournissait pas de budget explicite; le runtime héritait donc d'un plafond de coût nul. Ce run n'est ni une abstention ni une mesure comportementale valide. Aucun modèle concurrent n'a été déchargé.
