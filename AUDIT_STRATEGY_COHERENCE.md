# Audit Cohérence : Stratégie Sélectionnée vs Stratégie Exécutée

**Date** : 2026-09-06  
**Scope** : Flux de sélection, contrat, exécution et preuve de stratégies  
**Sévérité** : CRITIQUE — Les divergences compromettent l'assurance que la stratégie exécutée respecte le contrat  

---

## 🔴 Défaut 1 : `resolveStagePrimitives()` ignore le portfolio sélectionné

**Localisation** : [backend/src/services/strategyExecutionService.js](backend/src/services/strategyExecutionService.js#L159-L165)

**Problème** :

```javascript
function resolveStagePrimitives(stageKey, portfolio = []) {
  const defaults = STAGE_PRIMITIVE_MAP[stageKey] || [];
  const portfolioPrimitives = (portfolio || []).flatMap((s) => s.primitives || []);
  const matching = portfolioPrimitives.filter((p) => defaults.includes(p));
  return matching.length ? [...new Set(matching)] : defaults;
  //                                                   ↑ PROBLÈME ICI
}
```

**Impact** :
- Si aucune primitive du portfolio ne correspond à une étape (`stageKey`), la fonction retourne les primitives par défaut
- Exemple concret :
  - Stratégie sélectionnée = `'deterministic_direct_path'` (ne contient pas `'fork'`)
  - Étape exécutée = `'isolated_forks'` (stage par défaut : `['fork', 'mcts_select']`)
  - Résultat : `'fork'` est exécutée malgré que la stratégie ne l'autorise pas
- **Violation** : l'exécution sort du contrat sélectionné
- **Audit** : aucune trace qu'une primitive "non contractée" a été exécutée

**Test de validation** :
- Existe une couche de validation pour s'assurer que seules les primitives du portfolio peuvent être exécutées ? **NON**
- Comment savoir post-mortem si `'fork'` a été vraiment demandée ou si c'est un fallback implicite ? **IMPOSSIBLE**

---

## 🔴 Défaut 2 : Pas de validation de cohérence au démarrage des phases

**Localisation** : [backend/src/services/autonomousOrchestrationService.js](backend/src/services/autonomousOrchestrationService.js#L15-L50)

**Problème** :

```javascript
const phases = [
  phase('retrieve_and_diagnose', ['genos_search_failures', 'genos_diagnose'], ...),
  phase('snapshot_before_mutation', ['genos_snapshot'], ...),
  // ...
];
if (branchCount > 1) phases.push(phase('counterfactual_forks', ['genos_fork', 'genos_solve'], ...));
```

Les phases sont construites dynamiquement avec des tools "requiredTools" hardcodés, mais :
1. **Pas de vérification** que le portfolio sélectionné contient réellement ces outils
2. **Pas de checkpoint** avant d'exécuter une phase pour valider sa réalisabilité
3. **Pas de fallback** si une phase requiert une primitive qui n'existe pas dans le contrat

**Exemple de divergence** :
- Contrat sélectionne une stratégie sans support pour `'genos_fork'`
- Plan autonome demande une phase `'counterfactual_forks'` qui requiert `'genos_fork'`
- Phase commence, puis échoue parce que la primitive n'est pas disponible
- Aucune validation n'a empêché cette bifurcation avant l'exécution

**Test de validation** :
- Existe une vérification que chaque `requiredTool` d'une phase existe dans le contrat ? **NON**

---

## 🔴 Défaut 3 : Fallback de stratégie jamais utilisé en runtime

**Localisation** : [backend/src/services/strategyContractService.js](backend/src/services/strategyContractService.js#L12-L30)

**Problème** :

Le contrat construit un fallback et le stocke :

```javascript
fallback: selection.primaryFallback,  // { requested, selected, reason }
```

Mais dans tout le codebase, le fallback n'est **jamais utilisé** :
- Aucun code ne repose le fallback si la primaire échoue
- Aucun mécanisme n'existe pour "basculer" du primaire au fallback
- Si la stratégie primaire échoue, le runtime crash au lieu de réessayer avec la fallback

**Recherche** : `rg -i "primaryFallback|fallback.*strategy|fallback.*execution" backend/src --max-count 10`  
**Résultat** : Trouvé seulement dans le contrat (stockage), jamais dans l'exécution (utilisation)

**Impact** :
- Garantie de sélection de fallback = INUTILE
- Perte de résilience par degradation gracieuse

---

## 🔴 Défaut 4 : Pas de preuve durable de quelles primitives ont été exécutées

**Localisation** : [backend/src/services/strategyExecutionService.js](backend/src/services/strategyExecutionService.js#L45-L60)

**Problème** :

Le `parseRun()` enregistre les étapes (phases) :

```javascript
const parsedSteps = steps.map((step) => ({
  id: step.id,
  stageKey: step.stage_key,  // 'isolated_forks', 'snapshot', etc.
  strategyIds: json(step.strategy_ids_json, []),  // Strategies assignées
  // ... aucun champ "primitives_executed" ou "primitive_audit"
}));
```

**Manque critique** :
- Aucun enregistrement de QUELLES primitives ont été réellement appelées
- Aucun checksum ou signature des primitives exécutées vs contrat
- Aucune audit trail des appels aux `strategyExecutionAdapter` handlers

**Recherche** : "primitives_executed", "executed_primitives", "primitive_audit"  
**Résultat** : Zéro occurrence

**Impact** :
- Audit post-mortem impossible : "Pourquoi cette étape a échoué ?" → Pas de log de quelles primitives ont été exécutées
- Déviation silencieuse : la stratégie exécutée peut diverger totalement du contrat sans être détectée

---

## 🔴 Défaut 5 : Pas de validation des dossiers de workers contre la stratégie exécutée

**Localisation** : [backend/src/services/agentEvidenceService.js](backend/src/services/agentEvidenceService.js)

**Problème** :

Les dossiers de workers sont enregistrés et validés, mais :

```javascript
// Dans validateWorkerDossiers(), on valide:
// - que le worker est présent
// - qu'il y a au moins un événement
// MAIS: pas de validation que les preuves correspondent à la stratégie exécutée
```

**Absence de vérification** :
- Le contrat dit : "Utilise la stratégie X et appelle les primitives [a, b, c]"
- Le worker exécute-t-il réellement [a, b, c] ? → **PAS DE CHECK**
- Le dossier du worker contient-il des événements de primitives autres que [a, b, c] ? → **JAMAIS VALIDÉ**
- Le dossier est-il cohérent avec le contrat exécuté ? → **AUCUNE VALIDATION**

**Impact** :
- Un worker pourrait exécuter une stratégie complètement différente de ce qui a été contracté
- Aucune assurance que la "preuve" du worker reflète réellement la stratégie contractée

---

## 🔴 Défaut 6 : Changement de stratégie en runtime ne valide pas la continuité d'exécution

**Localisation** : [backend/src/services/strategyAdaptationService.js](backend/src/services/strategyAdaptationService.js#L58-L110)

**Problème** :

Lors d'un `changeStrategy()`, le code :

```javascript
if (activeRun && ['planned', 'running'].includes(activeRun.status)) {
  // Cancels the run
  await tx.run("UPDATE strategy_execution_steps SET status = 'skipped' WHERE ...");
}
```

Mais il ne valide pas :
1. **Continuité** : Les étapes exécutées avant le changement correspondent-elles à la stratégie précédente ?
2. **Compatibilité** : Les preuves collectées avant le changement restent-elles valides pour la nouvelle stratégie ?
3. **Invariants** : Des étapes critiques (ex: snapshot) n'ont-elles pas été supprimées à tort ?

**Scénario problématique** :
- Étapes complétées : `['snapshot', 'counterfactual_forks']` → preuve générée par branchement
- Nouvelle stratégie sélectionnée : une qui ne supporte pas `'counterfactual_forks'`
- Les preuves des branches précédentes sont maintenant "orphelines" / incompatibles avec la nouvelle stratégie

---

## 🔴 Défaut 7 : `buildAutonomyPlan()` construit un plan sans valider le support du portfolio

**Localisation** : [backend/src/services/autonomousOrchestrationService.js](backend/src/services/autonomousOrchestrationService.js#L10-L20)

**Problème** :

```javascript
function selected(contract, id) {
  return (contract.strategy_portfolio || []).some((strategy) => strategy.id === id);
}

// Utilisé pour décider si on active Trinity / A-Team / Red-Blue
// MAIS: jamais de vérification que le portfolio peut RÉELLEMENT faire Trinity/A-Team
```

Les décisions sont prises sur la base du portfolio (ex: "contient 'genetic_strategy_algorithm' ?"), mais :
- Pas de validation que la stratégie a les primitives requises
- Pas de validation que le portfolio global supporte le modèle de dispatch attendu

**Exemple** :
- Portfolio contient `'genetic_strategy_algorithm'`
- Plan dit : "Activons la mutation" → `evolution = true`
- Phases demandent : `'genos_resilience_hypermutation'`
- Stratégie n'a pas cette primitive → exécution échoue

---

## 🔴 Défaut 8 : Aucune signature/checksum de contrat après déploiement

**Localisation** : Aucune couche d'audit

**Problème** :

Le contrat est créé, stocké, et exécuté, mais :
- Pas de hash du contrat à l'exécution vs contrat initial
- Pas de détection de mutations du contrat en cours de route
- Pas de garantie que le contrat lu à partir de la DB au moment de l'exécution est bien le même que celui sélectionné initialement

**Impact** :
- Race condition silencieuse : contrat modifié entre sélection et exécution (par un changement de stratégie ou une migration)
- Aucun mécanisme pour détecter "le contrat a été modifié depuis le début"

---

## 📊 Résumé des défauts critiques

| Défaut | Catégorie | Impact | Remédiation |
|--------|-----------|--------|-------------|
| 1. `resolveStagePrimitives()` fallback silencieux | **Exécution** | Primitives exécutées ≠ portfolio | Valider ou rejeter |
| 2. Pas de validation des phases vs portfolio | **Validation** | Phases impossible à exécuter | Checker avant |
| 3. Fallback jamais utilisé | **Résilience** | Pas de degradation gracieuse | Implémenter fallback |
| 4. Pas de preuve des primitives exécutées | **Audit** | Impossible de tracer | Logger les primitives |
| 5. Dossiers workers ≠ stratégie | **Preuve** | Preuves invalides / orphelines | Valider dossiers |
| 6. Changement stratégie non validé | **Continuité** | Étapes incompatibles | Valider transition |
| 7. Plan autonome sans validation | **Dispatch** | Workers lancés pour primitives manquantes | Valider avant dispatch |
| 8. Pas de checksum contrat | **Intégrité** | Mutations silencieuses | Signer/vérifier |

---

## 🎯 Couches de correction

1. **Sélection → Contrat** : Créer un validateur qui refuse de signer un contrat si le portfolio ne supporte pas les phases
2. **Contrat → Exécution** : Créer un exécuteur qui rejette les appels de primitives non contractées
3. **Exécution → Preuve** : Créer un auditeur qui enregistre chaque primitive exécutée et valide vs contrat
4. **Preuve → Workers** : Valider que les dossiers des workers respectent les primitives du contrat
5. **Runtime → Adaptation** : Valider la cohérence lors du changement de stratégie

---

## 📝 Prochaines étapes

1. Créer `validateStrategyContractConsistency()` : Vérifie que toutes les phases du plan autonome sont réalisables avec le portfolio
2. Créer `validatePrimitiveExecution()` : Rejette les appels de primitives hors-portfolio
3. Créer `auditStrategyExecutionTrace()` : Enregistre chaque primitive exécutée
4. Créer `validateWorkerDossierCoherence()` : Valide que les dossiers reflètent le contrat exécuté
5. Créer `validateStrategyTransition()` : Avant changement, valide la continuité des preuves
6. Créer `signStrategyContract()` : Signer le contrat pour détecter les mutations
