# Organes vitaux des agents (systèmes 6-10)

- **Statut** : Implémenté
- **Portée** : sensorium, métabolisme, résilience, développement, symbiontes procéduraux ; boucle morphogénétique unifiée
- **Dernière revue** : 2026-09-23

Les cinq premiers systèmes formaient le **cerveau cognitif** de l'agent
(épistémique, mémoire, phénotype, stratégies, régulation). Les cinq suivants
lui donnent **des sens, un métabolisme, une capacité de survie, un
développement et des organes procéduraux vivants** — branchés sur la même
boucle morphogénétique, pas en silos.

## 1. Définition du domaine

Chaque agent porte cinq états vitaux, agrégés dans l'`AgentExpressionContext`
([agentExpressionContextService.js](../../backend/src/services/agents/agentExpressionContextService.js)) :

| État | Contenu | Service |
| --- | --- | --- |
| `sensorium` | capteurs, focus actif, observations, hypothèses, budget d'attention, affordances, modèle d'environnement | [`perception/`](../../backend/src/services/perception/) |
| `metabolicState` | budgets tokens/monétaires/latence, CPU/GPU/mémoire/IO, réserve d'énergie, pression, risque de famine | [`metabolism/`](../../backend/src/services/metabolism/) |
| `resilienceEnvelope` | domaine de panne, criticité, politiques checkpoint/redondance/retry, modes dégradés, cryptobiose | [`resilience/`](../../backend/src/services/resilience/) |
| `developmentalState` | stade, potency, spécialisation, marques épigénétiques, plasticité, niche | [`development/`](../../backend/src/services/development/) |
| `proceduralSymbionts` | organismes procéduraux hébergés, niche, fitness, santé, expression | [`proceduralSymbiont/`](../../backend/src/services/proceduralSymbiont/) |

## 2. Modèle logique

```text
ENVIRONMENT → SENSORIUM → EPISTEMIC STATE → MEMORY / REGULATION / METABOLISM
  → COGNITIVE PHENOTYPE → STRATEGY → DEVELOPMENT / PROCEDURES
  → MORPHOGENESIS PLANNER → RESILIENCE ENVELOPE → ACTION → monde → ↺
```

Utilité d'allocation : `EIG × pertinence × urgence × progrès / coût`.
Autorité effective d'un symbionte : `procédure ∩ host ∩ lease`.

## 3. Analogies biologiques et limites réelles

Écholocation, vision fovéale, affordances, métabolisme énergétique,
cryptobiose, embryogenèse HOX, holobionte : ces termes organisent des
invariants (budgets, gates, plafonds d'autorité), ils ne dotent pas
l'agent d'un corps. Voir [biologie-computationnelle.md](biologie-computationnelle.md)
(embryogenèse, HOX, budgets), [sens-animaux.md](biomimetisme/sens-animaux.md)
(super-sens) et [genome-et-epigenetique.md](genome-et-epigenetique.md).

## 4. Cas d'usage

Latence inconnue → le sensorium sonde (probe ciblée), la mémoire reconnaît
un incident, le métabolisme impose 2 workers au lieu de 5, un symbionte de
diagnostic concurrence est recruté, le worker se différencie en spécialiste,
un crash restaure le checkpoint, la procédure apprend, les branches
inutiles entrent en cryptobiose.

## 5. Exemples concrets

- Pression critique → `morphologyHint` rend `cryptobiosis`, branches gelées.
- Modèle frontier indisponible → mode dégradé `reduced_model`, mission
  continue à ambition réduite (voir [resilience-et-reprise.md](../04-exploitation/resilience-et-reprise.md)).
- Marque épigénétique `express(gpu)` hors plafond → refusée
  (`beyond_authority_ceiling`).

## 6. Schéma

Voir la boucle complète en 22 étapes dans
[ADR 0039](../adr/0039-systemes-vitaux-agents-6-10.md) (section Décision) et
le plan d'implémentation G0-G20 d'origine.

## 7. Architecture technique

- **Perception** : `sensorRegistryService` (9 capteurs : filesystem, ast,
  git, test, runtime_log, dependency, daemon, web, computer_use),
  `sensoriumService`, `observationService`, `attentionResolverService`,
  `affordanceResolverService`, `activePerceptionPlannerService`,
  `environmentModelService`, `perceptualContextCompiler`.
- **Métabolisme** : `metabolicStateService`, `resourceLedgerService`
  (hiérarchie mission → toolcall, aucun enfant ne crée de ressource),
  `resourceReservationService`, `resourceAllocatorService`,
  `metabolicPressureService`, `substrateCostService`,
  `starvationPolicyService`.
- **Résilience** : `resilienceStateService` (9 états),
  `resilienceEnvelopeService`, `failureClassifierService`,
  `containmentService`, `degradedModeService`, `recoveryPlannerService`,
  `redundancyPlannerService`, `cryptobiosisCoordinatorService` (façade du
  service existant), `recoveryVerificationService`.
- **Développement** : `developmentalStateService` (8 stades),
  `differentiationResolverService`, `epigeneticExpressionService`,
  `developmentalTransitionService`, `reprogrammingService`,
  `plasticityRegulatorService` (6 états, façade Axolotl),
  `collectiveEmbryogenesisService`.
- **Procédures** : `symbiontService`, `proceduralResolverService`,
  `compatibilityService`, `propagationService` (réutilisent le runtime
  procédural existant, cf. `proceduralRuntimeService`).
- **Plan** : `morphogenesisPlanExtensions` (14 dimensions + receipt SHA),
  branché dans `planMorphogenesis`.

## 8. Processus d'exécution et de validation

`backend/tests/test_systems_6_10.js` : 14 tests (registre, boucle
observation, attention sous budget, affordances bornées par l'autorité,
allocation GRANT, cryptobiose sous pression critique, machine de
résilience, recovery avec containment d'abord, différenciation sans
modification du DNA, épigénétique sans création de permission, intersection
d'autorité, plan étendu avec receipt). Suites `npm test` (55/55) et
`test:procedural` vertes ; gate qualité propre sur les nouveaux fichiers.

## 9. Comparaison avec le marché

Les frameworks d'agents exposent budgets et retries comme paramètres
plats ; ici budgets, perception, survie et développement sont des variables
de contrôle de la morphogenèse elle-même, sous gates de preuve
([epistemologie-et-evidence.md](epistemologie-et-evidence.md)).

## 10. Limites, garde-fous, non-objectifs

- **Épigénétique et procédures ne créent jamais une permission** : expression
  et autorité effective restent sous le plafond du host et du lease.
- **Succès de transport ≠ décision valide** : toute recovery exige une
  vérification indépendante avant retour à HEALTHY.
- **Non-objectifs** : persistance durable des états vitaux (aujourd'hui
  `Map` mémoire), benchmarks d'ablation par système (G20, à venir).
- Médecine (soigner un composant, cf. [nosologie/](nosologie/README.md)) ≠
  résilience (continuer la mission malgré la panne).
