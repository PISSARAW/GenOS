# Plan d'implémentation — régulation avec ressource externe et orchestration complète

- **Type** : plan de réalisation
- **Statut** : en cours ; lots 0 à 2 implémentés, lots 3 à 5 partiels, lot 6 ouvert
- **Portée** : les 19 types natifs, superviseur et `genos_orchestrate`
- **Dernière revue** : 2026-10-11

Ce plan réalise les [critères de qualification](qualification-regulation-ressources-orchestrate.md). Le [protocole actuel](regulation-workers-protocole.md) sert de référence de non-régression pour la restauration de snapshot simulé.

## Avancement vérifié au 11 octobre 2026

Le fournisseur distinct, son ledger conservatif, les preuves signées et la méthode native `replenish_external_quota` sont implémentés. Une sonde ciblée vérifie le refus d'un worker hors plage, la recharge par un vrai `recovery_worker`, la relecture du solde et la reprise supervisée. Elle prépare encore le parent, le helper, les contrats et les runs dans SQLite ; cette réussite **ne valide pas** la planification par `genos_orchestrate` ni la matrice externe 19 × 2. Le coordinateur de récupération automatique, la réconciliation après crash et la qualification de bout en bout par `genos_orchestrate` restent ouverts. Un second incrément ajoute `native_objectives` à `genos_orchestrate` : le catalogue sélectionne le type natif par `methodId`, réserve les tokens et refuse une divergence de type, méthode ou budget au dispatch. Une sonde de plan passe pour les 19 types. La campagne externe ciblée 19 × 2 et son auditeur indépendant passent également (38/38), sous contrats préparés par la sonde. Un essai du vrai CLI a créé un `scout_cell` et exécuté `scan_literal` jusqu'à `AGENT_COMPLETED`, mais le run a ensuite été bloqué par `require_independent_verification` et le parent a expiré faute de modèle local exploitable (`llama-server` absent). Ce trajet reste **non qualifié** au statut terminal.
Le plan natif réserve maintenant l'identifiant de chaque worker avant sa création et le dispatch refuse un identifiant substitué. Cette identité stable est nécessaire pour lier ensuite le compte externe et la récupération au worker planifié.

### Travaux bloquants observés

1. Faire planifier et créer par `genos_orchestrate` le `recovery_worker`, son bail et la référence au run de réparation avant le worker cible. La sonde positive ne doit plus insérer ces objets dans SQLite.
2. Rendre la récupération durable aux frontières `planned → transfer → receipt → measurement → applied → verified`, avec réconciliation par `operationId` après crash et sans double débit de réserve.
   La réponse HTTP perdue après le transfert est désormais récupérée par lecture signée de `operationId`, et la sonde injecte cette perte. La reprise après crash du backend et la journalisation des frontières restent à faire.
3. Fournir une vérification indépendante admissible par `require_independent_verification` pour chaque méthode native. Des domaines testés existent maintenant pour `scan_literal`, `monitor_samples` et `subset_sum`, avec run terminé par deux processus vérificateurs ; les autres méthodes restent à couvrir. Le garde de promotion ne doit pas être contourné.
4. Rendre disponible un exécuteur de synthèse du parent ou une clôture déterministe prouvée pour les missions entièrement natives. L'essai local a expiré après échec de chargement du binaire `llama-server` par Ollama.
5. Lancer les 38 parcours externes par le véritable outil MCP configuré sur D:, attendre leurs statuts terminaux et auditer plans, contrats, runs, reçus, soldes et registre fournisseur. Le MCP actuellement connecté vise C: et a refusé le mismatch de workspace avant dispatch ; ne pas compter cet essai. Ajouter refus de falsification, mauvaise mission, budget, concurrence et redémarrage.
## Choix technique de départ

Utiliser des **crédits d'exécution** comme ressource extérieure mesurable. Un processus fournisseur contrôlé possède sa propre base et son registre `réserve / solde par compte / dépensé`. Le backend GenOS ne peut modifier ces valeurs qu'au moyen de l'API du fournisseur. Celui-ci signe les reçus avec une clé privée ; GenOS connaît seulement la clé publique. Pour une réserve initiale `C0`, l'invariant est `réserve + Σ soldes + dépensé = C0`. Un transfert accroît le solde d'un worker et diminue la réserve du même montant ; une consommation déplace des crédits du solde vers `dépensé`.

L'énergie réglementaire liée à cette ressource doit être dérivée d'une lecture fraîche du fournisseur, par exemple `min(1, solde / capacité contractuelle)`. La capacité, l'unité, la durée de validité et la fonction exacte de conversion sont scellées dans le contrat de mission. L'intégrité, la survie et le stress gardent leurs propres capteurs et seuils ; une recharge de crédits ne les corrige pas artificiellement. La première campagne prouvera un fournisseur réel **hors du processus GenOS**, contrôlé localement. Une intégration à un service tiers constituera une qualification supplémentaire.

## Ordre d'exécution et livrables

| Lot | Dépend de | Travail | Critère de sortie |
| --- | --- | --- | --- |
| 0. Contrats et baseline | — | Figer formats de mesure, reçu, lease et plan ; créer l'ADR d'architecture ; conserver la matrice 19 × 2 existante comme référence. | Schémas versionnés, ADR indexé, tests actuels verts. |
| 1. Fournisseur mesuré | 0 | Construire le fournisseur à processus distinct, son ledger durable et l'adaptateur de lecture/transfert côté backend. | Conservation, lecture indépendante, signature, idempotence, concurrence et redémarrage testés. |
| 2. Récupération native | 1 | Ajouter une méthode native de transfert au `recovery_worker` et un reçu spécifique. | Worker réel transfère des crédits sous bail ; `restore_checkpoint` ne peut pas satisfaire ce contrat. |
| 3. Supervision intégrée | 2 | Déclencher, vérifier et persister la récupération depuis le superviseur ; lier solde externe et état réglementaire. | Aucun worker hors plage ne démarre sans mesure fraîche et reçu valide ; reprise après crash sans double crédit. |
| 4. Planification et dispatch | 0, 3 | Faire produire au chemin `genos_orchestrate` un plan typé, les contrats et le worker de récupération. | Plan et exécution réconciliés ; aucun parent, contrat ou run créé à la main par le test positif. |
| 5. Campagne de bout en bout | 4 | Lancer deux cycles pour chacun des 19 types depuis le vrai outil MCP ; auditer les preuves et les refus. | 38/38 parcours complets, contrôles négatifs et statut terminal vérifiés. |
| 6. Stabilisation | 5 | Exécuter les gates, documenter la commande de reproduction et le verdict daté. | Qualité, Node et Rust verts ; branche propre et artefacts de preuve hors Git sur D:. |

### Lot 0 — Contrats, invariants et décision

- Ajouter un ADR dans [`docs/adr/`](../adr/README.md) : choix de la ressource, séparation fournisseur/GenOS, propriété de la clé privée, autorité du superviseur, conservation, échec partiel et compatibilité avec le mode checkpoint.
- Versionner sous `spec/` un schéma de mesure (`providerId`, `accountId`, `missionId`, `tenantId`, unité, solde, réserve, version, horodatage, expiration) et un schéma de reçu (`operationId`, clé d'idempotence, montant, soldes/versions avant-après, signature, run et lease). Un `kind` explicite distingue `external_refill` de `checkpoint_restore`.
- Établir des valeurs de test et l'invariant `R + B + S = C0`. Fixer le délai maximal d'une mesure et le traitement d'une réponse ambiguë. Ajouter les identifiants de corrélation à la télémétrie.
- Vérifier la baseline actuelle avec `backend/tests/probes/test_real_worker_regulation.cjs` et l'auditeur associé avant tout changement de runtime.

### Lot 1 — Fournisseur et capteur

- Créer un serveur de test autonome sous `backend/tests/fixtures/` avec base SQLite séparée sur D:, clé privée éphémère non commitée, comptes par tenant/mission/worker, `GET balance`, `POST transfer` et `POST spend`. Les opérations sont atomiques et rejouables par `operationId` sans second effet.
- Ajouter dans `backend/src/services/regulation/` un adaptateur fournisseur borné : configuration explicite, clé publique épinglée, timeouts, contrôle des versions, validation d'unité et refus des mesures expirées. La lecture du solde après transfert doit être un appel distinct du reçu de transfert.
- Tester dans deux processus et deux connexions : débit/crédit exacts, course de deux transferts, requête répétée, autre tenant, fournisseur absent, redémarrage et reçu/signature altérés.

### Lot 2 — Méthode native de recharge

- Étendre [`workerExecutorRegistry.js`](../../backend/src/services/agents/workerExecutorRegistry.js), [`workerNativeMethodCapabilities.js`](../../backend/src/services/agents/workerNativeMethodCapabilities.js) et le contrat de [`workerKindService.js`](../../backend/src/services/agents/workerKindService.js) avec `replenish_external_quota` réservé au `recovery_worker`.
- Implémenter l'exécutant dans `backend/src/services/agents/` : vérifier lease, scope, plafond, compte, mission, tenant, run et version ; appeler le fournisseur ; rapporter reçu signé et lecture indépendante. Le rapport natif conserve le lien `DETERMINISTIC_WORKER_STARTED → EVIDENCE_REPORT → AGENT_COMPLETED`.
- Ajouter des tests positifs et négatifs : absence de lease, montant excessif, mauvais compte, réponse fournisseur ambiguë, reçu rejoué. Garder le comportement `restore_checkpoint` existant intact.

### Lot 3 — Décision du superviseur et durabilité

- Ajouter un coordinateur sous `backend/src/services/regulation/` qui observe le solde, calcule la pression, choisit un montant borné, demande un bail et fait dispatcher le `recovery_worker`. La création de ce helper doit être idempotente et plafonnée en profondeur pour éviter une récursion de récupération.
- Étendre [`regulatorySupervisorService.js`](../../backend/src/services/regulation/regulatorySupervisorService.js) : deux voies de preuve typées. Pour `external_refill`, vérifier identité du helper, contrat persisté, run terminé, reçu signé, version et solde relu ; refuser une simple restauration de snapshot. [`regulatoryPersistenceService.js`](../../backend/src/services/regulation/regulatoryPersistenceService.js) garde l'opération, son état `pending/applied/verified`, la mesure et la révision, avec contrainte d'unicité.
- Adapter [`regulatoryBridgeService.js`](../../backend/src/services/regulation/regulatoryBridgeService.js) et [`deterministicWorkerRuntime.js`](../../backend/src/services/agents/deterministicWorkerRuntime.js) pour exiger une mesure fraîche avant et après la méthode ; ne promouvoir l'état qu'après vérification. En cas de crash après le transfert, interroger `operationId` et réconcilier au lieu de transférer encore.
- Tester l'absence de crédit malgré un état interne « sain », la falsification de mesure, un helper d'une autre mission, le redémarrage, la concurrence et les deux cycles. Le `recovery_worker` ciblé dans la matrice reçoit un helper distinct et un compte distinct.

### Lot 4 — Planification complète de mission

- Étendre [`autonomousOrchestrationService/workerBuilder.js`](../../backend/src/services/autonomousOrchestrationService/workerBuilder.js) et [`agentAutonomyPlanService.js`](../../backend/src/services/agentAutonomyPlanService.js) : le plan doit contenir `workerKind`, `methodContract`, capacités exigées, justification, budget, dépendances et politique de récupération **avant** le dispatch. Le builder actuel produit surtout des rôles génériques ; ce lot doit fournir la sélection native vérifiable.
- Extraire des objectifs de mission des besoins typés ; sélectionner dans le catalogue des capacités et méthodes natives, avec refus explicite si l'objectif est ambigu ou non réalisable. Les 19 fixtures d'acceptation donnent un objectif et ses critères de succès, sans `worker_assignments` imposés. Les affectations explicites restent un second test de transport.
- Raccorder [`missionExecution.js`](../../backend/src/services/agentRuntimeAdapter/missionExecution.js), [`missionWorkers.js`](../../backend/src/services/agentRuntimeAdapter/missionWorkers.js) et [`agentFleetWorkers.js`](../../backend/src/services/agentFleetWorkers.js) au plan scellé. Réserver le budget du helper de récupération, créer ses contrats et références par la voie normale, puis réconcilier demandé/sélectionné/créé/démarré. Le `sub_orchestrator` délègue à un vrai enfant sous ses plafonds.
- Vérifier le trajet [MCP](../../mcp/toolCallHandler.js) → [CLI](../../backend/bin/genos-orchestrate.cjs) → plan → worker → preuve → clôture. Attendre le statut terminal après un lancement en arrière-plan. Le plan ne doit jamais être déclaré exécuté si la méthode, le type ou le budget du run diffère.

### Lot 5 — Sonde, auditeur et qualification

- Créer une sonde sous `backend/tests/probes/` qui lance un fournisseur séparé et le vrai `genos_orchestrate` pour 19 missions × 2 cycles. Perturber le solde **chez le fournisseur**, puis mesurer la décision, le transfert, l'état fonctionnel et la fin de mission. Ne pas insérer manuellement les parents, contrats, helpers ou runs du parcours positif.
- Créer un auditeur indépendant lisant entrée MCP, plan scellé, SQLite GenOS, journal fournisseur, signatures, télémétrie native et sortie terminale. Il vérifie automatiquement les 38 chaînes de provenance et l'invariant de conservation ; toute pièce absente donne un code non nul.
- Ajouter les contrôles négatifs du [protocole de qualification](qualification-regulation-ressources-orchestrate.md) : aucune recharge, état interne manipulé, reçu forgé, mauvais scope, budget insuffisant, plan/exécution divergents, concurrence et crash à chaque frontière durable.
- Exécuter `python scripts/ci/check_code_quality.py`, `npm test` et `cargo test --workspace`. Conserver les artefacts et commandes reproductibles dans `D:\GenOS-regulation-tests\` hors Git, puis publier un verdict limité aux cas effectivement observés.

## Premier incrément livrable

Commencer par les lots **0 puis 1**. Leur sortie doit être une preuve autonome qu'un fournisseur distinct transfère des crédits avec conservation, mesure indépendante, signature et idempotence. Ce socle rend ensuite testable la méthode native du lot 2 ; la planification complète n'est déclarée prête qu'après le lot 5.

## Avancement observé au 11 octobre 2026 — CLI réel

La sonde `backend/tests/probes/test_native_orchestrate_cli.cjs` confirme la planification native autonome, la création normale du worker, l'autorité scellée, l'exécution de `scan_literal` et la vérification par deux processus indépendants. Le premier audit, `native-orchestrate-cli-QYCIaz/audit.json`, a révélé la perte du verdict du worker dans le dossier de synthèse; le correctif préserve maintenant `outcome` et évite de convertir `success` en `unknown`. Le nouvel audit, `D:\GenOS-regulation-tests\regulation-probe-results\native-orchestrate-cli-HxNf4O\audit.json`, se termine avec `parentStatus=completed`, mais `parentRunStatus=blocked` et `missionStatus=failed`, car le garde de promotion n'accepte pas encore la preuve indépendante liée au run enfant.

Les changements ajoutent aussi le passage de `missionId` au runtime des workers, la liaison du workspace demandé au parent et au contrat, la normalisation JSON de l'enveloppe d'autorité, l'acceptation d'un bail réduit, la persistance du workspace sandbox d'un snapshot et la détection d'un run terminal quand l'agent est `idle`. Vérification exécutée le 11 octobre 2026 : `python scripts/ci/check_code_quality.py` (0 violation nouvelle), `npm test` (code 0) et `cargo test --workspace` (code 0), plus les tests ciblés et le rejeu CLI ci-dessus. Ces gates valident le dépôt; elles ne changent pas le verdict négatif de la mission CLI.

### Prochaines étapes bloquantes

1. **Couverture effective du plan CLI.** L'audit de couverture doit utiliser le plan scellé sélectionné et les outils requis par ce plan. Le rejeu post-commit `native-orchestrate-cli-393OSF` a une homéostasie satisfaite et un garde de clôture autorisé, mais l'audit du contrat parent général réclame sept outils; trois ont des reçus et cinq restent manquants. Ne pas marquer la mission complète tant que ces reçus ou un plan correctement limité ne sont pas présents.
2. **Oracles natifs des 19 types.** Ajouter les oracles et vérificateurs indépendants des 16 types qui ne disposent pas encore d'une preuve de run intégrée. Répéter l'acceptation du superviseur et du `recovery_worker` ciblé avec ces workers.
3. **Fournisseur externe dans le même parcours natif.** Appeler le fournisseur séparé depuis les missions choisies par `genos_orchestrate`. Sur la voie positive, ne pas créer manuellement le parent, le contrat de worker, le helper ou le run; perturber le solde du fournisseur et relire son reçu et son solde.
4. **Campagne bout en bout.** Lancer 19 types × 2 cycles depuis le CLI réel et auditer les 38 chaînes de preuve. Ajouter les contrôles négatifs: aucune recharge, mesure falsifiée, scope étranger, reçu forgé ou rejoué, budget insuffisant, concurrence et crash.
5. **Gates et preuve publiable.** Rejouer l'auditeur indépendant, `python scripts/ci/check_code_quality.py`, `npm test` et `cargo test --workspace`; conserver commandes et résultats sur D:.

Le probe capture désormais les événements `HALLUCINATION_DETECTED` et leurs sources dans `telemetry.jsonl`. Un rejeu antérieur (`native-orchestrate-cli-5sW3PX`) a montré que les événements répétés provenaient du même rapport worker : le dossier ajoutait à la fois `EVIDENCE_REPORT` et `AGENT_COMPLETED`, puis supprimait son verdict. Les références d'oracle enfant sont maintenant transmises et vérifiées au parent; le dernier essai atteint l'homéostasie et autorise le garde de clôture.

L'audit post-commit `D:\GenOS-regulation-tests\regulation-probe-results\native-orchestrate-cli-393OSF\audit.json` confirme un parent et un run terminés, deux vérificateurs indépendants, une preuve native acceptée, et `missionHomeostasisSatisfied=true`. Le CLI retourne cependant `required-coverage-incomplete`: `genos_diagnose`, `genos_hypothesis_evidence`, `genos_evaluate_trajectories`, `genos_replay` et `genos_record_decision` n'ont pas de reçu durable. L'audit de couverture réel est maintenant inclus dans le JSON final et bloque correctement la clôture. Ce résultat reste incomplet.
