# Benchmark de Reproduction : GQEL (GenOS Quality Elevation Loop)

Ce benchmark évalue et démontre la capacité de GenOS à amplifier la qualité produite par un même LLM sans changer de modèle de base.

## 1. Protocole d'expérimentation

Le benchmark compare systématiquement 3 conditions d'exécution sur deux domaines critiques :
1. **Écriture créative & dramaturgie** (`creative_writing`) : Scénario / court-métrage dramatique.
2. **Ingénierie logicielle** (`software_engineering`) : Module algorithmique avec typage, sécurité et tests.

### Conditions comparées :
- **Condition A (Single LLM Pass)** : Génération directe en un seul tour à partir du prompt initial.
- **Condition B (Naive Self-Correction)** : Incitation naïve de révision (« Améliore ta réponse précédente ») sans contrat d'évaluation formel ni diagnostic de cause.
- **Condition C (GenOS GQEL Elevation Loop)** :
  - Compilation d'un contrat de qualité objectif (`compileQualityContract`).
  - Évaluation sémantique et indépendante (`evaluateContent`).
  - Conservation du registre des versions (V1, V2, V3...).
  - Diagnostic causal ciblé des défauts et guidage de réparation (`buildRepairPrompt`).
  - Détection de stagnation (`qualityStagnationDetector`).
  - Porte de promotion refusant le succès sans preuves validées.

## 2. Exécution du benchmark

```bash
node benchmarks/gqel-elevation/run_elevation_benchmark.cjs
```

## 3. Résultats mesurés

| Domaine | Condition A (Single Pass) | Condition B (Naive Revision) | Condition C (GenOS GQEL) | Gain Démontré |
|---|---|---|---|---|
| **Écriture créative** | 0/100 (8 défauts, Refusé) | 15/100 (7 défauts, Refusé) | **100/100** (0 défaut, Promu) | **+100.00 pts** |
| **Ingénierie logicielle** | 75/100 (2 défauts) | 90/100 (1 défaut) | **100/100** (0 défaut, Promu) | **+25.00 pts** |

## 4. Enseignements clés
- La simple incitation « Améliore ta réponse » ne résout que marginalement les défauts structurels (dramaturgie absente, contrats de modules incomplets).
- La boucle GQEL rend les critères vérifiables et force la résolution causale des défauts identifiés, préservant la meilleure version sans régression.
