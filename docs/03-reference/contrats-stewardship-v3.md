# Contrats de stewardship V3

- **Statut** : référence des services présents au 2026-10-20
- **Portée** : control plane Node, persistance locale et frontières d’autorité
- **Compatibilité** : contrats applicatifs internes ; aucune stabilité d’API publique implicite

## 1. Règle de lecture

Cette page décrit ce que les services acceptent, produisent et refusent. Elle ne
transforme pas une fonction interne en API publique. Les schémas nommés, statuts et
codes d’erreur doivent être préférés aux textes libres pour l’intégration.

Les invariants communs sont :

- portée explicite ;
- provenance des signaux ;
- budget et permission non compensables ;
- `NO_CHANGE` observable ;
- indépendance du producteur et du vérificateur ;
- promotion ou déploiement non implicite ;
- idempotence stricte ;
- preuve synthétique distincte de l’effet réel.

## 2. Cartographie

| Contrat | Module | Persistance | Schéma ou sortie principale |
| --- | --- | --- | --- |
| responsabilité ambiante | `ambientAgency/responsibilityLedgerService.js` | SQLite | révision immuable de responsabilité |
| observation ambiante | `ambientAgency/observationService.js` | SQLite | observation minimisée/révocable |
| arbitrage ambiant | `ambientAgency/arbitrationService.js` | aucune directe | décision bornée |
| trajectoire | `trajectoryStewardshipPolicyService.js` | aucune directe | `ACT/OBSERVE/LEARN/NO_CHANGE` |
| résultat de trajectoire | `trajectoryStewardshipOutcomeService.js` | SQLite | `PROMOTED/REJECTED/INCONCLUSIVE` |
| buts GVX | `gvxGoalSelector.js` | aucune | `genos.gvx.goal-selection/v1` |
| compétence GVX | `gvxSkillStewardship.js` | ledger GVX | enregistrement et assessment v1 |
| monde contrefactuel | `counterfactualWorldEvolutionService.js` | SQLite | plans, décisions et effets v1 |
| modèle prédictif | `predictiveTimescale/` | adaptive state | prédiction préenregistrée et observation |
| délégation | `ontogenesis/asyncDelegation*Service.js` | SQLite | mission, checkpoints, reçu terminal |
| dépôt | `ontogenesis/repositoryStewardship*` | ledger Ontogenèse | contrat/candidat/assessment |
| produit/site/code/UX | `shev/*StewardshipService.js` | selon service | dossiers et décisions bornées |
| évolution de scaffold | `governedEvolution/` | mémoire locale du ledger | hypothèse, qualification, autorisation |
| campagne AIDE² | `aide2/` | objets de campagne | campagne, génération, revue causale |
| guérison SRE | `sreHealing*Service.js` | SQLite | campagne/remédiation/effet |

## 3. Responsabilité ambiante

### 3.1 Identité et lignée

Le ledger de responsabilité enregistre une tête et son historique. Une création ou
un amendement doit porter une portée tenant/projet, une identité, un mandat, un
propriétaire et une révision attendue. La canonicalisation et le hash rendent une
réécriture divergente détectable.

### 3.2 Consentement d’observation

Une observation n’est recevable que si le consentement couvre sa catégorie et sa
durée. Le service :

1. vérifie la responsabilité courante ;
2. minimise les champs collectés ;
3. associe source, horodatage et portée ;
4. permet révocation et oubli ;
5. refuse une relecture hors tenant.

La révocation supprime ou rend indisponible la donnée visée ; elle ne réécrit pas
silencieusement les décisions historiques. Celles-ci doivent alors être considérées
comme fondées sur une preuve révoquée.

### 3.3 Arbitrage

L’arbitre reçoit les observations admises, la responsabilité et les limites de coût.
Il peut proposer observation, action, apprentissage ou abstention. Son résultat est
une recommandation : l’actionneur doit encore vérifier l’autorité effective.

## 4. Responsabilité de trajectoire

### 4.1 Entrée normalisée

```text
agentId, mandateRef, projectId
domains[1..16]
trajectory = {
  objectiveRef, observationRef,
  gap, uncertainty, learningPotential ∈ [0,1],
  observationAgeMs >= 0
}
budget.remainingTokens >= 0
permissions = {act, observe, learn, explicitWriteLease}
policy = {
  maxObservationAgeMs,
  actThreshold, uncertaintyThreshold, learnThreshold,
  actTokens, observeTokens, learnTokens
}
```

Toute chaîne obligatoire vide, score hors `[0,1]`, entier négatif ou liste de domaines
vide produit `TRAJECTORY_STEWARDSHIP_INVALID`.

### 4.2 Décision

| Condition prioritaire | Candidat | Condition supplémentaire |
| --- | --- | --- |
| donnée périmée ou incertitude haute | `OBSERVE` | permission + budget |
| écart supérieur au seuil | `ACT` | permission + budget + `explicitWriteLease` |
| potentiel d’apprentissage supérieur au seuil | `LEARN` | permission + budget |
| aucune condition | `NO_CHANGE` | aucune action |

Si le candidat manque de permission ou de budget, la sortie conserve le candidat
mais sélectionne `NO_CHANGE` avec une raison `permission-denied:*` ou
`budget-insufficient:*`.

### 4.3 Résultat

Le service de résultat requiert deux preuves : effet projet et apprentissage agent.
Les références et les vérificateurs doivent être distincts. La décision est atomique :

| Projet | Agent | Verdict |
| --- | --- | --- |
| `supported` | `supported` | `PROMOTED` |
| au moins un `refuted` | quelconque | `REJECTED` |
| autre combinaison | autre combinaison | `INCONCLUSIVE` |

Le reçu d’autorité SHEV lie l’identité de responsabilité, les deux références et la
politique avant écriture.

## 5. Sélection de buts GVX

### 5.1 Signaux

`SIGNAL_NAMES` vaut :

```text
projectNeed, trajectoryGap, risk,
opportunity, uncertainty, learningProgress
```

Chaque signal porte une valeur bornée et au moins une `sourceRef`. Le candidat ajoute
`goalId`, `estimatedCost`, `candidateRef` et `observedAt`.

### 5.2 Score

Les poids par défaut sont : besoin projet `0,24`, écart de trajectoire `0,18`, risque
`0,18`, opportunité `0,12`, incertitude `0,10`, progrès d’apprentissage `0,08` et
coût `0,10`. Ces valeurs sont une politique par défaut, pas une calibration publiée.

```text
utility = Σ(signal × weight) - min(1, cost / maxCost) × costWeight
```

L’autorité `goal:propose` et `maxCost` sont vérifiées avant le classement. La sélection
respecte `maxGoals` et le budget cumulé. Les égalités sont ordonnées par coût puis par
identifiant lexical.

### 5.3 Sortie

```json
{
  "schema": "genos.gvx.goal-selection/v1",
  "decision": "PROPOSE_GOALS | NO_CHANGE",
  "autonomousExecution": false,
  "promotionAuthorized": false
}
```

Chaque but retenu demeure une `hypothesis`, requiert un dispatch externe et une preuve
indépendante avant promotion.

## 6. Responsabilité de compétence GVX

L’enregistrement lie une responsabilité à un skill versionné : identité, version,
parent, hash d’artefact, producteur, événement de curriculum et expériences sources.
La version 1 exige `parentVersion: null`; les suivantes exigent le parent immédiat.

L’assessment vérifie :

- nombre minimum de réutilisations ;
- bénéfice projet minimal ;
- régression maximale ;
- rétention sur des observations séparées ;
- holdout scellé dans un contexte distinct ;
- vérificateurs et références de preuve ;
- autorité `assess_responsibility_skill`.

Les sorties `genos.gvx.skill-responsibility-registration/v1` et
`genos.gvx.skill-stewardship-assessment/v1` fixent `automaticPromotion: false`.

## 7. Monde contrefactuel

### 7.1 Plan

`planScenarios` produit `genos.counterfactual-world-plan/v1` avec baseline, horizon,
branches et responsabilité. Le statut initial est `synthetic_only`, la promotion est
interdite et la preuve suivante exigée est `independent_real_observation`.

### 7.2 Décision

`decideAction` compare les branches admissibles sous coût, risque et autorité. La
décision garde la classe de preuve `simulation`. Une absence de branche suffisamment
bonne doit conduire à l’abstention, pas au choix forcé du meilleur mauvais candidat.

### 7.3 Observation

`validateObservation` lie un effet réel au plan et à l’action. La sortie
`genos.observed-world-effect/v1` porte `supported` ou `refuted`, la classe
`independent_real_observation`, et conserve `promotionAllowed: false` : l’observation
informe une gate supérieure.

## 8. Modèle du monde

### 8.1 Préenregistrement

Le registre conserve une prédiction `OPEN` avec distribution, version, portée,
horodatage et commitment. Une observation ne peut être attachée qu’une fois et doit :

- cibler la même prédiction et version ;
- être postérieure à son émission ;
- contenir une valeur numérique ;
- référencer au moins une preuve ;
- présenter une enveloppe vérifiable.

Après observation, la prédiction devient `OBSERVED`; le résidu et le résidu
standardisé alimentent la mémoire et la précision calibrée.

### 8.2 Prospective

La permission requise est `world-model:foresight`. Les refus stables sont :

- `permission_missing` ;
- `budget_insufficient` ;
- `no_candidate` ;
- `insufficient_expected_value`.

Une acceptation produit `RUN_FORESIGHT`, réserve tokens et millisecondes, mais reste
`counterfactual` et ne compte pas comme effet réel.

## 9. Délégation Ontogenèse

### 9.1 Tables logiques

| Entité | Champs critiques |
| --- | --- |
| mission | id, projet, mandat, autorité, producteur, capsule, base, plan, hash, statut, curseur, lease, fence |
| checkpoint | mission, séquence, étape, fence, état canonique, hash, artefact |
| décision | issue, raison/révisions, références, planHash, hashes des checkpoints |

### 9.2 Statuts terminaux

`accepted`, `no_change` et `human_review` empêchent un nouveau claim. `interrupted`
libère le lease tout en conservant le curseur. Un lease actif appartenant à un autre
owner produit `bail-delegation-actif`.

### 9.3 Refus structurants

| Refus | Cause |
| --- | --- |
| `fencing-delegation-obsolete` | worker ancien ou mauvais owner |
| `bail-delegation-expire` | écriture après expiration |
| `sequence-checkpoint-inattendue` | trou ou rejeu hors ordre |
| `checkpoint-delegation-idempotence-conflit` | même séquence, contenu différent |
| `verificateur-non-independant` | vérificateur = producteur |
| `preuve-effet-post-integration-manquante` | clôture sans effet réel |
| `no-change-apres-mutation-interdit` | abstention tardive |
| `revue-humaine-documentee-requise` | escalade sans trace |

## 10. Produit, interface et UX

Le cycle Studio sépare contrat, aperçu, jury, acceptation, effet et initiative. Le
service d’évolution d’interface ajoute un baseline et des candidats évalués sur des
dimensions pluralistes. La gouvernance peut produire
`READY_FOR_AUTHORIZED_DEPLOYMENT`, mais conserve `deploymentExecuted: false`.

Les règles principales sont :

- modalités visuelle et fonctionnelle minimales ;
- évaluateur différent du créateur ;
- désaccord conservé, pas moyenné silencieusement ;
- acceptation liée au hash du jury ;
- effet lié à un run de production terminé ;
- transfert vers un autre contexte soumis à une nouvelle expérience.

Voir [Studio — cycle produit durable](studio-cycle-produit-durable.md).

## 11. Évolution gouvernée et AIDE²

Le scaffold gouverné distingue `HYPOTHESIS`, `QUALIFIED`, `REJECTED`,
`AUTHORIZED_PENDING_APPLY` et `ROLLED_BACK`. Toutes les sorties internes conservent
`promotionEligible: false`.

La campagne AIDE² produit :

- `genos.aide2.campaign/v1` ;
- `genos.aide2.generation-evaluation/v1` ;
- `genos.aide2.causal-review/v1` ;
- `genos.aide2.promotion-review/v1`.

Même une revue autorisée se termine par `eligible_for_external_promotion_request`,
`promotionAllowed: false` et `promotionExecuted: false`.

## 12. Guérison SRE

La guérison SRE lie symptôme, hypothèses causales, action bornée, budget de risque,
rollback et observations post-action. Le store conserve la campagne et ses épisodes ;
la politique classe l’action selon autorité, blast radius, qualité de preuve et
réversibilité. Voir le [runbook dédié](../04-exploitation/guerison-sre-causale.md).

## 13. Compatibilité et évolution

- ajouter un champ optionnel est compatible si les lecteurs ignorent l’inconnu ;
- modifier un statut, un code de refus ou la sémantique d’une preuve exige une version ;
- élargir une autorité ou transformer une recommandation en action est un changement
  architectural et requiert un ADR ;
- une migration doit préserver l’historique, les digests ou une preuve explicite de
  conversion ;
- un service ne doit pas interpréter l’absence d’un champ de sécurité comme `true`.

## 14. Matrice des tests

| Surface | Tests |
| --- | --- |
| ambient | `test_ambient_responsibility_ledger.js`, `test_ambient_observation_consent.js`, `test_ambient_feedback_arbitration.js` |
| trajectory | `test_trajectory_stewardship_policy.js`, `test_trajectory_stewardship_store.js`, `test_trajectory_stewardship_outcome.js` |
| GVX | `test_gvx_goal_selector.js`, `test_gvx_skill_stewardship.js`, `test_gvx_reusable_skill_manifest.js`, `test_gvx_reusable_skill_gate.js` |
| world model | `test_predictive_timescales.js`, `test_predictive_distribution.js`, `test_runtime_predictive_bridge.js` |
| delegation | `test_ontogenesis_async_delegation.js`, `test_ontogenesis_repository_stewardship.js` |
| stewardship SHEV | `test_shev_coding_stewardship.js`, `test_shev_website_stewardship.js`, `test_shev_product_stewardship.js`, `test_shev_experience_stewardship.js` |
| evolution | `test_counterfactual_world_evolution.js`, suites `test_aide2_*`, `test_governed_evolution_*` |
| Studio | `test_studio_product_*`, `test_studio_interface_*` |
| SRE | `test_sre_healing_policy.js`, `test_sre_healing_store.js` |

## 15. Frontières non implémentées

- aucun endpoint public unique n’expose tout ce corpus ;
- aucun scheduler global ne compose automatiquement toutes les décisions ;
- aucune promotion universelle n’est déclenchée par ces services ;
- aucune preuve locale ne certifie un effet longitudinal en production ;
- aucun score ne remplace une autorisation ou un consentement explicite.

## Voir aussi

- [Ontogenèse dirigée par responsabilité](../01-concepts/ontogenese-dirigee-par-responsabilite.md)
- [Évolution contrefactuelle gouvernée](../02-orchestration/evolution-contrefactuelle-gouvernee.md)
- [Délégation et stewardship](../02-orchestration/ontogenese-delegation-et-stewardship.md)
- [Runbook longitudinal](../04-exploitation/runbook-stewardship-longitudinal.md)
