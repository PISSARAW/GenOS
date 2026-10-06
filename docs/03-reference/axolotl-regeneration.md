# Axolotl — Contrat de régénération du backend

- **Statut** : Implémenté dans le runtime natif Axolotl.
- **Portée** : backend Node, SQLite et workers déterministes de routage/rappel.
- **Dernière revue** : 2026-10-06.

## 1. Point d’entrée et propriété

Les primitives sont enregistrées dans
[`axolotlStrategyHandlers.js`](../../backend/src/services/primitiveHandlers/axolotlStrategyHandlers.js)
et accessibles par le dispatch générique `genos_execute_primitive`. Les noms de
primitives ci-dessous ne sont pas des outils MCP publics supplémentaires.
L’enveloppe MCP dépend du schéma réellement découvert ; les leases, permissions
et le confinement du dispatch existant restent applicables.

Les entrées décrivent le **contexte de la primitive**. `orchestratorId` identifie
un agent en mode `orchestrator` ; les aliases `orchestrator_id` et `agentId` sont
normalisés par le handler. Le backend fournit sa connexion SQLite. Une session
appartient à cet orchestrateur et à son workspace courant. Un autre propriétaire
ou un changement de workspace bloque son utilisation.

## 2. Primitives

| Primitive | Entrées spécifiques | Résultat et condition |
| --- | --- | --- |
| `assess_regeneration` | `failureContext`, éventuellement `lastSnapshot`, `currentTopology` | `need_regeneration`, mode et portée ; contexte d’échec obligatoire |
| `plan_regeneration` | `mission`, `currentTopology`, `functionalContract` ; options de portée, cognition et budget | `sessionId`, statut `planned` ; baseline cohérente avec le graphe actif |
| `prepare_cognitive_learning` | `sessionId`, éventuellement `candidates` | Candidats préparés ; session encore `planned` |
| `execute_regeneration` | `sessionId`, éventuellement `retry: true` | Statut, `newTopology`, validation, coût, `evidenceRef` en cas de résultat final |
| `validate_equivalence` | `sessionId` | Preuve native de la session `completed`, liée au graphe actif ; aucun simple contrôle de forme n’est admis |
| `promote_cognitive_candidate` | `sessionId`, éventuellement `candidateId` ou `candidate_id` | Promotion L0 idempotente des candidats étayés ; sans ID, traite ceux de la session |
| `inspect_regeneration` | `sessionId` | Session durable : essais, candidats, versions, preuve, coûts ou erreur |
| `rollback_regeneration` | `sessionId` | Restauration de la source et révocation des traits L0 de la dernière adoption |
| `request_metamorphosis` | `to`, `reason`, éventuellement `evidenceRefs` | `success`, transition ou `reason` de refus ; budget et observations contrôlés |
| `observe_axolotl` | Orchestrateur, éventuellement `executionBudget` | Exécution native du contrat actif ; observation et `evidenceRef`, y compris si la probe échoue |
| `axolotl_cost_report` | Orchestrateur | Coûts de ses sessions, nombre d’observations et comparaison descriptive |
| `axolotl_route` | `from`, `to`, `payload` | Route active vérifiée puis message persistant ; `queued: true`, `messageId`, version |
| `axolotl_inbox` | `componentId`, éventuellement `limit` | Consommation atomique des messages en attente ; limite 20 par défaut, de 1 à 100 |
| `axolotl_recall` | `key` | Valeur cognitive du graphe actif et version |

Le pipeline `axolotl_regeneration` utilise les six premières primitives et
transmet `sessionId` puis topologie entre phases. Si l’assessment conclut à
`no_action` ou `restore_classic`, les phases suivantes renvoient explicitement
`skipped: true`, `status: not_required`. Le sélecteur favorise une réparation
structurelle ; les contraintes d’éligibilité restent actives et leur échec peut
produire `STRATEGY_NO_ELIGIBLE_CANDIDATE`.

## 3. Plan, contrat et budgets

La [fiche conceptuelle](../01-concepts/biomimetisme/axolotl.md#contrat-et-parcours)
contient un exemple JSON de contexte de plan. Champs du plan :

| Champ | Contrat |
| --- | --- |
| `mission` | Chaîne non vide |
| `currentTopology` | Graphe de 1 à 256 composants, au plus 4 096 connexions ; IDs/rôles/types de 1 à 160 caractères (`[\w.-]`), IDs uniques et extrémités existantes ; `knowledge` optionnel |
| `scope` | `{ "type": "global" }` par défaut ; ou `components` avec `componentIds`, ou `roles` avec `roles` |
| `functionalContract.requiredRoles` | Liste non vide de rôles à conserver |
| `functionalContract.probes` | De 1 à 1 000 probes, IDs uniques, chacune avec un résultat `expected` |
| Probe `route` | `id`, `kind: "route"`, `from`, `to`, `payload`, `expected` ; chemin dirigé à travers des composants disponibles |
| Probe `recall` | `id`, `kind: "recall"`, `key` non vide, `expected` ; comparaison du contenu stocké |
| `executionBudget` | Entiers strictement positifs ; valeurs et plafonds ci-dessous |
| `cognitiveScope` | Clés explicitement autorisées pour la reconstruction cognitive |
| `cognitiveSourceRefs` | Couples `{ "memoryId": "…", "key": "…" }`, mémoires épisodiques non purgées du parent |
| `preferredPreservation` | Candidats déclarés, notamment `{ "key": "rule", "content": "safe" }` |

| Budget | Défaut | Maximum |
| --- | ---: | ---: |
| `events` | 1 000 | 100 000 |
| `durationMs` | 10 000 | 60 000 |
| `experiments` | 32 | 128 |

Les essais cognitifs consomment le même budget d’événements et la deadline de
session. Le budget d’expériences réserve la baseline et la validation finale :
`nombre de candidats + 2 <= experiments`. Une préparation accepte au plus 128
candidats, mais le budget effectif peut imposer une limite inférieure.

Un candidat porte `id` optionnel, `key`, `content`, `sourceRefs` optionnelles.
Sa clé doit appartenir au périmètre cognitif et être couverte par une probe de
rappel ; son contenu JSON est limité à 65 536 octets. Omettre `candidates`
utilise les sources préservées du plan ; fournir `[]` ne prépare aucun candidat.
Les mémoires d’un autre agent ou purgées sont refusées.

## 4. Admission, persistance et reprise

[`axolotlStateStore.js`](../../backend/src/services/axolotlStateStore.js) crée de
façon idempotente `axolotl_state` et `axolotl_evidence`. Sessions, topologies,
plasticité, observations et messages sont versionnés ; les preuves conservent
les liens avec contrat, sujet, session, exécution et code du vérificateur.
L’adoption utilise une transaction et exige une version source inchangée.

| État de session | Action disponible |
| --- | --- |
| `planned` | Préparer les candidats ou exécuter |
| `executing` | Attendre ; reprise possible seulement après la deadline |
| `completed` | Inspecter, valider, promouvoir sous preuves ; rollback si dernière adoption |
| `rejected` | Le contrat final a échoué ; corriger le contexte et créer un nouveau plan |
| `failed` | Inspecter l’erreur ; reprise explicite avec `retry: true`, sous les mêmes gates |
| `rolled_back` | Archive conservée ; nouvelle réparation par un nouveau plan |

La nursery épinglée exécute des données JSON dans des workers Node, sans code
client, outils ni credentials du parent, avec deadline et limites mémoire.
Les essais cognitifs doivent réussir leurs probes ciblées sans régresser sur
celles déjà réussies. La validation finale porte sur le contrat complet.
Une vérification structurelle, un callback client ou un lancement de worker
ne remplace pas cette preuve.

La promotion L0 vérifie les preuves de l’essai et de l’admission, le contenu,
le contrat et la topologie toujours active ; répéter une promotion ne crée pas
un second trait. Le rollback ne peut écraser une génération ultérieure et
révoque les traits de la session. Il restaure la source, qui peut être défaillante.
Les anciennes maps adaptatives restent des archives à replanifier.

## 5. Métamorphose et coût

Le régulateur démarre en `NEOTENIC` avec 10 transitions par fenêtre d’une heure.
Une transition réussie consomme une unité et ouvre une temporisation de
30 secondes. `reason` doit être non vide. Transitions autorisées :

| Depuis | Vers |
| --- | --- |
| `NEOTENIC` | `PLASTIC`, `DIFFERENTIATING`, `EMERGENCY_PLASTIC` |
| `PLASTIC` | `NEOTENIC`, `DIFFERENTIATING`, `EMERGENCY_PLASTIC` |
| `DIFFERENTIATING` | `PLASTIC`, `CONSOLIDATING`, `EMERGENCY_PLASTIC` |
| `CONSOLIDATING` | `STABLE`, `PLASTIC`, `EMERGENCY_PLASTIC` |
| `STABLE` | `NEOTENIC`, `PLASTIC`, `EMERGENCY_PLASTIC` |
| `EMERGENCY_PLASTIC` | `PLASTIC`, `DIFFERENTIATING` |

`CONSOLIDATING` exige deux observations natives positives distinctes ; `STABLE`
en exige trois. Leurs preuves doivent avoir moins de cinq minutes, concerner le
graphe actif et un même contrat ; les observations les plus récentes doivent
également réussir. Un ancien succès ne masque pas un échec récent. Les deux
états gèlent les mutations structurelles, y compris l’organisation dynamique.
`EMERGENCY_PLASTIC` exige une preuve native d’échec sur le graphe actif ; cette
transition déroge à la temporisation, conserve le budget et les autres gates.

Le rapport de coût porte sur événements, durée réelle et changements observés
du graphe. Il utilise les résultats natifs plutôt qu’un `observedCost` déclaré
par le client. Les tokens et dollars sont absents sans producteur natif ; une
valeur manquante n’est pas zéro. La comparaison stable/plastique exige au moins
trois observations dans chaque mode sous un même contrat et reste descriptive.

## 6. Messages et limites de preuve

`axolotl_route` borne le payload à 65 536 octets et refuse une version de routage
devenue obsolète avant l’écriture. Les messages suivent `originId`, l’identité
logique conservée après remplacement. `axolotl_inbox` consomme chaque message
une fois : aucune relivraison automatique après cette consommation. La mise
en file et la consommation ne démontrent pas le traitement par un agent métier.
La composition biologique utilise les composants admis ; sans admission, son
statut reste `awaiting_regeneration`.

L’admission prouve les comportements de routage/rappel **couverts par le contrat**.
Elle ne certifie ni une mission LLM arbitraire, ni la vérité sémantique générale,
ni une promotion au-delà de L0. Le déclenchement général depuis toute panne
n’est pas intégré. Cette référence décrit le runtime Node ; elle ne revendique
pas une implémentation Axolotl équivalente dans les crates Rust.

## 7. Refus à interpréter

Les handlers exposent `success: false` avec `code`/`error` en cas d’exception.
Le régulateur expose également `reason`. L’échec de probes est un résultat
natif refusé, avec sa preuve conservée, et doit rester visible.

| Code ou motif | Interprétation |
| --- | --- |
| `STRATEGY_CONTEXT_INCOMPLETE` | Assessment sans contexte d’échec |
| `AXOLOTL_FUNCTIONAL_CONTRACT_REQUIRED`, `AXOLOTL_PROBE_INVALID` | Contrat absent ou probe invalide |
| `AXOLOTL_BASELINE_MISMATCH`, `AXOLOTL_EXECUTION_SUPERSEDED` | Graphe source différent ou tentative remplacée |
| `AXOLOTL_SESSION_ACCESS_DENIED`, `AXOLOTL_WORKSPACE_CHANGED` | Mauvais propriétaire ou workspace modifié |
| `REGENERATION_SESSION_NOT_PLANNED` | État non exécutable, tentative active ou retry non autorisé |
| `AXOLOTL_DURATION_BUDGET_EXHAUSTED`, `AXOLOTL_EVENT_BUDGET_EXHAUSTED`, `AXOLOTL_EXPERIMENT_BUDGET_EXHAUSTED` | Borne d’exécution atteinte |
| `COGNITIVE_CANDIDATE_UNSUPPORTED`, `COGNITIVE_TOPOLOGY_SUPERSEDED` | Candidat sans preuve admise ou topologie remplacée |
| `AXOLOTL_ROLLBACK_CONFLICT` | Une génération ultérieure interdit ce rollback |
| `transition_not_allowed`, `cooldown_active`, `change_budget_exhausted` | Métamorphose non autorisée à cet instant |
| `AXOLOTL_STABILITY_EVIDENCE_REQUIRED`, `AXOLOTL_EMERGENCY_EVIDENCE_REQUIRED` | Observations natives insuffisantes |

## 8. Sources et reproduction

- [Fiche Axolotl](../01-concepts/biomimetisme/axolotl.md) — cinq capacités et architecture.
- [Reprise opérationnelle](../04-exploitation/resilience-et-reprise.md#régénération-axolotl) — inspection, retry et rollback.
- [ADR 0325](../adr/0325-regeneration-axolotl-executable.md) — décision d’admission native.
- [Suite dédiée](../../backend/tests/test_axolotl_suite.js) — huit suites SQLite/workers réels.

Commande de reproduction : `npm --prefix backend run test:axolotl`.
La suite est incluse dans les tests par défaut du backend ; sa réussite concerne
le contrat natif ci-dessus et ne prouve pas la réussite des autres suites du dépôt.
