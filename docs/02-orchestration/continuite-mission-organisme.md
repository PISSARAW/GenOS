# Continuité de mission : l'organisme logiciel

- **Statut** : Partiel (gate de complétion, feedback loop continuation, bornage/idempotence, preuves runtime, immunité enforceable ; régénération runtime, dormance durable et succession restantes)
- **Portée** : control plane Node, services de survie de mission
- **Dernière revue** : 2026-09-22

## Définition

La continuité de mission dans GenOS ne repose pas sur un watchdog qui relance un
processus. Elle repose sur un organisme logiciel dont les agents sont des cellules
remplaçables et dont la mission survit à leur mort, s'auto-régule, cicatrise et
entre en dormance lorsqu'elle ne peut plus agir sans danger.

L'invariant central est :

> **La cellule n'est pas la mission, comme une cellule n'est pas l'organisme.**

```text
mort cellulaire ≠ mort du tissu ≠ mort de l'organisme
```

Un agent arrêté est une perte cellulaire (`CELL_LOSS_DETECTED`), pas un échec de
mission. La mission n'échoue que lorsque l'organisme entier ne peut plus remplir
sa fonction.

## Les six systèmes

Le Mission Continuity Kernel est organisé en six systèmes biologiques. Chacun
s'appuie sur des services du control plane Node :

| # | Système | Services | Rôle |
| --- | --- | --- | --- |
| 1 | Mission Organism | `missionOrganismService.js` | identité durable : génome, phénotype, tissus, métabolisme, mémoire |
| 2 | Homeostasis System | `homeostasisContractService.js`, `homeostasisService.js` | contrat de terminaison par invariants, vérification continue |
| 3 | Autonomic Nervous System | `vitalSignalsService.js` | pulses cellulaires, états vitaux, charge allostatique, santé tissulaire |
| 4 | Immune System | `immuneGateService.js`, `immuneMemoryService.js` | gates de preuve, détection d'anomalie, quarantaine, mémoire immunitaire |
| 5 | Regeneration System | `regenerationService.js` | évaluation des dommages, remplacement cellulaire, cicatrices, équivalence fonctionnelle |
| 6 | Survival System | `survivalModesService.js` | quiescence, cryptobiose, conditions de réveil, apoptose contrôlée |

Les systèmes 2 à 6 opèrent tous sur l'organisme du système 1 : c'est la structure
portante qui rend le biomimétisme architectural plutôt que cosmétique.

## 1. Mission Organism

Un organisme de mission est assemblé par `newOrganism()` avec :

- **genome/** : objectif, invariants, contrat de complétion, contraintes de sécurité — immuable pendant la mission ;
- **phenotype/** : plan courant, exécution active, état courant — mutable ;
- **tissues/** : `workers`, `orchestrator`, `verifiers`, `recoveryCells`, chaque cellule avec rôle et statut ;
- **metabolism/** : tokens, coût, latence ;
- **memory/** : checkpoints, cicatrices, stratégies échouées, provenance ;
- **nervousSystem/** : signaux et pulses ;
- **survival/** : régénération, quiescence, cryptobiose, apoptose.

Les fonctions clés : `isFunctionCovered(organism, roles)` détermine si les rôles
requis sont couverts par des cellules vivantes ; `recordScar`, `recordCheckpoint`
et `recordFailedStrategy` alimentent la mémoire structurelle.

## 2. Homeostasis : le contrat de complétion

Le `CompletionContract` devient une homéostasie cible. La mission ne passe à
`COMPLETED` que lorsque son état homéostatique cible est atteint :

$$H(M)=\bigwedge_i I_i(M)$$

Les invariants appartiennent à quatre classes : `functional` (la fonction
marche), `structural` (tests passent, aucun fichier interdit modifié),
`epistemic` (les affirmations ont des preuves), `safety` (aucune violation de
politique).

`transitionMissionToComplete()` refuse la transition tant que le contrat n'est
pas satisfait — c'est la matérialisation du principe « un transport réussi
n'est pas une preuve de décision valide ».

## 3. Feedback loop de continuation

Quand l'homéostasie bloque, GenOS ne sort pas en échec. Il boucle :

```text
HOMEOSTASIS BLOCÉE
   ↓
classifyDeviation() → missing_work | failed_proof | unsafe_action | incomplete
   ↓
dispatch worker_homeostasis_<uuid> (borné : max 3 par déviation, idempotence)
   ↓
WAIT FOR TERMINAL STATE (10 min max)
   ↓
refresh agents + collect evidence runtime
   ↓
réévalue homéostasie
   ↓
┌──────────────┬───────────────┐
│ satisfaite   │ encore bloquée│
↓              ↓
COMPLETE       re-dispatch (si budget restant) ou EXHAUSTED
```

**Bornage** : `MAX_HOMEOSTASIS_CONTINUATIONS = 3` — chaque compteur est par
`(missionId, deviation)` dans la table `continuation_queue`.

**Idempotence** : `decisionId = hash(missionId, deviation, stateVersion)` — un
re-dispatch avec la même identité retourne `{ idempotent: true }` sans créer de
doublon.

**Sécurité** : le worker de continuation hérite des permissions du parent (jamais
l'inverse). Si `prohibitExactRetry` est activé pour cette catégorie immunitaire,
le dispatch est refusé.

## 4. Preuves runtime

Le contexte d'évaluation n'est plus synthétique. `missionEvidenceCollector.js`
collecte :

- `worker_evidence` : dossiers workers (`evidenceReport`)
- `test_suite_passed` : `WORKER_EVIDENCE_BARRIER_SATISFIED` en télémétrie
- `evidence_report` : événements `EVIDENCE_REPORT`
- `execution_run_complete` : `strategy_execution_runs.status = completed`
- `agent_completed` : événements `AGENT_COMPLETED`
- `homeostasis_achieved` : événements `MISSION_COMPLETED`

Les flags contextuels : `testsPassed`, `workerEvidenceComplete`, `noFailedAgents`,
`allAgentsCompleted`, `verifierReceiptPresent`.

Fallback : `['mission_outcome']` si DB absente ou erreur.

## 5. Signaux vitaux

Chaque cellule émet un pulse :

```json
{
  "cell": "worker-42",
  "mission": "M7",
  "state": "active",
  "progressSignal": 0.61,
  "metabolicLoad": { "tokens": 18400, "cost": 0.42 },
  "stress": 0.24,
  "lastEvidence": "ev_749"
}
```

`interpretCellState()` distingue sept états vitaux — `active`, `quiescent`,
`stressed`, `starved`, `injured`, `unresponsive`, `dead` — chacun avec une
définition informatique mesurable :

- `unresponsive` : âge du pulse > timeout de lease ;
- `starved` : budget restant < budget minimum requis ;
- `stressed` : charge allostatique ≥ 0,75.

La charge allostatique combine pression d'échec, saturation de contexte,
incertitude, pression budgétaire et dissonance épistémique. Au-delà du seuil,
GenOS suggère un checkpoint, une réduction de périmètre ou une succession
cellulaire **avant** la rupture.

## 6. Système immunitaire

Deux couches :

- **Gates de preuve** (`immuneGateService.js`) : évaluation pondérée de gates, scan de menaces (injection SQL/commande/traversée/prompt), détection d'anomalie multi-niveaux, décision de quarantaine. `isSafeToProceed()` combine anomalie et couverture fonctionnelle des tissus.
- **Mémoire immunitaire** (`immuneMemoryService.js`) : après `Stratégie A → crash → retry A → crash`, l'organisme produit un anticorps conceptuel — une signature d'échec SHA-256 avec `prohibitedExactRetry: true` et une réponse préférée (`replace_worker`). La reconnaissance d'une signature déjà vue interdit le retry exact et propose la réponse apprise.

## 7. Régénération

La mort d'une cellule déclenche `assessDamage()` :

```text
ASSESS DAMAGE → IDENTIFY LOST FUNCTION → IDENTIFY SURVIVING STRUCTURE
→ REGENERATE MINIMUM NECESSARY PART → VERIFY FUNCTIONAL EQUIVALENCE
```

Trois verdicts possibles par cellule perdue : `covered` (d'autres cellules
couvrent la fonction → continuer), `regenerate` (fonction indispensable →
remplacement), `obsolete` (fonction plus nécessaire → apoptose cellulaire
confirmée). Chaque réparation enregistre une cicatrice (`injury / repair /
stateBefore / stateAfter / successful`) qui rejoint les `bud_scars`
conceptuels. `verifyFunctionalEquivalence()` confirme que les rôles requis
sont couverts après régénération.

## 8. Survie : quiescence, cryptobiose, apoptose

Un organisme vivant possède des états sains non actifs. GenOS les formalise :

| État | Condition d'entrée | Sortie |
| --- | --- | --- |
| `QUIESCENT` | mission viable + aucune action sûre + attente externe | condition de réveil |
| `CRYPTOBIOSIS` | mission incomplète + budget insuffisant | `budget_added`, `provider_available`, `human_resolves_gate` |
| `APOPTOSIS` | survie impossible + homéostasie inatteignable + **autorisation humaine** | terminal |

L'apoptose systémique n'est jamais automatique : `apoptosisDecision()` exige
`humanAuthorized: true`. La cryptobiose persiste l'état homéostatique, le plan,
les checkpoints, les preuves et le travail restant avant suspension — le pont
avec `survivalStateService.suspend()` et les snapshots gelés existants.

## Cycle de continuité

```text
SENSE (pulses, télémétrie)
   ↓
HOMEOSTASIS CHECK (contrat d'invariants + preuves runtime)
   ↓
satisfaite → MISSION COMPLETE
bloquée   → DISPATCH continuation (borné, idempotent)
   ↓
WAIT TERMINAL → REFRESH → REEVALUATE
   ↓
satisfaite | encore bloquée → EXHAUSTED
   ↓
stress → ALLOSTASIE | injury → IMMUNITAIRE → RÉGÉNÉRATION
   ↓
viable → QUIESCENCE | starved → CRYPTOBIOSE | irrecoverable → APOPTOSE
```

## Limites actuelles

### Implémenté et vérifié

- **Gate de complétion** : l'homéostasie est l'autorité de terminaison. Le pont
  applique `transitionMissionToComplete()` : une mission dont le contrat est
  insatisfait n'est jamais rapportée `success: true`, même si tous les agents
  sont `completed`. Le verdict final devient `homeostasis_blocked` et
  `MISSION_COMPLETION_BLOCKED` est émis.
- **Feedback loop** : dispatch worker continuation, attente terminaison,
  réévaluation homéostasie — couvert par
  `backend/tests/test_homeostasis_continuation.js` (16 tests).
- **Bornage + idempotence** : budget MAX=3, décision déterministe, compteur par
  `(mission, deviation)`.
- **Sécurité continuation** : permissions héritées du parent, pas élargies ;
  mémoire immunitaire = contrainte dure.
- **Preuves runtime** : collecte depuis dossiers workers, strategy_execution_runs,
  telemetry_events — couvert par `backend/tests/test_mission_evidence.js` (10 tests).
- **Contrat de complétion** : `genome.completionContract` est la source
  d'autorité des invariants et des preuves exigées ; les heuristiques sur le
  prompt ne sont qu'un repli de développement. Le contrat est accepté depuis
  la requête MCP (`completionContract`).
- **Verifiers déclaratifs** : les invariants persistent comme des références
  au catalogue (`context.flag`, `context.list_empty`, `evidence.present`,
  `mission.outcome_success`…), jamais comme des closures JS. Le contrat
  sérialisé est rejouable après redémarrage (`serializeContract` /
  `deserializeContract`).
- **Preuves exigées** : `requiredEvidence` est évalué — invariants satisfaits
  sans preuves ⇒ statut `evidence_missing`, complétion bloquée.
- **Historique d'homéostasie** : chaque observation persiste avec un ID unique
  (`homeostasis_state_<mission>_<uuid>`) ; dix évaluations d'une même mission
  ne collisionnent plus.
- **Pulses réels** : `emitCellPulse` émet en télémétrie (`CELL_PULSE`) avec un
  niveau de stress dérivé des échecs observés.
- **Immunité branchée** : les cellules mortes déclenchent la gate
  (`isSafeToProceed`) ; les morts répétées enrôlent une mémoire immunitaire
  (`prohibitedExactRetry`, `preferredResponse: replace_worker`).
- **Tests dédiés** : `backend/tests/test_mission_continuity.js` (10 tests),
  `test_homeostasis_continuation.js` (16 tests), `test_mission_evidence.js` (10 tests).

### Modèle implémenté, enforcement non intégré

- **Régénération runtime** : `regenerateCell()` crée la cellule dans
  l'organisme mais pas un vrai worker (pas d'INSERT agent, pas de workspace,
  pas de `startMission`). À relier à `agentRecoveryService`.
- **Cryptobiose/quiescence durables** : `enterCryptobiosis()` construit le
  payload à persister mais n'écrit pas ; pas encore de pont vers
  `survivalStateService.suspend()` ni `survival_wake_conditions`.
- **Organisme en RAM** : l'organisme, ses cicatrices et sa mémoire
  immunitaire sont réassemblés à chaque évaluation sans restauration du vécu ;
  la persistance inter-processus reste à faire.
- **Mission = agent racine** : `fetchMissionAgents` utilise l'ID de
  l'orchestrateur comme ID de mission ; la succession d'orchestrateur exigera
  un objet mission indépendant.
- **Succession cellulaire** : suggérée par la charge allostatique, pas
  exécutée.

## Voir aussi

- [architecture-survie.md](architecture-survie.md) — pressions vitales et dormance du survival model ;
- [regulation-multi-boucles.md](regulation-multi-boucles.md) — arbitrage des signaux de contrôle ;
- [resilience-et-reprise](../04-exploitation/resilience-et-reprise.md) — reprise des jobs, snapshots et bisection causale ;
- [epistemologie-et-evidence](../01-concepts/epistemologie-et-evidence.md) — barrières de preuve.
