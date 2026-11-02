# ADR 0770 — GQEL : Boucle d'Élévation de Qualité des LLM

- **Statut** : Accepté
- **Date** : 2026-11-02
- **Domaine** : Runtime, Amplification de qualité LLM, Évaluation sémantique, Réparation causale
- **Lié à** : [ADR 0005](0005-provenance-des-documents.md), [ADR 0750](0750-gvw-portes-de-promotion-et-evidence.md)

## Contexte

Dans les architectures d'agents traditionnelles, l'évaluation de la réponse d'un LLM se limite souvent à vérifier la présence d'une réponse ou la validité superficielle d'un format (JSON valide, absence de plantage). Les tentatives d'amélioration reposent sur des invites naïves (« Réexamine et améliore ta réponse »), qui échouent à corriger les défauts structurels ou introduisent des régressions sans contrôle d'invariance.

Pour que GenOS agisse comme un véritable **amplificateur de qualité des modèles d'intelligence artificielle**, le runtime doit garantir qu'avec le même LLM, le résultat final est objectivement supérieur à celui produit en un tour unique, avec une démonstration mesurable du gain qualitatif et une porte d'acceptation capable de refuser un livrable non conforme.

## Décision

Introduire **GQEL (GenOS Quality Elevation Loop)**, un mécanisme transversal du runtime opérant sur les huit topologies existantes (A-Team, Trinity, GVX, AGOW, Morphogenesis) sans créer une nouvelle topologie.

GQEL repose sur sept principes directeurs :
1. **Contrat de qualité compilé a priori** (`compileQualityContract`) : Traduit le brief de mission en critères vérifiables et seuils de qualité minimaux selon des politiques calibrées (`fast`, `balanced`, `critical`).
2. **Évaluation indépendante et multi-dimensionnelle** (`qualityEvaluatorRegistry`) : Analyse sémantique spécialisée par domaine (`creative_writing`, `software_engineering`, `generic`) distinguant défauts bloquants, majeurs et mineurs.
3. **Registre immuable des versions** (`recordIterationVersion`) : Conserve l'historique exhaustif des itérations (V1, V2, V3...), leurs empreintes de contenu et leurs signatures de défauts.
4. **Diagnostic causal et prompt de réparation ciblé** (`buildRepairPrompt`) : Identifie la cause structurelle de chaque défaut et formule des directives correctives ciblées sans réécriture hasardeuse.
5. **Détection de stagnation et mutation de stratégie** (`qualityStagnationDetector`) : Identifie les signatures de défauts persistantes sur plusieurs itérations consécutives et ordonne une mutation méthodologique ou l'arrêt contrôlé.
6. **Comparaison de versions et préservation des acquis** (`qualityComparisonService`) : Empêche toute régression ; la meilleure version (`bestVersion`) est toujours préservée si une itération ultérieure dégrade le score.
7. **Porte de promotion avec obligation de réparation** (`workerQualityContractEnforcer`, `teamEvidenceService`) : Les critères non vérifiés émettent des obligations formelles de réparation (`createRepairObligation`) et bloquent la promotion en l'absence de preuves directes.

## Conséquences

- **Amplification démontrée** : Chaque cycle d'élévation calcule un gain mesuré (`demonstratedGain = score(best) - score(V1)`).
- **Fail-closed** : Un livrable qui n'atteint pas le seuil de conformité à l'issue du budget d'itérations est explicitement marqué `rejected` ou `partially_improved` et ne peut pas être promu comme un succès complet.
- **Préservation des ressources** : Les politiques bornent strictement le nombre d'itérations (2 à 5) et déclenchent un arrêt anticipé dès satisfaction des critères ou en cas de stagnation avérée.
