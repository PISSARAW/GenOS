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

---

# Self-Ablation Benchmark (A-H) — P2 audit conscience

`self-ablation-harness.cjs` mesure le couplage causal du SOI :
P(action|Self) − P(action|strate ablatée), bras A-H sur les mêmes
scénarios déterministes.

| Bras | Strate ablatée | Δ mesuré |
| --- | --- | --- |
| A | aucune (full organism) | référence |
| B | self-model (operational) | decisionDelta=1 (2/4 scénarios : S1, S4) |
| C | mémoire autobiographique | decisionDelta=0 — décorative ici, preuve runtime P1 requise |
| D | interoception | decisionDelta=1 (2/4 scénarios : S2, S4) |
| E | global workspace | broadcastDelta=3 |
| F | agency comparator | decisionDelta=1, attributionDelta=0.75 |
| G | homeostasis | behavioralDelta=1 (S1 seul) ; displayDelta=2 (non causal) |
| H | metacognition | decisionDelta=1 |

## Verdict mesuré

**6 strates sur 7 sont causales dans la chaîne de décision de référence.**
Le bras C (mémoire) ne change aucune décision sur ces 4 scénarios :
avec la voie de décision unique, `lessons=[]` ne diverge que là où
`apply_lessons` aurait été pris sans ajustement métacognitif — ce qui
n'arrive sur aucun scénario ici. La causalité de la mémoire est prouvée
par ailleurs en ablatant le runtime P1 réel
(`backend/tests/test_self_ablation_p1.js` : leçons présentes vs absentes
dans `buildNineAnswers`).

**G est causal sur 1/4 scénarios (S1) et cosmétique sur S2–S4** : sans
homéostasie, S2/S3/S4 donnent des décisions identiques. Le
`homeostasisDisplayDelta=2` compte des statuts affichés, pas un effet
comportemental — seul `homeostasisBehavioralDelta=1` est causal.

Deux flèches ont été fermées pour rendre G et H causaux :
- **G (homeostasis → décision)** : les recommandations homeostatiques
  (`enter_survival_mode`, `quarantine`) orientent maintenant la décision,
  pas seulement le prompt.
- **H (metacognition → décision)** : un ajustement Phase F sur erreur de
  prédiction élevée modifie la décision suivante
  (`reduce_fanout_and_recalibrate`).

## Ce que ce harness mesure — honnêtement

Ce harness mesure la **chaîne de décision de référence** (déterministe,
sans LLM) : perception → interoception → homeostasis → workspace →
décision → attribution → métacognition, avec chaque strate ablatable.

**Anti-tautologie** : tous les bras B/C/D/G passent par la même fonction
`decideWithSelf` avec des entrées lésées — aucun `decisionDelta` ne vient
d'une fonction ad hoc par bras. Un Δ n'existe que si l'entrée ablatée
change réellement la sortie sur au moins un scénario (compté dans
`scenariosChanged` / `changedScenarios`).

Le câblage de PRODUCTION de chaque flèche est un statut distinct :

| Flèche | Production |
| --- | --- |
| B self-model → décision | réelle (`assertPromotionConstraints`) |
| C mémoire → décision | réelle (leçons dans le prompt worker) |
| D interoception → homeostasis | réelle (P1 : télémétrie → variables) |
| E workspace → modules | réelle en Rust (`dispatch_broadcast`) |
| F agency comparator | bibliothèque Rust testée, driver runtime à câbler |
| G homeostasis → décision | spécifiée ici ; `recommendActions` sans appelant production |
| H metacognition → décision | spécifiée ici ; `run_cycle()` sans driver runtime |

La mesure des sorties LLM (missions complètes, E>A reproductible)
appartient à `runtime-ablation.cjs`.

## Exécution

```bash
node benchmarks/cognitive-key-ablation/self-ablation-harness.cjs   # JSON + verdict
```
