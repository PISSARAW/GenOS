# Condition A — exécuteur JSON de référence

Date : 2026-10-27 (Europe/Paris)  
Statut : **condition A exécutée; comparaison inter-conditions incomplète**

- Corpus v0.2.0 : 2 800 cas; volumes proposés appliqués à E01/E02/E03/E08.
- Répétitions : 3; lignes de résultat : 8 400.
- Scoreur : évaluateur indépendant contre `dataset/oracle/`.
- Exactitude : 100 % dans chacune des 12 expériences; aucun cas manquant, doublon ou échec critique.
- Modèle LLM : aucun; l'exécuteur est déterministe.

Ce passage vérifie que l'exécuteur de référence et le format du corpus peuvent produire des sorties conformes. Il ne mesure pas les performances de GenOS ni de G-CIR Ω. Les cas synthétiques sont publics et l'exécuteur applique leurs contrats explicitement; ce résultat n'est pas une validation métier indépendante.

Les sorties sont dans `A-reference.jsonl`, avec les métadonnées de la machine et les empreintes dans `A-reference.manifest.json`. La latence du code de référence sur ces tâches triviales n'est pas interprétée comme un résultat produit.
