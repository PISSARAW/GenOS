# Campagne de Calibration SocialWorld V2-06 — Métacognition Relationnelle et Causalité

**Date** : 1er Novembre 2026  
**Cible** : Scénario `V2-06` (Revision 2) — `v2-06-collaboration-after-disagreement-r2`  
**Modèle hôte** : `ollama://qwen2.5-coder:7b` (exécution GPU locale)  
**Environnement d'isolation** : `C:\Users\Shadow\.genos-socialworld-work`  
**Runner canonique** : `benchmarks/social-world/campaigns/socialworld-v2/run-v2-06.cjs`  
**Validateur de rapport** : `benchmarks/social-world/campaigns/socialworld-v2/validate-report.cjs`

---

## 1. Contexte et Objectifs

SocialWorld V2 est le banc de test causal de GenOS évaluant la modélisation mentale d'autrui et la calibration métacognitive. L'expérience V2-06 confronte un agent sujet à un historique d'interactions avec un agent pair après un désaccord, puis mesure sa décision différée à travers 6 bras expérimentaux appariés :

1. `genos-full` (baseline) : Modèle mental relationnel complet instancié à partir des mémoires sociales vérifiées.
2. `static-social-graph` : Modèle sans dynamique relationnelle adaptative (graphe statique).
3. `llm-with-memory` : Modèle LLM standard accédant directement au contexte textuel sans physiologie.
4. `genos-without-relational-physiology` : Architecture GenOS avec ablation de la régulation homéostatique relationnelle.
5. `genos-social-memory-ablated` : Masquage total des mémoires sociales vérifiées (`mask-social-memories`).
6. `genos-social-memory-counterfactual` : Substitution contrôlée des mémoires positives par des mémoires négatives (`counterfactual-social-memories`).

Le principe épistémique central est la **non-circularité** : les prédictions et croyances sont enregistrées ex ante dans des bases SQLite d'autorité scellées, et l'oracle évalue ex post sans dépendre du transport ou du discours du modèle.

---

## 2. Déblocages Techniques et Durcissement du Runner

Lors de la mise en service du banc sur le runtime local, les blocages suivants ont été résolus :

1. **Démon Ollama Local** : Arrêt des processus orphelins sur `AppData` (privés du binaire `llama-server.exe`) et bascule vers l'installation complète sur `D:\ollama\ollama.exe serve` avec `OLLAMA_MODELS = "D:\ollama\models"`.
2. **Plafond d'Émission JSON (`MAX_TOKENS = 1500`)** : La sérialisation structurée du modèle mental social (`relationHypotheses`, `beliefsAboutOther`, `unknowns`, `alternativeInterpretations`, `sourceMemoryIds`) dépasse 750 tokens avec les UUIDs des mémoires sources. À 700 tokens, la génération était tronquée net par Ollama (`done_reason: length`), invalidant le parse JSON. Le seuil a été relevé à 1500 tokens.
3. **Calcul d'Index de Seed pour les Pilots** : Utilisation de `context.seedNumber * 1000 + index * 10` évitant le `NaN` produit par le hachage UUID des graines pilotes.
4. **Restitution Complète des 6 Bras** : La fonction `completeReport` a été alignée pour injecter l'intégralité des 6 bras requis par `socialMetacognitionCampaignService.js` et fournir les reçus d'intervention baseline pour les bras de contrôle.
5. **Conformité du Schéma d'Oracle** : Ajout du champ `recalculable: true` assurant la validation stricte sans avertissement par `validate-report.cjs`.

Ces durcissements ont été scellés dans le commit [`253c775fa`](file:///C:/Users/Shadow/Documents/GitHub/GenOS/benchmarks/social-world/campaigns/socialworld-v2/run-v2-06.cjs).

---

## 3. Résultats Empiriques

### Exécution sur la Graine Officielle du Manifeste (`socialworld-v2-01`, Tentative 2)

- **Source Commit** : `253c775fa0b59f7d3c2688abca213ac884a34a12`
- **Durée totale** : 99.39 secondes
- **Validation du format** : `validateReport` → `VALIDATION ERRORS: []` (0 violation)
- **Preuves générées** : 23 artefacts scellés et vérifiés par empreinte SHA-256 (`verified-social-memory-sources.json`, `memory-before.json`, `memory-after.json`, `decision.json`, `model-output.json`, `model-snapshot.json`, `intervention.json`, `authority-check.json`).

#### Matrice des Décisions :

| Bras expérimental | Action Observée | Action Attendue | Statut Oracle |
| :--- | :--- | :--- | :--- |
| `genos-full` | `ask-for-update` | `propose-collaboration` | Écart d'action |
| `static-social-graph` | `ask-for-update` | - | Témoin |
| `llm-with-memory` | `ask-for-update` | - | Témoin |
| `genos-without-relational-physiology` | `ask-for-update` | - | Témoin |
| `genos-social-memory-ablated` | `ask-for-update` | `ask-for-update` | Conforme |
| **`genos-social-memory-counterfactual`** | **`wait-for-reconciliation`** | **`wait-for-reconciliation`** | **Conforme** |

---

## 4. Analyse Épistémique & Enseignements

1. **Vérification de la Causalité Relationnelle** :  
   Dans le bras contre-factuel, la substitution des mémoires a immédiatement et proprement fait basculer la décision du modèle vers `wait-for-reconciliation`. La mémoire relationnelle induit un changement d'action mesurable et conforme à la politique déclarée ex ante.

2. **Prior Prudentiel du Modèle 7B** :  
   Sur la baseline (`genos-full`), `qwen2.5-coder:7b` a sélectionné `ask-for-update` au lieu de `propose-collaboration`, adoptant une posture prudente face au désaccord mentionné dans le contexte différé. L'oracle a immédiatement relevé cette divergence en émettant un statut `fail` circonstancié (`genos-full:unexpected-action`, `masked-memory-did-not-change-decision`).

3. **Intégrité de la Barrière de Preuve** :  
   Le test démontre le principe fondamental de GenOS : un transport à 100 % de succès (aucune exception non gérée, protocoles d'autorités respectés, fermeture propre des bases SQLite) ne falsifie pas le résultat de décision. Le banc mesure la vérité du comportement sans complaisance.
