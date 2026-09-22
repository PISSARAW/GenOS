# Cognitive Key Ablation Benchmark (A-F)

Benchmark d'ablation du Cognitive Key System (ADR 0033, point 7).

## Protocole

Six bras, même modèle / mêmes tokens / mêmes outils / mêmes problèmes :

| Bras | Description | Cognition |
| --- | --- | --- |
| A | 3 workers identiques | 1 recette dupliquée |
| B | 3 rôles métier (A-Team standard) | aucune recette |
| C | 3 prompts « philosophiques » (doctrine mentionnée) | aucune recette |
| D | 3 recettes optimisées pertinence seule | 3× le même composer sans diversité |
| E | 3 recettes pertinence + diversité | CognitivePortfolio |
| F | E + recombinaison/exaptation NCE | point 9 — non implémenté, mesuré comme tel |

Trois problèmes : `P1-scaling-degradation` (causalité), `P2-emergence-verification`
(émergence), `P3-hidden-coupling` (couplage). Les besoins cognitifs sont
inférés du texte de mission (vocabulaire `usefulWhen`).

## Ce que ce harness mesure — et ne mesure pas

Ce harness mesure la **couche structurelle** (sans LLM) : ce que chaque
bras produit au dispatch — recettes distinctes, distance cognitive
paire-à-paire (Jaccard sur opérations), couverture d'union des besoins,
réutilisation de clés, tensions inter-workers.

Il **ne mesure pas** la qualité des sorties des workers : cela requiert
des runs runtime complets (orchestrateur + modèle), exécution séparée.
Les métriques structurelles sont les prédicteurs à corréler avec les
résultats de sortie lors de ces runs.

## Résultats structurels (3 problèmes, moyenne)

| Métrique | A | B | C | D | E | F |
| --- | --- | --- | --- | --- | --- | --- |
| recettes distinctes | 1 | 0 | 0 | 1 | **3** | 3 |
| distance paire-à-paire | 0 | 0 | 0 | 0 | **0.51** | 0.51 |
| couverture d'union | 1.0 | 0 | 0 | 1.0 | **1.0** | 1.0 |
| réutilisation de clés | 8.0 | 0 | 0 | 8.0 | **5.67** | 5.67 |
| tensions inter-workers | 6 | 0 | 0 | 6 | **5.33** | 5.33 |

Constat central : **D (pertinence seule) converge exactement comme A**
(1 recette, distance 0) — les N meilleures clés individuellement se
recouvrent. **E produit 3 recettes distinctes sans perdre la couverture
d'union** (1.0) et en réduisant la redondance. C'est la démonstration
structurelle de la prémisse qualité-diversité du système.

B et C produisent zéro recette : leur différence vit dans les rôles
métier (B) ou le texte du prompt (C), pas dans une cognition composée —
le harness les mesure comme tels au lieu de les simuler.

## Exécution

```bash
node benchmarks/cognitive-key-ablation/ablation-harness.cjs   # JSON
node backend/tests/test_cognitive_ablation.js                 # assertions
```

## Runs runtime (TODO)

Pour la mesure de sortie (E > A/B/C/D reproductible), lancer des
missions réelles avec `GENOS_COGNITIVE_PHENOTYPE=1` (bras E) vs sans
(bras A/B/C) et corréler les métriques structurelles ci-dessus avec
la qualité des dossiers d'évidence. Le bras F attend le point 9 (NCE).
