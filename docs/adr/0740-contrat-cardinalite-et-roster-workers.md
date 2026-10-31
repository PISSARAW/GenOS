# ADR 0740 — Contrat de cardinalité et de types des workers

- **Statut** : Accepté
- **Domaine** : Orchestration, dispatch, budgets
- **Décideurs** : Mainteneurs GenOS

## Contexte

Le runtime ne propageait pas une demande explicite de plusieurs workers dans le plan générique. Des plafonds de fanout ou de budget pouvaient réduire le roster sans bloquer le lancement. Le chemin local Windows contournait par ailleurs la composition normale. Les types existaient dans un registre, mais aucun contrat de roster ne permettait d'en demander une sélection automatique, une liste explicite ou la couverture complète.

## Décision

Le plan d'orchestration accepte un roster typé comprenant une cardinalité exacte d'agents et, séparément, une cardinalité de tâches. Les politiques de types sont `auto`, `all_registered`, `explicit`, `allowlist` et `mix` avec quotas. Les types sont validés contre le registre GenOS. Les demandes de cardinalité exacte sont atomiques : budget, capacité ou fanout insuffisants bloquent le plan avant le dispatch; le runtime ne réduit pas silencieusement le nombre.

Une demande « tous les types » exige au moins un worker pour chacun des types enregistrés. Si elle contredit un nombre exact plus petit, le plan est rejeté avant exécution.

## Conséquences

- Les demandes structurées et les formulations simples comme « 10 agents » sont normalisées avant la planification.
- Le plan expose les nombres demandés, sélectionnés et les types choisis.
- La capacité nominale maximale par orchestrateur passe à 20 pour permettre la qualification du registre complet; les paramètres d'environnement peuvent la réduire.
- Les tâches restent une dimension distincte du nombre d'agents; leur exécution doit être comptabilisée séparément.
- Les plafonds de budget restent des portes de sécurité. Ils ne peuvent plus transformer une demande exacte en succès partiel.
