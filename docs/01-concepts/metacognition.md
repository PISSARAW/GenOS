# Métacognition

- **Statut** : Implémenté (fonctionnel)
- **Portée** : ECE, Brier, AUC type-2 et surconfiance sur des prévisions antérieures à l'exécution, résolues par des preuves indépendantes signées.
- **Dernière revue** : 2026-10-24

## 1. Définition du domaine

La métacognition est la cognition sur la cognition : penser à sa propre pensée, surveiller ses apprentissages, réguler ses stratégies. Dans GenOS, la métacognition désigne les mécanismes qui mesurent la calibration de la confiance et des prédictions d'un agent.

## 2. Modèle mathématique ou logique

Écart d'attendu (ECE) :

$$
ECE = \sum_{b=1}^{B} \frac{n_b}{N} \left| \text{confiance}_b - \text{précision}_b \right|
$$

Score de Brier :

$$
Brier = \frac{1}{N} \sum_{i=1}^{N} (confiance_i - correct_i)^2
$$

AUC type-2 mesure la sensibilité métacognitive (distinction entre jugements corrects et incorrects par niveau de confiance).

## 3. Analogies biologiques et limites réelles

La métacognition biologique implique le suivi des performances et l'ajustement des stratégies. Dans GenOS, les calculs comparent une probabilité gelée à une issue binaire attestée séparément. L'analogie est fonctionnelle, sans homologie neurale.

[Fleming et Lau (2014)](https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2014.00443/full) distinguent biais, sensibilité et efficacité métacognitive. Ici, la surconfiance mesure un biais et l'AUC type-2 une discrimination descriptive ; elle ne mesure pas `meta-d′/d′` et dépend des performances de premier ordre. Le Brier ne doit jamais comparer deux transformations de la même erreur : cela rendrait le résultat circulaire.

## 4. Cas d'usage et objectifs métier

- Resserrer le plancher d'opt-out quand la surconfiance est détectée.
- Imposer `requiresEvidenceBeforePromotion` et `requireIndependentEvidence`.
- Ajouter une directive `[ABSTENTION]` au prompt quand l'intégrité est faible.

## 5. Exemples concrets

- `metacognitiveForecastService.capture()` fige la probabilité d'un run encore `planned` ; son rejeu ne permet pas de la modifier.
- `metacognitiveForecastService.observe()` résout cette prévision depuis un reçu indépendant signé et lié au run, à l'agent et au périmètre organisation/projet.
- `metacognitionBenchService.runBench()` lit ces paires et calcule ECE, Brier, AUC type-2. Les entrées CoreSelf historiques ne sont pas scorées.
- Les faiblesses (max 3) sont persistées via `mergeLearned` et resurgissent dans les prompts.
- `abstentionService.evaluateAbstention` refuse si intégrité < 0,6, incertitude ≥ 0,8, confiance < plancher avec incertitude ≥ 0,5.

## 6. Schéma ou diagramme

```text
[Prévision immuable avant exécution] + [Issue binaire vérifiée séparément]
           ↓
[metacognitionBenchService : ECE, Brier, AUC type-2]
           ↓
[Surconfiance → plancher d'opt-out + 0,2 (plafond 0,8)]
           ↓
[Gates : preuve requise avant promotion, indépendante]
```

## 7. Architecture Technique

`strategyExecutionService` capture la prévision à la création du run et observe les preuves après l'événement terminal. `metacognitiveForecastStore` conserve les prévisions et résolutions dans SQLite ; `metacognitiveForecastService` valide empreintes, scope, signature et ordre temporel. Le prior par défaut est `expectedSuccess` du self-model, sinon 0,58, explicitement étiqueté `operational_success_prior`. Un appelant peut fournir un prior avant l'exécution.

`metacognitionBenchService` dépend de ce service et de `selfModelService`. Il exige ≥ 10 issues résolues ; sinon `insufficient_data` remplace aussi le rapport en cache. Les comptes `forecasts`, `unresolved` et `invalid` exposent la couverture de la fenêtre des 2 000 dernières prévisions. Les anciens rapports sans `policyVersion: 2` n'ajustent plus le plancher d'abstention.

`CoreSelf.causalConfidence` reste une heuristique rétrospective d'attribution ; elle ne constitue plus une probabilité évaluée par ce banc. Une absence de preuve n'est ni une réussite ni une issue négative implicite.

Le concept `cognition.metacognition` est enregistré avec le service `metacognitionBenchService`, niveau `implemented`.

## 8. Processus d'exécution ou de validation

Le banc tourne à la fin d'un run terminal. Il persiste dans le self-model appris (`extraWeaknesses`, max 3). Les tests couvrent la calibration non circulaire, l'immuabilité, les signatures, les scopes, les dates, le rejeu et les issues non résolues :

```powershell
npm --prefix backend run test:metacognition
node benchmarks/metacognition/run-heldout.cjs qwen2.5:0.5b
node benchmarks/metacognition/verify-heldout.cjs <dossier-produit> <hash-attendu>
```

Le dernier lanceur utilise seulement Ollama local, trois seeds et trois domaines générés, un oracle numérique dans un processus séparé, 36 appels maximum et un manifeste écrit avant les observations. Les échecs restent dans le dénominateur de couverture. Le [rapport du 24 octobre](../06-qualite-preuves/qualification-metacognition-agow-2026-10-24.md) décrit les résultats et les recouvrements du corpus. Ce pilote d'ingénierie n'est pas un benchmark officiel.

## 9. Comparaison avec le marché

Le [dépôt SAD](https://github.com/LRudL/sad) fournit des tâches de connaissance situationnelle, certaines procédurales et dépendantes du modèle. Le [dépôt MIRROR](https://github.com/Jason-Wang313/Mirror) propose une évaluation hiérarchique de la métacognition ; sa référence indique un travail en évaluation. Leurs corpus et protocoles ne sont pas exécutés par le pilote local GenOS et restent `not_run`.

## 10. Limites, garde-fous, non-objectifs

- La métacognition fonctionnelle n'est pas une méta-conscience.
- Un lookup-table bien entraîné peut scorer aux bancs sans compréhension.
- Les benchmarks externes SAD/MIRROR ne sont pas exécutés sur un modèle déclaré.
- Un petit échantillon, des stimuli répétés et les issues manquantes limitent toute généralisation ; le seuil technique de dix essais ne garantit aucune puissance statistique.
- La signature publique de l'archive assure son intégrité par rapport à une empreinte attendue. La clé incluse ne vaut pas attestation d'un laboratoire indépendant ; les clés HMAC temporaires des reçus ne sont pas exportées.
- Cette correction est distincte du rappel situationnel inspiré des travaux de Tsao : une représentation utile au rappel ne démontre ni calibration ni conscience.
- Non-objectif : prouver une métacognition consciente.

## Voir aussi

- [reflexion.md](reflexion.md) — réflexion.
- [theorie-du-soi-orchestrator.md](../02-orchestration/theorie-du-soi-orchestrator.md) — banc métacognitif et opt-out.
- [metacognitionBenchService.js](../../backend/src/services/metacognitionBenchService.js) — implémentation.
- [ADR 0737](../adr/0737-calibration-metacognitive-independante.md) — décision et alternatives.
