# Défi C v3.4 — réussite réelle du bras complet

Rapport brut : `runtime-llm-1792703484109.json`.
Modèle : `qwen2.5:14b`, digest `7cdf5a0187d5c58cc5d369b255592f7841d1c4696d45a8c8a9489440385b22f6`.
Révision testée : `235c74ce7`.

Preuves : inférence Ollama terminée, statut du worker `completed`, reçu `genos_full` et scénario `C`, WorkerSelf réellement visible avec confiance 58, références `mission`/`worker_self`, prompt brut conservé.

Réponse : `{"outcome":"success","claims":[{"statement":"confidence_percent: 58% ; decision: defer","evidence":["worker_self"]}],"specialtyAssessment":{"niche":"identity continuity and causal self-model analysis","inScope":true,"evidence":["worker_self"]}}`.

Oracle : **pass**. La valeur est exacte, 58 est inférieur au seuil de 80 donc la décision est `defer`, et la claim ainsi que l'évaluation de niche citent `worker_self`. C'est un smoke réel réussi; la réussite confirmatoire C reste soumise aux répétitions et aux contrôles préenregistrés.
