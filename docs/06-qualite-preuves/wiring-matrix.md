# GenOS Wiring Matrix — Sense → Reuse

- **Statut** : référence de câblage causal, revue 2026-09-26, HEAD `e2b8e49` (implémentations suivantes : relations, docking, philosophie, foraging, plasmide et promotion génomique).
- **Règle** : `YES` = liaison prouvée par appel de production + test ; `PARTIAL` = présent mais non causal ou consultatif ; `NO` = absent.
- **Lecture** : chaque cellule donne le fichier/fonction précis qui constitue la liaison, ou `—` si absente.

## Légende des colonnes

`Sense → Select → Invoke → Affect decision → Act → Observe → Learn → Persist → Reuse`

## 1. Relations inter-agents → autorité / sélection

| Étape | Statut | Liaison |
|---|---|---|
| Sense | YES | `crossAgentRelationalService.js:listRelations` lit `agent_relations` |
| Select | PARTIAL | `morphogenesis/relationResolverService.js:selectVerifier/selectPartner` ; bridge filtre le lignage des candidats vérificateurs, sélection de partenaires pas encore branchée à la formation des workers |
| Invoke | PARTIAL | `relationAuthorityBridge.js:resolveControlByRelation` consulté en fallback par `agentAuthorityService.js:authorizeAgentControl` (`manager/guardian/mentor/parent` forward → contrôle délégué, reçu `relationControl`) |
| Affect decision | PARTIAL | `relationAuthorityBridge.js:filterVerifierCandidates` exclut le lignage ; `assessIndependence` branché dans `communicationPolicyEngine.js:finalizeDecision` |
| Act | NO | `manager/guardian` ne modifient ni autorité ni budget |
| Observe | PARTIAL | `communicationLearningService.js` incrémente `interaction_count/familiarity` |
| Learn | NO | presets non calibrés |
| Persist | YES | `agent_relations` + `plasmid_bindings` via `recordPlasmid` |
| Reuse | PARTIAL | `getRelationProfile` repli `stranger`, sans consommateur runtime |

## 2. Docking stérique MCP / ligand-récepteur

| Étape | Statut | Liaison |
|---|---|---|
| Sense | YES | `mcpLigandReceptorService.js:dockLigandToReceptor` + `checkCnidocyteReflex` |
| Select | YES | `mcpExecutor/dispatch.js:preValidateTool` appelle `mcpContract.js:validateStericOrSchema` après registre + lease |
| Invoke | YES | réflexe cnidocyte = rejet dur `reflex_discharged/MCP_STERIC_REFLEX` ; `docked` = reçu joint au contexte puis au résultat via `withDocking` |
| Affect decision | PARTIAL | le réflexe bloque ; le docking n'outrepasse ni leases ni registre ni schema (pas d'affaiblissement) |
| Act | PARTIAL | blocage réflexe prouvé ; validation schema conservée |
| Observe | YES | reçu `docking` retourné dans le résultat de `executeConfiguredTransport` et dans le rejet réflexe |
| Learn | NO | seuils `ΔG` fixes |
| Persist | NO | — |
| Reuse | NO | — |

Cible : `preValidateTool` appelle le docking en premier (réflexe = rejet dur, `docked` = preuve jointe), sans affaiblir leases/registre/schema.

## 3. Philosophie → politique cognitive

| Étape | Statut | Liaison |
|---|---|---|
| Sense | YES | `philosophyRouter.js` + `philosophyAnalysisContract.js` retournent `status/evidence/uncertainty/provenance/promotionEligible=false` |
| Select | PARTIAL | `cognitivePostureService.js:detectPosture` classifie le prompt au `buildWorkerMission` (heuristique documentée) |
| Invoke | PARTIAL | `orchestratorDispatchService.js:applyCognitivePosture` sélectionne et joint une posture cognitive à chaque dispatch worker |
| Affect decision | PARTIAL | directive de posture ajoutée au prompt worker + reçu `mission.cognitivePosture` ; l'analyse philosophique reste consultative et ne gouverne pas les gates de décision |
| Act | NO | — |
| Observe | PARTIAL | `philosophyAnalysisPersistenceService.js` persiste l'analyse |
| Learn | NO | — |
| Persist | PARTIAL | analyse persistée, effet non persisté sauf `apply:true` via `telemetryObserver` |
| Reuse | NO | — |

## 4. Web foraging en boucle fermée

| Étape | Statut | Liaison |
|---|---|---|
| Sense | PARTIAL | `browserScoutService.js` lit HTTP/HTML ; `fovealVisionService.js` = ROI/hash/manifeste sans pixels |
| Select | PARTIAL | `genos_optimal_foraging` calcule rendement/saut/budget et `foragingLoopService.js` traduit les actions de foraging en navigation |
| Invoke | PARTIAL | `foragingLoopService.js` relie `PATCH_DEPARTURE` à la navigation browser et `EXPLOIT` à une observation via `forage_step` ; boucle bornée aux actions prises en charge |
| Affect decision | PARTIAL | décision de foraging modifie la prochaine navigation ; aucune perception pixel fovéale n'est intégrée |
| Act | PARTIAL | `browser_act:fill/select_option/submit` = état local simulé ; `Computer Use` séparé sans état partagé |
| Observe | PARTIAL | `forage_step` rend une observation à l'itération de foraging ; sessions browser persistées |
| Learn | NO | — |
| Persist | PARTIAL | sessions + manifestes |
| Reuse | PARTIAL | observation retournée au caller de la boucle ; apprentissage durable des politiques de foraging non établi |

## 5. Plasmide → installation vérifiée de capacité

| Étape | Statut | Liaison |
|---|---|---|
| Sense | YES | `capabilityPlasmidService.js:createPlasmid/assimilate` vérifie hash + tests requis |
| Select | PARTIAL | `morphogenesis/plasmidGateService.js` + `plasmidResolverService.js` sélectionnent les candidats ; validation d'installation via gates dédiés |
| Invoke | YES | `plasmidInstallService.js` exécute le contrat d'installation et les cinq gates avant activation |
| Affect decision | YES | compatibilité, autorisation, provenance, validation et preuve déterminent l'éligibilité à l'installation |
| Act | PARTIAL | cycle install/activation/désactivation/rollback implémenté ; expression reste limitée aux capacités prises en charge par l'installateur |
| Observe | PARTIAL | reçus de validation et d'installation disponibles ; pas de suivi universel de phénotype en production |
| Learn | NO | — |
| Persist | YES | `plasmid_bindings (active/disabled/superseded)` |
| Reuse | PARTIAL | bindings et lifecycle réutilisables ; activation automatique depuis la morphogenèse non universelle |

## 6. Génome : évaluation → promotion → déploiement

| Étape | Statut | Liaison |
|---|---|---|
| Sense | YES | `detectNovelConcepts → GraftSpec → graft/speciate → candidate genome + provenance` |
| Select | PARTIAL | `genomePromotionService.js` classe les candidats avec fitness multiobjectif et gate de promotion ; maturation `speciate/graft` reste partielle |
| Invoke | PARTIAL | promotion soumise à un gate explicite et à ses preuves ; l'opérateur garde l'autorité finale |
| Affect decision | PARTIAL | fitness et preuves de promotion gouvernent l'éligibilité, sans sélection darwinienne autonome globale |
| Act | PARTIAL | candidat promu déployable par le service ; déploiement automatique universel non revendiqué |
| Observe | PARTIAL | reçu de promotion/deployment et evidence references ; surveillance continue variable selon le caller |
| Learn | PARTIAL | fitness multiobjectif calculé et persisté ; boucle universelle d'apprentissage des poids non établie |
| Persist | YES | génome candidat + provenance |
| Reuse | PARTIAL | reçu et provenance permettent audit/réutilisation ; surveillance et rollback automatiques non systématiques |

## 7. Organisme : régénération / dormance / succession

| Étape | Statut | Liaison |
|---|---|---|
| Sense | YES | gate de complétion, feedback continuation, bornage/idempotence, preuves runtime, immunité câblés et testés |
| Select | NO | régénération runtime non reliée |
| Invoke | NO | dormance durable non persistée complètement |
| Affect decision | NO | succession non fermée |
| Act | NO | `agent mort → diagnostic → réserve/lignée → régénération → restauration → preuve` non systématique |
| Observe | PARTIAL | findings/hand offs daemon |
| Learn | NO | — |
| Persist | PARTIAL | persistance organisme incomplète |
| Reuse | NO | — |

## 8. Daemons : reproduction causale + réparation déléguée

| Étape | Statut | Liaison |
|---|---|---|
| Sense | YES | `ResidentDaemon` : territoire/événements/findings/handoffs/réconciliation/phénotypes/pression/évaluation |
| Select | PARTIAL | `daemonSupervisorService.js` = vue liveness read-only ; redémarrage = host/process manager |
| Invoke | PARTIAL | `finding → repair episode → claim → worker → verify` préparé, certains daemons sans exécuteur ni FS |
| Affect decision | NO | reproduction causale (snapshot + contrôle) différée (ADR 0034/D9) ; v1 = ré-observation indépendante |
| Act | NO | daemon seul ≠ circuit fermé (volontaire pour l'autorité) |
| Observe | YES | findings persistés |
| Learn | PARTIAL | pression/évaluation |
| Persist | YES | findings + episodes |
| Reuse | NO | — |

## 9. NCE : open-endedness / culture / phénotype

| Étape | Statut | Liaison |
|---|---|---|
| Sense | YES | curiosité Node → Rust, `Goal::Explore`, `nceMetadata`, `TOPOLOGY_SIGNALS`, `dispatch_worker`, POET avec artifact réel |
| Select | PARTIAL | `open_ended` de l'environment generator = placeholder |
| Invoke | PARTIAL | sélection culturelle = somme pondérée scalaire, pas de front de Pareto/niches/drift |
| Affect decision | NO | validation causale E2E `play/phenotype/culture/POET` encore demandée |
| Act | PARTIAL | metadata différente sans preuve de comportement différent |
| Observe | PARTIAL | artifacts POET réels |
| Learn | NO | — |
| Persist | PARTIAL | — |
| Reuse | NO | — |

## 10. Communication : coûts réels + routage par relations

| Étape | Statut | Liaison |
|---|---|---|
| Sense | YES | chaîne `silence → stigmergie → zero-text → structuré → dialecte → micro-utterance → dialogue → humain`, `communicationPolicyEngine.js` |
| Select | PARTIAL | checkpoint en shadow par défaut ; `tokensProjected` par coefficients, `tokens ≈ cost × 500` par endroits, sans tokenizer réel |
| Invoke | PARTIAL | dialecte implémenté, `confidence` stockée sans décisions adaptatives complètes |
| Affect decision | NO | relations ne gouvernent pas qui parle / quel vérificateur / quelle autorité / quelle confidentialité |
| Act | PARTIAL | enveloppe de communication réelle |
| Observe | NO | mesure causale d'économie tokens à 100/1000 agents non démontrée |
| Learn | PARTIAL | `communicationLearningService.js` |
| Persist | YES | profils + outbox |
| Reuse | PARTIAL | `relation graph → communication ecology` naissante |

## 11. Node ↔ Rust : reçus typés systématiques

| Étape | Statut | Liaison |
|---|---|---|
| Sense | YES | crates Rust riches (`genos-creativity`, fossilisation, instinct `tick/run_autonomous` → FAP) |
| Select | NO | `biologicalModeService.js:rustGuaranteesImported=false` : concepts Rust ≠ preuve Node sans reçu typé ou journal de primitives |
| Invoke | PARTIAL | bridges ponctuels, pas de reçus typés systématiques |
| Affect decision | NO | sophistication Rust ⇏ comportement orchestrateur Node sans bridge causal explicite |
| Act | PARTIAL | FAP dispatch hôte réel, stimuli dérivés de `WorldState`, pas de sensorium externe général |
| Observe | PARTIAL | journaux de primitives part instrumentées |
| Learn | NO | constantes de physique non apprises par classe de mission |
| Persist | PARTIAL | fossilisation Rust + SQLite + API + MCP + excavation read-only, isolée du cycle évolutif |
| Reuse | NO | `fossils → pattern mining → genome design → priors` non bouclé |

## Règle d'avancement

Chaque passage `PARTIAL/NO → YES` exige : appel de production + test ciblé + reçu/preuve persistée. Succès de transport ≠ décision valide.
