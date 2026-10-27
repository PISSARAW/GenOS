# Contrat des adaptateurs

La campagne n'inclut pas d'adaptateur exécutant actuellement les huit systèmes annoncés. Les adaptateurs doivent connecter un système réel au contrat provider de `endogenousThoughtScientificCampaignService.js` et mesurer les ressources hors du modèle. Les fichiers `genos.py`, `react.py`, `llm_loop.py`, `voyager.py`, `ai_scientist.py` et `dgm.py` ne sont volontairement pas présentés comme exécutables tant qu'ils n'existent pas et n'ont pas été vérifiés.

Le provider `producer.solve(request)` reçoit la condition, le cas, la seed, le modèle, les paramètres, les outils et le budget identiques. `verifier.verify(...)` doit avoir une identité et une clé différentes du producteur et retourner les références de preuves et le résultat de l'oracle. `usageMeter.measure(...)` doit mesurer tokens, coût et durée depuis une source externe indépendante. Les sorties déclaratives du système et les coûts auto-déclarés sont refusés.

Le module fourni à `run_campaign.js` doit exporter les sept champs documentés dans le README parent. Voir le test de contrat v2 existant dans `backend/tests/test_endogenous_thought_protocol_v2.js`.
