# Qualification restante : ressources externes et planification complète

- **Type** : protocole de qualification et liste de travaux
- **Statut** : à réaliser ; aucune des deux preuves finales n'est acquise
- **Portée** : régulation supervisée des 19 types de workers natifs
- **Dernière revue** : 2026-10-10

Le [plan de mise en oeuvre](plan-implementation-regulation-ressources-orchestrate.md) ordonne les changements et leurs critères de sortie.

## État constaté

Le [protocole actuel](regulation-workers-protocole.md) démontre 38 récupérations sur 38 exécutions natives, à raison de deux cycles par type. Le superviseur vérifie le contrat, le run et le reçu d'un `recovery_worker`, le fichier restauré et le checkpoint SQLite avant de restaurer l'état réglementaire simulé. La sonde crée directement parent, mission et contrats. Elle ne passe pas par la planification complète de `genos_orchestrate`.

| Composant existant | Ce qu'il ne démontre pas |
| --- | --- |
| [Superviseur réglementaire](../../backend/src/services/regulation/regulatorySupervisorService.js) | Restaure un snapshot fonctionnel ; ne mesure ou ne crédite aucune ressource extérieure. |
| [Recovery worker](../../backend/src/services/agents/workerRecoveryExecutor.js) | `restore_checkpoint` restaure un fichier sous lease ; son SHA-256 n'est pas un reçu de recharge. |
| [État de survie](../../backend/src/services/survivalStateService.js) | `recordActionReceipt` accepte `postActionTelemetry` ; cette télémétrie ne mesure pas indépendamment un fournisseur. |
| [Registre de ressources](../../backend/src/services/missionResourceRegistryService.js) | Stocke budget, disponibilité et événements avec `evidenceRef` ; l'enregistrement seul ne prouve pas la provenance du solde ni un transfert. |
| [Bootstrap et plan](../../backend/src/services/agentRuntimeAdapter/missionExecution.js) | La chaîne existe mais n'est pas empruntée par la sonde réglementaire. |
| [Outil MCP](../../shared/toolDefinitions.json) | `worker_assignments` peut imposer les types ; l'appel en arrière-plan renvoie un lancement, pas une fin vérifiée. |

Types à couvrir selon [`workerKindService.KINDS`](../../backend/src/services/agents/workerKindService.js) : `scout_cell`, `resident_daemon`, `bounded_worker`, `adaptive_worker`, `specialist`, `procedural_executor`, `symbiotic_worker`, `verifier_worker`, `red_worker`, `experimental_worker`, `formal_worker`, `synthesis_worker`, `creative_worker`, `medical_worker`, `recovery_worker`, `forensic_worker`, `liaison_worker`, `teaching_worker`, `sub_orchestrator`.

## A. Démontrer la reconstitution de ressources externes

### Travaux nécessaires

1. **Ressource et source de vérité.** Choisir une ressource tenue hors de l'état réglementaire : par exemple un quota de service avec compteur et réserve dans un processus fournisseur distinct. Définir unité, propriétaire, tenant, mission, plafond, seuil, durée et coût. `energy` et un checkpoint sont des représentations internes, pas des ressources externes.
2. **Mesure indépendante.** Lire le solde et la réserve directement auprès du fournisseur avant et après l'acte. Conserver valeur, unité, version, horodatage et provenance. Un `updateState`, un `postActionTelemetry` ou une ligne du registre ne peut pas fabriquer une hausse mesurée.
3. **Acte autorisé.** Le superviseur choisit un transfert ou une recharge bornée, avec bail lié à l'agent, à la mission, au run, à la ressource et au montant. Sans autorité ou réserve suffisante, il refuse.
4. **Exécutant natif.** Raccorder un worker à l'acte sous contrat, par exemple un `recovery_worker` avec méthode dédiée. Garder cette méthode distincte de `restore_checkpoint`.
5. **Reçu vérifiable.** Persister l'identifiant d'opération, la clé d'idempotence, fournisseur, mission, agent, run, ressource, montant, version et soldes avant/après. Vérifier le reçu auprès du fournisseur, puis relire indépendamment les soldes.
6. **Conservation et reprise.** Crédit agent = débit réserve ; plafonds, contrôle de version, concurrence et unicité des opérations. Après crash entre effet fournisseur et écriture SQLite, réconcilier par identifiant sans double crédit.
7. **Lien réglementaire.** Définir et tester la conversion de la mesure externe vers les variables réellement concernées. Le superviseur exige à la fois une mesure fraîche et les seuils fonctionnels actuels : énergie ≥ 0,4, intégrité ≥ 0,5, survie < 0,7, stress ≤ 0,7. Ne relever aucune autre variable par convention implicite.
8. **Refus sûrs.** Tester capteur périmé ou forgé, fournisseur indisponible, lease expiré, montant excessif, reçu d'un autre tenant/agent/mission, rejeu, doublon et divergence entre reçu et mesure.

### Essais d'acceptation

| Essai | Résultat et preuve requis |
| --- | --- |
| 19 types × 2 cycles | Chaque cycle démarre avec un solde externe réellement sous seuil ; la réserve est débitée, le solde est crédité, le worker reprend et finit dans la plage. Corréler les 38 plans, runs, reçus, mesures et snapshots. |
| Lecture indépendante et redémarrage | Le fournisseur confirme les soldes après redémarrage du backend et du processus fournisseur ; les reçus et décisions restent traçables. |
| Sans recharge réelle | 19/19 types sont refusés si seuls `energy`, le checkpoint, `postActionTelemetry` ou le registre changent. Aucun solde fournisseur ne change. |
| Falsification et concurrence | Reçu altéré, autre agent, ancienne mesure, double demande et dépassement de bail ne créent aucun crédit indu. |
| Échecs partiels | Un crash après effet fournisseur produit une seule recharge après réconciliation ; un refus fournisseur laisse le worker bloqué. |
| Conservation | Un audit automatique vérifie soldes non négatifs, plafonds, absence de fuite inter-tenant et égalité crédit/débit. |

Un fournisseur contrôlé dans un processus séparé suffit pour une première preuve reproductible, si le compteur est réellement modifié puis mesuré par un canal indépendant. Cette preuve doit être nommée « fournisseur contrôlé externe au runtime ». Un service tiers réel demanderait une campagne distincte avec son API et ses relevés.

## B. Démontrer la planification complète par `genos_orchestrate`

### Travaux nécessaires

1. Appeler le véritable outil MCP `genos_orchestrate` ou son pont [CLI](../../backend/bin/genos-orchestrate.cjs) avec mission et budgets valides, en environnement isolé sur D:. Le test positif n'insère pas lui-même parent, mission, contrat, worker ou run.
2. Capturer la création par le chemin normal de l'identité de mission, de l'orchestrateur, du workspace, du budget, des contrats d'autorité et des runs. Vérifier identifiants, révisions et liens parent/enfant.
3. Capturer le plan de [`planMission`](../../backend/src/services/agentRuntimeAdapter/missionPlanning.js) avant dispatch : objectif, décomposition, rôle, type, méthode native, dépendances, budget, autorité et raison du choix.
4. Exécuter deux niveaux distincts : (a) `worker_assignments` explicites pour vérifier le transport des 19 types ; (b) sélection de chaque type **depuis l'objectif de mission, sans affectation imposée**, pour prouver la planification autonome. Si un type ne peut pas être sélectionné, implémenter sa règle de planification et sa preuve. Une mission par type suffit.
5. Vérifier que chaque worker créé correspond au plan et au contrat persisté, exécute la méthode native réelle et publie ses preuves. Le `sub_orchestrator` doit déléguer à un véritable enfant dans ses plafonds. Réconcilier nombre demandé, sélectionné, créé et démarré.
6. Injecter la perturbation ; laisser le superviseur décider, créer et dispatcher le `recovery_worker`, puis transmettre une référence persistée. Le test positif ne lance pas directement `runDeterministicWorker` et ne préfabrique pas la référence de récupération.
7. Vérifier la barrière de preuves et la clôture : preuve par worker, reçu de récupération, admission, coûts consommés, continuité et statut terminal. Avec `background:true`, attendre et relire le résultat final ; l'accusé de lancement ne suffit pas.
8. Faire passer dans **ce même parcours** la recharge externe du volet A. Deux réussites séparées ne démontrent pas leur intégration.

### Matrice d'acceptation

| Scénario | Résultat requis |
| --- | --- |
| 19 missions autonomes × 2 cycles | 38 plans, 38 workers natifs et 38 récupérations vérifiées ; provenance plan → contrat → run → reçu → mesure → état → résultat. |
| 19 affectations explicites | 19/19 méthodes natives atteintes sans contrat créé à la main ; ce test valide le câblage, pas la sélection autonome. |
| Budget ou autorité insuffisants | Plan bloqué ou exécution refusée avant dépense ; aucun succès terminal inféré du lancement. |
| Preuve absente ou reçus altérés | Barrière bloquée ; mission non promue. |
| Crash, redémarrage et demandes concurrentes | Une recharge au plus ; reprise cohérente, mêmes identifiants et décision reproductible. |
| Plan différent de l'exécution | Type, méthode, budget ou worker manquant détecté ; échec terminal explicite. |

## C. Dossier de preuve et verdict

Créer une sonde de bout en bout et un auditeur indépendant sous `backend/tests/probes/`. Sauver les artefacts générés **hors Git**, sur D: : entrée MCP/CLI expurgée, version du code, configuration, matrice des types, plans, contrats, décisions, télémétrie, reçus, mesures fournisseur, ledger, statuts terminaux, refus attendus, durées et codes de sortie. Exposer une commande de reproduction et une commande d'audit à code non nul si un maillon manque.

Le verdict « réussite complète » exige tous les points suivants :

- 19 types, deux cycles et contrôles négatifs, sans mock du planificateur, dispatcher, exécutant natif ou fournisseur dans le parcours de bout en bout ;
- crédit externe mesuré directement, conservé, autorisé, attribuable et durable ; variables internes dérivées de cette mesure ;
- plan généré par `genos_orchestrate` cohérent avec worker, contrat, récupération et clôture effectivement observés ;
- refus, concurrence, crash et redémarrage vérifiés ; aucun succès tiré d'un simple reçu de lancement ;
- `python scripts/ci/check_code_quality.py`, `npm test` et `cargo test --workspace` réussis après les changements de code.

À ce jour, le verdict demeure : **régulation simulée vérifiée ; reconstitution extérieure et planification complète non démontrées**.

## Mise à jour du 11 octobre 2026 — premier dispatch par le vrai CLI

La sonde `backend/tests/probes/test_native_orchestrate_cli.cjs` lance le véritable `backend/bin/genos-orchestrate.cjs` sous D:, sans créer manuellement la mission, le parent, le contrat du worker ni son run. Le plan autonome choisit `scout_cell / scan_literal`; le worker réel termine son run avec une autorité scellée et une attestation d'oracle acceptée par deux vérificateurs distincts. Le rejeu après correctifs reproduit le résultat, avec audit brut sous `D:\GenOS-regulation-tests\regulation-probe-results\native-orchestrate-cli-QYCIaz\audit.json`.

Cette tentative n'est pas une réussite de mission : le run du worker est `completed`, mais le parent passe en `apoptosis`, son run est `failed` et la mission est `failed` (code CLI 2). Le parent a accumulé trois observations d'hallucination, mais la table `telemetry_events` de cet essai ne contient pas les événements `HALLUCINATION_DETECTED` correspondants. Il faut tracer ces observations au point où le compteur est incrémenté et fournir une clôture du parent qui traite le résultat du worker avec une preuve admise. Le test de fin de parcours doit exiger le statut terminal `completed`; le seul succès du worker ne valide pas `genos_orchestrate`.

Les correctifs pour transmettre `missionId` au worker, conserver le workspace dans le contrat et reconnaître un agent `idle` dont le dernier run est terminal règlent trois blocages de transport/attente. La création et la persistance du workspace sandbox des snapshots ont aussi été corrigées et couvertes par un test ciblé. Ces corrections ne ferment pas les lots A ou B : la recharge externe supervisée n'est toujours pas liée à ce parcours CLI, et seul `scan_literal` a passé l'oracle natif dans cet essai.

## Mise à jour du 11 octobre 2026 — clôture enfant/parent

Le probe conserve maintenant un flux `telemetry.jsonl` synchronisé au processus, car l'arrêt sur apoptose empêchait parfois la lecture des derniers événements depuis SQLite. L'audit `native-orchestrate-cli-5sW3PX` a révélé que le même rapport scout était compté à la fois depuis `EVIDENCE_REPORT` et `AGENT_COMPLETED`; l'adaptateur de dossier supprimait également son verdict. Le correctif préserve `outcome` et les tests de synthèse couvrent les verdicts `success` et `failed`.

Après ce correctif et l'augmentation du budget d'orchestration au niveau mesuré, le parent accepte maintenant la référence d'oracle enfant persistée; le run parent et le run enfant terminent `completed`, deux vérificateurs indépendants retournent `verified`, et l'homéostasie est satisfaite. Le rejeu post-commit `native-orchestrate-cli-393OSF` montre encore une mission `failed`, car l'audit final réclame cinq outils manquants parmi les sept requis par le contrat parent général. La sonde conserve le résultat incomplet et le détail dans `D:\GenOS-regulation-tests\regulation-probe-results\native-orchestrate-cli-393OSF\audit.json`.
## État de qualification au 11 octobre 2026

Le fournisseur externe et la reprise supervisée ciblée sont prouvés par `backend/tests/probes/test_external_credit_provider.cjs` et `test_external_credit_supervision.cjs`. La sélection de méthode et type natifs passe pour 19 types avec `test_native_mission_plan.cjs`. La matrice externe ciblée 19 × 2 passe avec audit indépendant (38/38), sous contrats créés par la sonde.

## Mise à jour du 11 octobre 2026 — preuves d’oracle natif

Trois méthodes ont maintenant une sonde d’oracle en processus séparés et un run complet de worker créé par la flotte GenOS : `scan_literal` (`scout_cell`), `monitor_samples` (`resident_daemon`) et `subset_sum` (`procedural_executor`). Chaque run scelle le worker, le contrat, le budget et l’identité de mission ; deux processus distincts recalculent les postconditions et leur attestation est requise pour terminer le run. Les probes sont `test_native_scout_completion.cjs`, `test_native_monitor_completion.cjs` et `test_native_procedure_completion.cjs`, complétées par les probes de falsification `test_native_scout_oracle.cjs` et `test_native_monitor_oracle.cjs`.

Le reçu du scout et celui du monitor emploient une sérialisation canonique des objets : l’ordre des clés du contrat ne change plus le reçu vérifiable. Le rapport monitor conserve seuil et nombre d’échantillons afin que l’oracle puisse recalculer ces valeurs à partir du contrat. L’oracle `subset_sum` accepte aussi les enveloppes natives `scoped_procedure`, `host_procedure` et `niche_procedure`; seule la variante `scoped_procedure` disposait déjà d’une preuve de run intégrée.

| Portée | État vérifié |
| --- | --- |
| `scan_literal`, `monitor_samples`, `subset_sum` | Run GenOS réel terminé, attestation acceptée, deux processus séparés. |
| `scoped_procedure` | Couverture antérieure par l’oracle subset-sum ; revalider avec les gates finaux. |
| Autres méthodes des 19 kinds | Pas encore de preuve sémantique indépendante intégrée. |
| 19 kinds × 2 cycles avec crédit externe et recovery helper planifié | Pas encore exécuté par le parcours complet `genos_orchestrate`. |

Une tentative de `genos_orchestrate` MCP connecté a échoué avant dispatch : son backend pointe sur `C:\Users\Shadow\Documents\GitHub\GenOS`, et le contrôle d’identité a rejeté la différence avec le workspace demandé sur D:. Aucun état du dépôt C: n’a été changé. Cette tentative ne compte pas comme exécution qualifiante. Le CLI sous D: et le parcours MCP avec workspace D: restent à valider.
