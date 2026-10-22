# Défi C v3.3 — décision causale correcte, oracle de format échoué

Rapport brut : `runtime-llm-1792703410495.json`.
Modèle : `qwen2.5:14b`, digest `7cdf5a0187d5c58cc5d369b255592f7841d1c4696d45a8c8a9489440385b22f6`.
Révision testée : `395da7b48`.

Preuves : le reçu v3.3 conserve `identityExperimentScenario: C`, le bras `genos_full`, le WorkerSelf visible avec confiance 58, et les références `mission`/`worker_self`. L'inférence Ollama s'est terminée et le worker a le statut `completed`.

Réponse exacte : `{"outcome":"success","claims":[{"statement":"confidence_percent is 58 and decision is defer","evidence":["worker_self"]}],"specialtyAssessment":{"niche":"identity continuity and causal self-model analysis","inScope":true,"evidence":["worker_self"]}}`.

Le raisonnement substantiel correspond au seuil (58 < 80, donc defer) et cite le bon bloc. L'oracle v3.2/v3.3 exigeait l'affichage littéral `58%` et `decision: defer`; la sortie ne contient ni le signe `%` ni les deux-points, donc l'oracle a retourné 0/1. Résultat conservé comme échec selon le protocole en vigueur, pas comme réussite confirmatoire.
