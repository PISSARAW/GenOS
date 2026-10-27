# Adapters ETT

`referenceSystems.js` fournit huit adaptateurs déterministes locaux pour exécuter le harnais de référence. Les comparateurs publiés sont des proxies jouets (style ReAct, mémoire/curriculum, classement d'hypothèses et mutation de stratégie), jamais Voyager, AI Scientist v2 ou DGM eux-mêmes. Aucun modèle externe n'est appelé.

Le contrat de référence est `createAdapter(systemId).solve({ scenarioId, difficulty, seed, observation, budget })` et retourne `{ answerId, evidenceRefs, actions }`. Le solveur ne reçoit pas l'oracle. `run_reference_campaign.js` remet la proposition et le secret à un vérificateur lancé dans un processus Node distinct. Le temps mesuré est le temps hôte ; aucun coût de tokens ou coût monétaire de LLM n'est disponible.

Pour des résultats publiables, remplacer ces proxies par des adaptateurs vers les systèmes réels, garder les limites de ressources appariées et configurer un mesureur d'usage fournisseur indépendant. L'exécuteur scientifique v2 reste disponible séparément pour les deux bras `full` et `llm_only`.
