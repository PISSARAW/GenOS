# GenOS Wiring Matrix — Sense → Reuse

- **Statut** : référence de câblage causal, revue 2026-09-26, HEAD `e2b8e49` (implémentations suivantes : relations, docking, philosophie, foraging, plasmide et promotion génomique) ; corrections 2026-09-27 : §5 Invoke/Affect et §6 Select rétrogradés après traçage (lots morphogenesis-71 et racine-113 : aucun appelant prod).
- **Règle** : `YES` = liaison prouvée par appel de production + test ; `PARTIAL` = présent mais non causal ou consultatif ; `NO` = absent.
- **Lecture** : chaque cellule donne le fichier/fonction précis qui constitue la liaison, ou `—` si absente.

## Légende des colonnes

`Sense → Select → Invoke → Affect decision → Act → Observe → Learn → Persist → Reuse`

## 1. Relations inter-agents → autorité / sélection

| Étape | Statut | Liaison |
|---|---|---|
| Sense | YES | `crossAgentRelationalService.js:listRelations` lit `agent_relations` |
| Select | PARTIAL | `holobionte/runtime/symbiosisPlanner.js:candidatePlan` expose `relationChoice` parmi les partenaires déjà éligibles ; `epistemic/adaptiveEpistemicResponse.js` choisit un vérificateur indépendant si le contexte en fournit. Ces résultats restent conditionnels au catalogue transmis. |
| Invoke | PARTIAL | `relationAuthorityBridge.js:resolveControlByRelation` consulté en fallback par `agentAuthorityService.js:authorizeAgentControl` (`manager/guardian/mentor/parent` forward → contrôle délégué, reçu `relationControl`) |
| Affect decision | PARTIAL | `relationAuthorityBridge.js:filterVerifierCandidates` exclut le lignage ; `adaptiveEpistemicResponse.js` applique la sélection au champ `verifier` ; `assessIndependence` reste branché dans `communicationPolicyEngine.js:finalizeDecision` |
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
| Select | PARTIAL | `morphogenesis/plasmidGateService.js` + `plasmidResolverService.js` sélectionnent les candidats ; validation d'installation via gates dédiés — réserve 2026-09-27 : `plasmidResolverService.js` sans appelant prod (seul `test_plasmid_lifecycle.js:3`) |
| Invoke | PARTIAL | `plasmidInstallService.js` isolé et testé (`test_plasmid_install.js:5`) mais sans appelant prod trouvé le 2026-09-27 ; activation réelle non chaînée |
| Affect decision | PARTIAL | éligibilité déterminée par compatibilité/autorisation/provenance/validation en test isolé ; sans appelant prod, effet non causal (constat 2026-09-27) |
| Act | PARTIAL | cycle install/activation/désactivation/rollback implémenté ; expression reste limitée aux capacités prises en charge par l'installateur |
| Observe | PARTIAL | reçus de validation et d'installation disponibles ; pas de suivi universel de phénotype en production |
| Learn | NO | — |
| Persist | YES | `plasmid_bindings (active/disabled/superseded)` |
| Reuse | PARTIAL | bindings et lifecycle réutilisables ; activation automatique depuis la morphogenèse non universelle |

## 6. Génome : évaluation → promotion → déploiement

| Étape | Statut | Liaison |
|---|---|---|
| Sense | YES | `detectNovelConcepts → GraftSpec → graft/speciate → candidate genome + provenance` |
| Select | PARTIAL | `genomePromotionService.js` classe les candidats avec fitness multiobjectif et gate de promotion ; maturation `speciate/graft` reste partielle — réserve 2026-09-27 : sans appelant prod (seul `test_genome_promotion.js:4`) |
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
| Sense | YES | `regenerationService.js:assessDamage/applyCellDeath` évalue les rôles perdus ; `survivalStateService.js:observe` persiste l'état et ses pressions |
| Select | PARTIAL | `axolotlStrategyHandlers.js:planRegeneration` et `regenerationRuntimeService.js:planRegeneration` produisent des plans ; aucun déclencheur général depuis une panne d'agent |
| Invoke | PARTIAL | `axolotlStrategyHandlers.js:executeRegeneration` exécute une régénération demandée ; `survivalStateService.js:suspend/wake` ferme le flux de dormance par snapshot et condition de réveil |
| Affect decision | PARTIAL | `regenerationRuntimeService.js` exige reçu de restauration, validation de lignée et preuve avant remplacement/apoptose ; `symbiontSuccessionService.js` sélectionne résidents à garder/dormir/réveiller selon les capacités de phase |
| Act | PARTIAL | `regenerationService.js:regenerateCell`, exécution de topologie axolotl et `symbiontSuccessionService.js:applySuccession/resumeDormantSymbiont` agissent, sans orchestration générale commune |
| Observe | YES | cicatrices, signaux vitaux, reçus d'action et `survival_state_events` enregistrent les transitions et récupérations |
| Learn | NO | — |
| Persist | PARTIAL | dormance, snapshot gelé, conditions de réveil et reçus sont persistés ; état complet de l'organisme/régénération pas restauré par un même agrégat durable |
| Reuse | PARTIAL | `wake` restaure le snapshot vérifié et la succession peut reprendre un symbionte dormant ; sélection de ces mécanismes par un contrôleur de mission reste absente |

## 8. Daemons : reproduction causale + réparation déléguée

| Étape | Statut | Liaison |
|---|---|---|
| Sense | YES | `ResidentDaemon` : territoire/événements/findings/handoffs/réconciliation/phénotypes/pression/évaluation |
| Select | PARTIAL | `daemonSupervisorService.js` = vue liveness read-only ; redémarrage = host/process manager |
| Invoke | PARTIAL | `controlledFindingRunnerService.js:runControlledFinding` exécute quatre tests sur deux snapshots à la demande ; `findingLifecycleService.js:onPostTransition` ouvre idempotemment un épisode sur `REPAIRABLE` ; transition + ouverture atomiques ; le contrôleur de mission n'invoque pas encore le runner automatiquement |
| Affect decision | PARTIAL | `findingEvidenceGateService.js` bloque `REPRODUCED` sans réplication, puis `CAUSALLY_SUPPORTED/REPAIRABLE` sans hashes de snapshots cohérents et provenance d'exécution contrôlée (ADR 0135/0143) |
| Act | PARTIAL | lease et épisode délégués au worker ; daemon ne modifie pas le dépôt et certains territoires n'ont pas d'exécuteur actif |
| Observe | YES | findings persistés |
| Learn | PARTIAL | pression/évaluation |
| Persist | YES | findings + episodes |
| Reuse | NO | — |

## 9. NCE : open-endedness / culture / phénotype

| Étape | Statut | Liaison |
|---|---|---|
| Sense | YES | curiosité Node → Rust, `Goal::Explore`, `nceMetadata`, `TOPOLOGY_SIGNALS`, `dispatch_worker`, POET avec artifact réel |
| Select | PARTIAL | `openEndedController.js:generateChildren/selectCandidates` mute des environnements bornés et exige utility/evidence ; `migrationPolicyService.js` sélectionne les cultures versionnées par fronts de Pareto nouveauté × fitness source (ADR 0136) |
| Invoke | PARTIAL | résultats NCE et migration culturelle atteignent respectivement le contrôleur biome et les actions de migration ; pas de cycle unifié entre POET, culture et exécution du phénotype |
| Affect decision | PARTIAL | le rang de front détermine les propagules culturelles admissibles ; gain comportemental du phénotype receveur non inféré |
| Act | PARTIAL | contrôleur open-ended applique les environnements admis ; le transfert culturel est exécuté par le runtime metapopulation après compatibilité |
| Observe | PARTIAL | POET vérifie un artifact en snapshot ; la preuve d'effet culturel sur le phénotype cible reste à relier |
| Learn | NO | — |
| Persist | PARTIAL | — |
| Reuse | NO | — |

## 10. Communication : coûts réels + routage par relations

| Étape | Statut | Liaison |
|---|---|---|
| Sense | YES | chaîne `silence → stigmergie → zero-text → structuré → dialecte → micro-utterance → dialogue → humain`, `communicationPolicyEngine.js` |
| Select | PARTIAL | audience filtrée par `relationshipCommunicationRoutingService.js` selon indépendance et divulgation ; dialecte désactivé si un destinataire n'a pas de profil qui le recommande avec confiance élevée |
| Invoke | PARTIAL | `runCycleDriver.js` enregistre un reçu fournisseur `genos.communication-usage/v1` comme mesuré ; sans reçu, `cost × 500` reste projection séparée et tokens utilisés vaut zéro (ADR 0137) |
| Affect decision | PARTIAL | profil relationnel détermine l'éligibilité audience, le dialecte et le niveau d'accusé maximal ; la confidentialité du payload n'est pas filtrée champ par champ |
| Act | PARTIAL | enveloppe de communication réelle |
| Observe | PARTIAL | compteurs distinguent consommations reçues et projections ; mesure causale d'économie à 100/1000 agents non démontrée |
| Learn | PARTIAL | `communicationLearningService.js` |
| Persist | YES | profils + outbox |
| Reuse | PARTIAL | `relation graph → communication ecology` naissante |

## 11. Node ↔ Rust : reçus typés systématiques

| Étape | Statut | Liaison |
|---|---|---|
| Sense | YES | crates Rust riches (`genos-creativity`, fossilisation, instinct `tick/run_autonomous` → FAP) |
| Select | PARTIAL | `rustBridgeEvidenceService.js` valide les snapshots CLI; `biologicalModeService.js:rustGuaranteesImported=false` reste vrai pour les autres concepts Rust |
| Invoke | PARTIAL | `rustBridgeController.js:createSnapshot` exige code de sortie nul et schéma valide avant l'import; autres bridges ponctuels sans reçus systématiques |
| Affect decision | PARTIAL | un snapshot Rust invalide ou sans provenance persistée est refusé par la route; les autres mécanismes Rust n'influencent pas automatiquement la décision Node |
| Act | PARTIAL | FAP dispatch hôte réel, stimuli dérivés de `WorldState`, pas de sensorium externe général |
| Observe | PARTIAL | reçu `genos.rust-bridge-snapshot/v1` avec hash et scope tenant pour le snapshot; journaux de primitives part instrumentées ailleurs |
| Learn | NO | constantes de physique non apprises par classe de mission |
| Persist | PARTIAL | reçu de snapshot Rust dans `provenance_records`; fossilisation Rust + SQLite + API + MCP + excavation read-only, isolée du cycle évolutif |
| Reuse | NO | `fossils → pattern mining → genome design → priors` non bouclé |

## Règle d'avancement

Chaque passage `PARTIAL/NO → YES` exige : appel de production + test ciblé + reçu/preuve persistée. Succès de transport ≠ décision valide.
