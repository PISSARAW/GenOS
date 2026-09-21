# Continuité de mission : l'organisme logiciel

- **Statut** : Implémenté (câblé au pont d'orchestration, succession cellulaire restante)
- **Portée** : control plane Node, services de survie de mission
- **Dernière revue** : 2026-09-21

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

## 3. Signaux vitaux

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

## 4. Système immunitaire

Deux couches :

- **Gates de preuve** (`immuneGateService.js`) : évaluation pondérée de gates, scan de menaces (injection SQL/commande/traversée/prompt), détection d'anomalie multi-niveaux, décision de quarantaine. `isSafeToProceed()` combine anomalie et couverture fonctionnelle des tissus.
- **Mémoire immunitaire** (`immuneMemoryService.js`) : après `Stratégie A → crash → retry A → crash`, l'organisme produit un anticorps conceptuel — une signature d'échec SHA-256 avec `prohibitedExactRetry: true` et une réponse préférée (`replace_worker`). La reconnaissance d'une signature déjà vue interdit le retry exact et propose la réponse apprise.

## 5. Régénération

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

## 6. Survie : quiescence, cryptobiose, apoptose

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
HOMEOSTASIS CHECK (contrat d'invariants)
   ↓
healthy → continue | stress → ALLOSTASIS | injury → IMMUNE RESPONSE
   ↓
deviation → REGENERATION (évaluation, remplacement, cicatrice)
   ↓
viable-inactif → QUIESCENCE | starved → CRYPTOBIOSIS | irrecoverable → APOPTOSIS
   ↓
homéostasie cible + preuve de complétion → MISSION COMPLETE
```

## Limites actuelles

- Les six systèmes noyaux sont implémentés, testés unitairement et câblés au
  pont d'orchestration : `genos-orchestrate.cjs` émet des pulses vitaux pendant
  `waitForCompletion` (toutes les ~5 s) et évalue l'homéostasie de l'organisme
  à la finalisation ; le verdict est persisté dans `homeostasis_states`
  (migration 033) et rapporté dans le champ `continuity` de la sortie JSON.
- `missionContinuityService.js` assemble l'organisme depuis les agents réels
  en base (`fetchMissionAgents` → cellules avec statut vital dérivé).
- L'échec d'un spawn de runtime (ENOENT Windows trompeur quand le cwd capsule
  a été réclamé par un process concurrent) est réparé : recréation du cwd,
  handler d'erreur synchrone, probe avec retry (`spawnRuntimeWithRetry`).
- La mémoire immunitaire vit dans l'organisme en mémoire ; sa persistance
  inter-processus passe par la mémoire échouée existante des stratégies.
- La succession cellulaire (transmission contrôlée avant épuisement de
  contexte) est suggérée par la charge allostatique mais pas encore exécutée.
- L'évaluation d'homéostasie en fin de mission utilise le verdict de sortie
  (`outcome.success`) comme proxy `testsPassed` ; les invariants fonctionnels
  réels (tests exécutés, fichiers interdits) exigent un contexte de mission
  explicite, encore à brancher sur les exécuteurs de preuve.

## Voir aussi

- [architecture-survie.md](architecture-survie.md) — pressions vitales et dormance du survival model ;
- [regulation-multi-boucles.md](regulation-multi-boucles.md) — arbitrage des signaux de contrôle ;
- [resilience-et-reprise](../04-exploitation/resilience-et-reprise.md) — reprise des jobs, snapshots et bisection causale ;
- [epistemologie-et-evidence](../01-concepts/epistemologie-et-evidence.md) — barrières de preuve.