# Audit approfondi Trinity : jury, exploratory, recursive et adaptive

Audit readonly du 2026-10-06T11:59:55.953Z. Aucune relance, aucune execution de code candidat, aucune correction D. Connexion SQLite OPEN_READONLY ; seules les deux sorties demandées dans C sont écrites. Le premier accès sandbox n’a pas ouvert la base ; le nouvel accès autorisé conserve explicitement OPEN_READONLY.

16 missions, 43 tentatives, 129 mondes. Snapshot publication 2026-10-06T10:49:26.909Z : 29PASS historiques de contrôles originaux, dont un faux positif de mission. Trois nouvelles réponses adaptive difficile après capture sont relues statiquement, sans replay indépendant historique. Aucun worker completed avec receipt vérifié ; aucune promotion. [E0](#e0)

audit.json conserve les lectures intégrales answer/solution, les contrats, commandes/messages observables, timelines, bindings, receipts et données DB. SHA-256 : 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f. Structure : /cases/{i}/attempts/{j}/worlds/{k}. Chaque citation E donne fichier, JSONpointer/ligne et SHA-256 dans le catalogue en fin de rapport. Les DB rows sont copiées avec identités et tables, source D:\GenOS-Trinity-qualification-20261006-01a1109a\jury-exploratory\missions.db, SHA-256 1e005a343907c0b3cdbac4eccfcbcf8922b0f86d16abbaf3ffe65c34ae600052, lecture 2026-10-06T11:59:55.951Z. Une absence de trace reste non observée, pas impossible.

## Constats et contradictions

### F1

29 mondes PASS historiques sur129, mais exploratory-moyen a3 monde1 viole les interdictions de la mission. Un PASS technique ne valide pas toute mission. Confiance : élevée. [E0](#e0), [E2280](#e2280), [E2232](#e2232), [E2233](#e2233)

### F2

Ancien rapport sélectionne un seul meilleur essai et masque le second PASS exploratory moyen : deux PASS historiques a3/m1 et a6-codex/m1. Un seul est conforme qualitativement. Confiance : élevée. [E2280](#e2280), [E2414](#e2414), [E2893](#e2893)

### F3

43 expériences actuellement escalated ; trois sealed_running historiques ont évolué. Aucun journal comparaison/jury/QD/récursion/adaptation et aucune promotion. Les résultats indépendants externes n’ont pas traversé les gates runtime. Confiance : élevée. [E0](#e0), [E2885](#e2885)
Source DB : D:\GenOS-Trinity-qualification-20261006-01a1109a\jury-exploratory\missions.db ; SHA-256 1e005a343907c0b3cdbac4eccfcbcf8922b0f86d16abbaf3ffe65c34ae600052 ; sélection `SELECT status,count(*) FROM trinity_experiments GROUP BY status; SELECT count(*) FROM trinity_runtime_journal;`. Copie audit.json#/findings/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

### F4

8k worker reste le plafond effectif. Comptabilité divergente : gardes rapportent dizaines à centaines de milliers de tokens alors que metrics_json enregistre0 et receipts signalent tokens/facturation indisponibles. Zéro ne vaut pas consommation nulle. Confiance : élevée. [E2886](#e2886), [E117](#e117), [E528](#e528), [E2083](#e2083)
Source DB : D:\GenOS-Trinity-qualification-20261006-01a1109a\jury-exploratory\missions.db ; SHA-256 1e005a343907c0b3cdbac4eccfcbcf8922b0f86d16abbaf3ffe65c34ae600052 ; sélection `SELECT budget_json,metrics_json,guardrail_reason FROM strategy_execution_runs`. Copie audit.json#/findings/3, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

### F5

MISSION_AMBIGUOUS établi dans les logs ; une seule liaison mission du worker et deux du parent établies. Mauvais missionId transmis au filtre est une hypothèse cohérente, pas une preuve de valeur d’appel : rows.length0 et2 partagent le même code. Confiance : élevée pour logs/liaisons, moyenne pour cause. [E2887](#e2887), [E1638](#e1638), [E1646](#e1646), [E1654](#e1654)
Source DB : D:\GenOS-Trinity-qualification-20261006-01a1109a\jury-exploratory\missions.db ; SHA-256 1e005a343907c0b3cdbac4eccfcbcf8922b0f86d16abbaf3ffe65c34ae600052 ; sélection `SELECT * FROM mission_agents WHERE agent_id LIKE %adaptive-moyen-a1%`. Copie audit.json#/findings/4, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

### F6

NSE produit des décisions/action receipts FORAGE, PLASTICITE et CLONAL_AFFINITY_SEARCH corrélés à des workers. Ces changements de search-genome ne prouvent pas exécution des topologies déclarées ou mutation du code. Confiance : élevée. [E2892](#e2892), [E93](#e93), [E174](#e174), [E2155](#e2155)

### F7

Consommation global workspace observée, mais sa trace appartient au chemin local fallback. Aucun cycle AGOW complet avec arbitrage/broadcast/effet causal attesté. SHEV, AEIS, GVX sans tables renseignées dans ce laboratoire. Confiance : élevée pour traces/counts, moyenne pour non-activation générale. [E2891](#e2891)
Source DB : D:\GenOS-Trinity-qualification-20261006-01a1109a\jury-exploratory\missions.db ; SHA-256 1e005a343907c0b3cdbac4eccfcbcf8922b0f86d16abbaf3ffe65c34ae600052 ; sélection `Tables componentTableCounts et telemetry GLOBAL_WORKSPACE_CONSUMPTION`. Copie audit.json#/findings/6, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

### F8

22 sessions visibilité Omega et22 événements, fragments0. LOCAL_WORKER_STARTED/AGENT_FAILED tool_missing prouvent tentative native ; aucun graphe cognitif ni résultat de modèle local vérifié. Confiance : élevée. [E2203](#e2203)
Source DB : D:\GenOS-Trinity-qualification-20261006-01a1109a\jury-exploratory\missions.db ; SHA-256 1e005a343907c0b3cdbac4eccfcbcf8922b0f86d16abbaf3ffe65c34ae600052 ; sélection `SELECT count(*) FROM cognitive_visibility_sessions; SELECT count(*) FROM cognitive_visibility_fragments`. Copie audit.json#/findings/7, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

### F9

Trinity signaux NCE culture/phenotype configurés true et play false. Play/POET/culture/phénotype n’ont pas d’activation corrélée établie : nce_play_observations, agent_phenotype_states, culture_transmissions sont vides. Absence de journal POET n’établit pas impossibilité. Confiance : élevée configuration, moyenne absence d’activation. [E2890](#e2890)
Source DB : D:\GenOS-Trinity-qualification-20261006-01a1109a\jury-exploratory\missions.db ; SHA-256 1e005a343907c0b3cdbac4eccfcbcf8922b0f86d16abbaf3ffe65c34ae600052 ; sélection `Tables Play/culture/phenotype dans componentTableCounts`. Copie audit.json#/findings/8, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

### F10

Ordre actuel adaptive/QD avant cross-examination et receipts exigés sur evidence[] ; risque de précondition inaccessible si reçus n’existent pas avant comparaison. Non exercé ici puisque tous les cas échouent avant cette phase. Confiance : moyenne pour risque, élevée ordre de code. [E2888](#e2888), [E2889](#e2889)

### F11

Jury difficile emploie trois creative_worker (direct_author, planned_author, self_correcting_literary_author) pour une architecture de messagerie. Le rôle/kind est établi ; inadéquation scientifique est une appréciation fondée sur la mission, pas une preuve de capacité interne. Confiance : élevée faits, moyenne adéquation. [E644](#e644), [E711](#e711)

### F12

43 messages organisationnels persistés : retours parent sur échec, canal orchestrator_handoff, modality plasmid. Aucun débat entre mondes ni discussion jury. delivered sans recipients ne prouve pas réception par des agents. Confiance : élevée. [E0](#e0)
Source DB : D:\GenOS-Trinity-qualification-20261006-01a1109a\jury-exploratory\missions.db ; SHA-256 1e005a343907c0b3cdbac4eccfcbcf8922b0f86d16abbaf3ffe65c34ae600052 ; sélection `SELECT sender_agent_id,recipient_agent_id,channel,payload_json,delivery FROM agent_organization_messages`. Copie audit.json#/findings/11, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

## Portée des preuves et discussions

Les tests algorithmiques utilisent des oracles distincts sur des domaines finis. Les graphes utilisent des attentes et scénarios fournis par le candidat lui-même : leur cohérence n’est pas une validation extérieure d’utilité. explanation>100, nombre de designs/méthodes/hypothèses et evidenceRefs non vides ne prouvent ni qualité ni provenance. Les contrats donnent parfois le résultat attendu (Monty Hall,24 zéros), réduisant l’interprétation en découverte indépendante. Les restrictions originales ne sont pas toutes couvertes par les bancs. [E2](#e2), [E338](#e338), [E645](#e645), [E874](#e874), [E973](#e973), [E1090](#e1090), [E1253](#e1253), [E1417](#e1417), [E1482](#e1482), [E1626](#e1626), [E1684](#e1684), [E1775](#e1775), [E1826](#e1826), [E2233](#e2233), [E2450](#e2450), [E2578](#e2578)

Les trois chambres sont direct, structured/planned et falsification/self_correcting. Les kinds décrivent des capacités, pas des rôles scientifiques. La plupart des methodContracts sont prompt_defined sans capacité spécifique exigée. Les noms n_way_counterfactual_fork, factorial_experiment ou causal_replay_intervention ne prouvent pas leur protocole complet. Les méthodes locales sont évaluées sur le code et les commandes observables seulement ; aucune pensée interne n’est reconstruite.

Les parent_agent_id existent et lineage_relation est généralement independent. Trois capsules distinctes et snapshot commun établissent la séparation matérielle prévue ; aucune sous-Trinity en découle. L’interview annoncée au monde structuré n’a pas de conversation utilisateur persistée correspondante. Aucun échange interchambres observé ; les43 messages organisationnels sont des handoffs parent d’échec. delivered sans destinataire reçu reste un transport interne. workerContract.authority.write=false peut coexister avec allow_file_edits=true sur une capsule : les couches d’autorité doivent être instrumentées plutôt qu’inférées comme contournement. Données audit.json#/cases et /currentOrganizationMessages, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

## Composants : configuration et activation

| Composant | État attesté dans ce laboratoire | Limite |
|---|---|---|
| SHEV | Tables présentes, toutes vides | Activation non observée |
| AGOW | GLOBAL_WORKSPACE_CONSUMPTION réel | Fallback local ; cycle AGOW complet non prouvé |
| G-CIR | Recettes/plans/contrats présents ; méthodes locales observables | Effet causal G-CIR non prouvé par label de stratégie |
| Omega |22 sessions visibilité et22 événements, LOCAL_WORKER_STARTED puis tool_missing | Fragments0, aucun graphe ou résultat modèle local vérifié |
| AEIS | Tables assurance/provider reviews vides | Exigence contractuelle distincte d’assemblée exécutée |
| NCE | Source Trinity culture/phenotype=true, play=false | Configuration, pas preuve d’activation |
| NSE | FORAGE, PLASTICITE, CLONAL_AFFINITY_SEARCH avec action receipts | Search-genome seulement, pas mutation du candidat prouvée |
| GVX | Leases/operations/events vides | Aucun verifier GVX exécuté prouvé |
| QD | Config1 réplique, fractions des graphes réelles | Journal0, archive/replique runtime non atteintes |
| Signalplanes |43 messages plasmid sérialisés/persistés | Aucun débat ; signal_blobs/deliveries0, recipients vides |
| Valider Play : Play/phénotype/culture/POET | nce_play_observations0, phenotype0, transmission culture0 | Activation non observée ; POET inconnu ici |

Effectifs : audit.json#/componentTableCounts et /currentOrganizationMessages, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f. Sources et corrélations : [E2892](#e2892), [E93](#e93), [E174](#e174), [E2155](#e2155), [E2891](#e2891), [E2203](#e2203), [E2890](#e2890), [E0](#e0). Ne pas attribuer les résultats d’autres laboratoires à ces missions.

## Gates et budget

83 bindings et83 runs,79 receipts biologiques :28 failed,51 blocked ; aucun verified=true. Le report est souvent null car l’arrêt précède l’ingestion du dossier final. answer.json et JSON final du worker peuvent être différents : l’audit conserve les deux. Un answer minimal n’est pas automatiquement un dossier final invalide ; sa validité dépend des champs du protocol et du receipt effectivement scellé. [E1010](#e1010), [E1012](#e1012)

Le superviseur refuse la comparaison avant tous les workers completed. Les replays externes ne sont pas des receipts injectés dans les gates. L’ordre adaptive/QD avant cross-examination et leur exigence receipts est un risque de précondition lu dans le code actuel, pas une panne exercée ici. [E0](#e0), [E2885](#e2885), [E2888](#e2888), [E2889](#e2889)

metrics_json contient0 alors que gardes rapportent des usages élevés ; budgetAssessment manque tokens/facturation. Ce0 vaut donnée manquante, pas absence de consommation. accountEvent conserve max(total_tokens) ou input+output ; les estimations prennent UTF8/4. Cache/contexte/tokensbillables doivent être distingués. Aucun coût de fournisseur attesté. Parent600k ne relève pas le plafond worker8000. [E2886](#e2886), [E117](#e117), [E528](#e528), [E2083](#e2083)

## Missions, tentatives et chacun des129 mondes

### jury-simple

Mission originale : « Trois explications différentes du paradoxe de Monty Hall sont proposées. Détermine lesquelles sont correctes, puis soumets anonymement les dossiers admissibles au jury. » [E1](#e1)

Les deux preuves de Monty Hall sont raisonnables sous le protocole uniforme. Le contrat donne déjà les labels admissibles et les probabilités attendues. Le banc énumère 12 observations pondérées, sans évaluer la justification ni soumettre les dossiers au jury. Confiance élevée sur le périmètre et les livrables ; propriétés non testées restent inconnues. [E2](#e2)

#### qual-20261006-jury-simple

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:26.013Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E3](#e3), [E4](#e4), [E5](#e5)

Budget demandé={"tokens":30000,"events":120,"latencyMs":240000,"costUsd":2} ; config variant={"enabled":true,"modelUris":["ollama://qwen2.5-coder:7b","ollama://llama3.1:8b"],"maxCostUsd":0.25}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-jury-simple_1_b9cd2e2eca4f** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-jury-simple, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E7](#e7), [E2894](#e2894)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E7](#e7), [E8](#e8)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: SQLITE_ERROR: no such column: organization_id ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E14](#e14), [E7](#e7), [E8](#e8)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/0/attempts/0/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-jury-simple_2_853b56af3d84** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-jury-simple, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E15](#e15), [E2895](#e2895)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E15](#e15), [E16](#e16)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: SQLITE_ERROR: no such column: organization_id ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E22](#e22), [E15](#e15), [E16](#e16)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/0/attempts/0/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-jury-simple_3_7a21776d5251** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-jury-simple, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E23](#e23), [E2896](#e2896)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E23](#e23), [E24](#e24)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: SQLITE_ERROR: no such column: organization_id ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E30](#e30), [E23](#e23), [E24](#e24)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/0/attempts/0/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-jury-simple-a2

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:26.907Z: escalated; DB actuelle=escalated, motif=Trinity mission timed out: qual-20261006-jury-simple-a2. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E31](#e31), [E32](#e32), [E33](#e33)

Budget demandé={"tokens":30000,"events":120,"latencyMs":240000,"costUsd":2} ; config variant={"enabled":true,"modelUris":["ollama://qwen2.5-coder:7b","ollama://llama3.1:8b"],"maxCostUsd":0.25}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-jury-simple-a2_1_c47158e6e1d9** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-jury-simple-a2, relation=independent, maxTokens=8000. Capturé=idle/PIDnull; actuel=idle/PIDnull. [E34](#e34), [E2897](#e2897)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E34](#e34), [E35](#e35)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:05:34 AGENT_FAILED Runtime exited unsuccessfully: For more information, try '--help'. ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E34](#e34), [E35](#e35)
  Receipts=75d8516e-8430-5486-8e49-01e5e3245c32 failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/0/attempts/1/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-jury-simple-a2_2_b7ffa94b178e** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-jury-simple-a2, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E54](#e54), [E2898](#e2898)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E54](#e54), [E55](#e55)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:05:34 AGENT_FAILED Runtime exited unsuccessfully. ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E54](#e54), [E55](#e55)
  Receipts=70f1472d-4d5a-5d63-87cc-654c01effe71 failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/0/attempts/1/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-jury-simple-a2_3_5a48a7dd55bc** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-jury-simple-a2, relation=independent, maxTokens=8000. Capturé=idle/PIDnull; actuel=idle/PIDnull. [E64](#e64), [E2899](#e2899)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E64](#e64), [E65](#e65)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:05:35 AGENT_FAILED Runtime exited unsuccessfully: For more information, try '--help'. ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E64](#e64), [E65](#e65)
  Receipts=dbd46c5c-c37b-55f1-868a-583839d5c46f failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/0/attempts/1/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-jury-simple-a3

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:27.482Z: escalated; DB actuelle=escalated, motif=Trinity mission timed out: qual-20261006-jury-simple-a3. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E77](#e77), [E78](#e78), [E79](#e79)

Budget demandé={"tokens":30000,"events":120,"latencyMs":240000,"costUsd":2} ; config variant={"enabled":true,"modelUris":["ollama://qwen2.5-coder:7b","ollama://llama3.1:8b"],"maxCostUsd":0.25}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-jury-simple-a3_1_44d4561849de** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-jury-simple-a3, relation=independent, maxTokens=8000. Capturé=blocked/PIDnull; actuel=blocked/PIDnull. [E80](#e80), [E2900](#e2900)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E80](#e80), [E81](#e81), [E97](#e97)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent. [E97](#e97)
  Première défaillance observée=trace terminale absente de la capture ; guardrail persisté=tokens budget exhausted during execution (34845 > 8000).. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E80](#e80), [E81](#e81)
  Receipts=56eac03b-36dd-594b-8ce1-17515020afce blocked verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/0/attempts/2/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-jury-simple-a3_2_55c8902c936c** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-jury-simple-a3, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E99](#e99), [E2901](#e2901)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E99](#e99), [E100](#e100), [E116](#e116)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent. [E116](#e116)
  Première défaillance observée=2026-10-06 10:08:47 BUDGET_EXHAUSTED tokens budget exhausted during execution (33636 > 8000). ; guardrail persisté=tokens budget exhausted during execution (33636 > 8000).. Cascade=BUDGET_EXHAUSTED→STRATEGY_GUARDRAIL_BLOCKED→AGENT_RUNTIME_HALT_REQUESTED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E127](#e127), [E99](#e99), [E100](#e100)
  Receipts=476314c0-8928-50a2-80f2-e5929e3bb1b9 blocked verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/0/attempts/2/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-jury-simple-a3_3_99b6d1f23130** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-jury-simple-a3, relation=independent, maxTokens=8000. Capturé=blocked/PIDnull; actuel=blocked/PIDnull. [E128](#e128), [E2902](#e2902)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E128](#e128), [E129](#e129), [E145](#e145)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent. [E145](#e145)
  Première défaillance observée=trace terminale absente de la capture ; guardrail persisté=tokens budget exhausted during execution (50349 > 8000).. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E128](#e128), [E129](#e129)
  Receipts=ba1e585a-7b79-561e-8c0e-309e64a30b4e blocked verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/0/attempts/2/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-jury-simple-a4

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:28.167Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E147](#e147), [E148](#e148), [E149](#e149)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"enabled":true,"modelUris":["ollama://qwen2.5-coder:7b","ollama://llama3.1:8b"],"maxCostUsd":0.25}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-jury-simple-a4_1_0cdc11c117a8** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-jury-simple-a4, relation=independent, maxTokens=8000. Capturé=blocked/PIDnull; actuel=blocked/PIDnull. [E150](#e150), [E2903](#e2903)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E150](#e150), [E151](#e151), [E196](#e196), [E198](#e198), [E194](#e194)
  Relecture : Énumération et complément corrects ; dossiers anonymes A/B réellement préparés, soumission explicitement non attestée. decide valide les portes et le protocole. hardConstraintsPassed est borné au local. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées. Réserves : evidenceVector contient booléen/objet ; le banc n’en vérifie pas le schéma de gate.
  Dernier report JSON parsable=true; champs=outcome, claims, scopeCompletion, executionLimits. [E194](#e194)
  Première défaillance observée=trace terminale absente de la capture ; guardrail persisté=tokens budget exhausted during execution (137750 > 8000).. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E150](#e150), [E151](#e151)
  Receipts=aaeb1ca0-fabb-549d-8f9f-aaec34ab9e9c blocked verified=false ; bindings=1, runs=1, commandes capturées=6. Copie exacte audit.json#/cases/0/attempts/3/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-jury-simple-a4_2_260dcb42fb3c** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-jury-simple-a4, relation=independent, maxTokens=8000. Capturé=blocked/PIDnull; actuel=blocked/PIDnull. [E200](#e200), [E2904](#e2904)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E200](#e200), [E201](#e201), [E238](#e238), [E240](#e240), [E236](#e236)
  Relecture : Calcul pondéré correct et hypothèses explicites ; answer.json reste minimal, aucun dossier complet de vote. decide identique dans sa logique au monde1. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées.
  Dernier report JSON parsable=true; champs=outcome, claims, artifacts, acceptanceChecks, evidence, specialtyAssessment, evidenceVector, evidenceVectorEvidence, hardConstraintsPassed, budgetStatus, uncertainties, executionLimits. [E236](#e236)
  Première défaillance observée=trace terminale absente de la capture ; guardrail persisté=tokens budget exhausted during execution (95506 > 8000).. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E200](#e200), [E201](#e201)
  Receipts=5a98574e-15e7-57c3-8bb6-e11e500f9f92 blocked verified=false ; bindings=1, runs=1, commandes capturées=4. Copie exacte audit.json#/cases/0/attempts/3/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-jury-simple-a4_3_d17dc39499c0** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-jury-simple-a4, relation=independent, maxTokens=8000. Capturé=blocked/PIDnull; actuel=blocked/PIDnull. [E242](#e242), [E2905](#e2905)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E242](#e242), [E243](#e243), [E289](#e289), [E291](#e291), [E279](#e279)
  Relecture : Conditionnement correct avec hypothèses explicites ; stratégie n_way_counterfactual_fork déclarée mais aucune autre chambre n’est consultée. Code valide portes et animateur. Budget annoncé sans mesure. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées. Réserves : evidenceVector contient booléen/objet ; le banc n’en vérifie pas le schéma de gate.
  Dernier report JSON parsable=false; champs=narration/absent. [E279](#e279)
  Première défaillance observée=trace terminale absente de la capture ; guardrail persisté=tokens budget exhausted during execution (114988 > 8000).. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E242](#e242), [E243](#e243)
  Receipts=bb8cb963-632f-5f5d-8ea4-1c639b2a01a4 blocked verified=false ; bindings=1, runs=1, commandes capturées=7. Copie exacte audit.json#/cases/0/attempts/3/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-jury-simple-a5-local

Executor=local, dispatch exit=0. Capture 2026-10-06T10:48:28.838Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E293](#e293), [E294](#e294), [E295](#e295)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"enabled":true,"modelUris":["ollama://qwen2.5-coder:7b","ollama://llama3.1:8b"],"maxCostUsd":0.25}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-jury-simple-a5-local_1_6a1c05491dcc** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-jury-simple-a5-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E296](#e296), [E2906](#e2906)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E296](#e296), [E297](#e297)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-jury-simple-a5-local_1_6a1c05491dcc' has no workspace delegation from orchestrator 'qual-20261006-jury-simple-a5-local'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E300](#e300), [E296](#e296), [E297](#e297)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/0/attempts/4/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-jury-simple-a5-local_2_279d796d3869** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-jury-simple-a5-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E301](#e301), [E2907](#e2907)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E301](#e301), [E302](#e302)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-jury-simple-a5-local_2_279d796d3869' has no workspace delegation from orchestrator 'qual-20261006-jury-simple-a5-local'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E305](#e305), [E301](#e301), [E302](#e302)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/0/attempts/4/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-jury-simple-a5-local_3_38711ddf1e65** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-jury-simple-a5-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E306](#e306), [E2908](#e2908)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E306](#e306), [E307](#e307)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-jury-simple-a5-local_3_38711ddf1e65' has no workspace delegation from orchestrator 'qual-20261006-jury-simple-a5-local'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E310](#e310), [E306](#e306), [E307](#e307)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/0/attempts/4/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-jury-simple-a6-local

Executor=local, dispatch exit=0. Capture 2026-10-06T10:48:29.312Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E311](#e311), [E312](#e312), [E313](#e313)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"enabled":true,"modelUris":["ollama://qwen2.5-coder:7b","ollama://llama3.1:8b"],"maxCostUsd":0.25}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-jury-simple-a6-local_1_edf4a4520d7d** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-jury-simple-a6-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E314](#e314), [E2909](#e2909)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E314](#e314), [E315](#e315)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:25:03 AGENT_FAILED Omega native graph blocked: tool_missing ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E314](#e314), [E315](#e315)
  Receipts=616dde3f-882d-5a09-813e-b3924ce833d3 failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/0/attempts/5/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-jury-simple-a6-local_2_e7c708c99458** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-jury-simple-a6-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E322](#e322), [E2910](#e2910)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E322](#e322), [E323](#e323)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:25:03 AGENT_FAILED Omega native graph blocked: tool_missing ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E322](#e322), [E323](#e323)
  Receipts=0aecd052-1fe1-5f8f-8944-24fe768fa44e failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/0/attempts/5/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-jury-simple-a6-local_3_ac7c8c247378** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-jury-simple-a6-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E330](#e330), [E2911](#e2911)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E330](#e330), [E331](#e331)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:25:03 AGENT_FAILED Omega native graph blocked: tool_missing ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E330](#e330), [E331](#e331)
  Receipts=076b6b36-9c37-5570-8c8e-34f139d4c58e failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/0/attempts/5/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

### jury-moyen

Mission originale : « Trouve trois explications indépendantes de la raison pour laquelle une recherche binaire fonctionne, vérifie les dossiers puis utilise un jury aveugle pour évaluer leur clarté sans connaître leur provenance. » [E337](#e337)

Trois structures argumentatives valides : invariant, monotonie et induction. Elles partagent la propriété d’ordre ; indépendance de provenance non établie. 5 576 requêtes ne couvrent qu’une famille de tableaux ; le test doublon vérifie seulement index>=0 et non valeur retournée. Aucun score de clarté. Confiance élevée sur le périmètre et les livrables ; propriétés non testées restent inconnues. [E338](#e338)

#### qual-20261006-jury-moyen-a3

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:18.965Z: escalated; DB actuelle=escalated, motif=Trinity mission timed out: qual-20261006-jury-moyen-a3. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E339](#e339), [E340](#e340), [E341](#e341)

Budget demandé={"tokens":30000,"events":120,"latencyMs":240000,"costUsd":2} ; config variant={"enabled":true,"modelUris":["ollama://qwen2.5-coder:7b","ollama://llama3.1:8b"],"maxCostUsd":0.25}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-jury-moyen-a3_1_ca82cc80c7a0** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-jury-moyen-a3, relation=independent, maxTokens=8000. Capturé=idle/PIDnull; actuel=idle/PIDnull. [E342](#e342), [E2912](#e2912)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E342](#e342), [E343](#e343), [E359](#e359)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent. [E359](#e359)
  Première défaillance observée=trace terminale absente de la capture ; guardrail persisté=tokens budget exhausted during execution (33348 > 8000).. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E342](#e342), [E343](#e343)
  Receipts=7b882346-bf77-5b80-8721-050359f91788 blocked verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/1/attempts/0/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-jury-moyen-a3_2_85a7d1edc8a6** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-jury-moyen-a3, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E361](#e361), [E2913](#e2913)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E361](#e361), [E362](#e362), [E378](#e378)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent. [E378](#e378)
  Première défaillance observée=2026-10-06 10:12:48 BUDGET_EXHAUSTED tokens budget exhausted during execution (49994 > 8000). ; guardrail persisté=tokens budget exhausted during execution (49994 > 8000).. Cascade=BUDGET_EXHAUSTED→STRATEGY_GUARDRAIL_BLOCKED→AGENT_RUNTIME_HALT_REQUESTED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E387](#e387), [E361](#e361), [E362](#e362)
  Receipts=bd0f75c0-2109-5bc7-8880-eefa0bde5cfc blocked verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/1/attempts/0/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-jury-moyen-a3_3_10c604d1a517** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-jury-moyen-a3, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E388](#e388), [E2914](#e2914)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E388](#e388), [E389](#e389), [E405](#e405)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent. [E405](#e405)
  Première défaillance observée=2026-10-06 10:12:51 BUDGET_EXHAUSTED tokens budget exhausted during execution (49974 > 8000). ; guardrail persisté=tokens budget exhausted during execution (49974 > 8000).. Cascade=BUDGET_EXHAUSTED→STRATEGY_GUARDRAIL_BLOCKED→AGENT_RUNTIME_HALT_REQUESTED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E416](#e416), [E388](#e388), [E389](#e389)
  Receipts=cfb0249a-72af-589e-8b84-26e9363a8603 blocked verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/1/attempts/0/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-jury-moyen-a4

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:19.900Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E417](#e417), [E418](#e418), [E419](#e419)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"enabled":true,"modelUris":["ollama://qwen2.5-coder:7b","ollama://llama3.1:8b"],"maxCostUsd":0.25}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-jury-moyen-a4_1_e21be3433bae** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-jury-moyen-a4, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E420](#e420), [E2915](#e2915)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E420](#e420), [E421](#e421), [E470](#e470), [E472](#e472), [E456](#e456)
  Relecture : Preuves détaillées correctes, limites du test reconnues. search est une boucle standard correcte ; le dossier distingue explicitement review locale et jury indisponible. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées. Réserves : budgetStatus ignore ou contredit les plafonds request et worker ; non mesuré ne signifie pas illimité. evidenceVector contient booléen/objet ; le banc n’en vérifie pas le schéma de gate.
  Dernier report JSON parsable=false; champs=narration/absent. [E456](#e456)
  Première défaillance observée=2026-10-06 10:19:08 AGENT_RUNTIME_HALT_REQUESTED Runtime halted: Swarm Sentinel detected infinite cognitive repetition / deadlock. ; guardrail persisté=Runtime halted by deadlock_collapse: Cyclic deadlock detected: periodic loop of length 3 detected.. Cascade=AGENT_RUNTIME_HALT_REQUESTED→AGENT_HALTED. Ordre observable, cause racine inconnue si traces insuffisantes. [E469](#e469), [E420](#e420), [E421](#e421)
  Receipts=534374bf-77db-5963-8eb0-cbba2281c2ad blocked verified=false ; bindings=1, runs=1, commandes capturées=6. Copie exacte audit.json#/cases/1/attempts/1/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-jury-moyen-a4_2_aa526c6e049b** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-jury-moyen-a4, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E474](#e474), [E2916](#e2916)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E474](#e474), [E475](#e475), [E537](#e537), [E539](#e539), [E525](#e525)
  Relecture : Preuves correctes avec doublons et indices absolus ; indépendance de provenance correctement laissée inconnue. search boucle standard. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées. Réserves : evidenceVector contient booléen/objet ; le banc n’en vérifie pas le schéma de gate.
  Dernier report JSON parsable=true; champs=outcome, artifact, claims, specialtyAssessment, hardConstraintsPassed, uncertainties, report. [E525](#e525)
  Première défaillance observée=2026-10-06 10:19:12 BUDGET_EXHAUSTED tokens budget exhausted during execution (118343 > 8000). ; guardrail persisté=tokens budget exhausted during execution (118343 > 8000).. Cascade=BUDGET_EXHAUSTED→STRATEGY_GUARDRAIL_BLOCKED→AGENT_RUNTIME_HALT_REQUESTED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E536](#e536), [E474](#e474), [E475](#e475)
  Receipts=6791b3fd-9c83-53da-879c-4b83e1646007 blocked verified=false ; bindings=1, runs=1, commandes capturées=7. Copie exacte audit.json#/cases/1/attempts/1/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-jury-moyen-a4_3_8c74559d0a04** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-jury-moyen-a4, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E541](#e541), [E2917](#e2917)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E541](#e541), [E542](#e542), [E600](#e600), [E602](#e602), [E588](#e588)
  Relecture : Preuves correctes, affirmation de 3 234 contrôles supplémentaires à corréler aux commandes ; search boucle standard. budgetStatus non borné contredit le budget worker8k réel. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées. Réserves : budgetStatus ignore ou contredit les plafonds request et worker ; non mesuré ne signifie pas illimité. evidenceVector contient booléen/objet ; le banc n’en vérifie pas le schéma de gate.
  Dernier report JSON parsable=false; champs=narration/absent. [E588](#e588)
  Première défaillance observée=2026-10-06 10:19:37 BUDGET_EXHAUSTED tokens budget exhausted during execution (144664 > 8000). ; guardrail persisté=tokens budget exhausted during execution (144664 > 8000).. Cascade=BUDGET_EXHAUSTED→STRATEGY_GUARDRAIL_BLOCKED→AGENT_RUNTIME_HALT_REQUESTED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E599](#e599), [E541](#e541), [E542](#e542)
  Receipts=55fdeb79-0eca-5af1-8ea1-ae44419eab46 blocked verified=false ; bindings=1, runs=1, commandes capturées=6. Copie exacte audit.json#/cases/1/attempts/1/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-jury-moyen-a5-local

Executor=local, dispatch exit=0. Capture 2026-10-06T10:48:21.498Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E604](#e604), [E605](#e605), [E606](#e606)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"enabled":true,"modelUris":["ollama://qwen2.5-coder:7b","ollama://llama3.1:8b"],"maxCostUsd":0.25}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-jury-moyen-a5-local_1_f2d66a142cff** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-jury-moyen-a5-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E607](#e607), [E2918](#e2918)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E607](#e607), [E608](#e608)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-jury-moyen-a5-local_1_f2d66a142cff' has no workspace delegation from orchestrator 'qual-20261006-jury-moyen-a5-local'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E611](#e611), [E607](#e607), [E608](#e608)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/1/attempts/2/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-jury-moyen-a5-local_2_8fe0f2e9c391** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-jury-moyen-a5-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E612](#e612), [E2919](#e2919)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E612](#e612), [E613](#e613)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-jury-moyen-a5-local_2_8fe0f2e9c391' has no workspace delegation from orchestrator 'qual-20261006-jury-moyen-a5-local'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E616](#e616), [E612](#e612), [E613](#e613)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/1/attempts/2/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-jury-moyen-a5-local_3_4932fc3d7ea3** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-jury-moyen-a5-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E617](#e617), [E2920](#e2920)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E617](#e617), [E618](#e618)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-jury-moyen-a5-local_3_4932fc3d7ea3' has no workspace delegation from orchestrator 'qual-20261006-jury-moyen-a5-local'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E621](#e621), [E617](#e617), [E618](#e618)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/1/attempts/2/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-jury-moyen-a6-local

Executor=local, dispatch exit=0. Capture 2026-10-06T10:48:24.072Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E622](#e622), [E623](#e623), [E624](#e624)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"enabled":true,"modelUris":["ollama://qwen2.5-coder:7b","ollama://llama3.1:8b"],"maxCostUsd":0.25}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-jury-moyen-a6-local_1_d5566b1d32cf** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-jury-moyen-a6-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E625](#e625), [E2921](#e2921)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. replay absent. [E625](#e625)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: SQLITE_FULL: database or disk is full ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E627](#e627), [E625](#e625)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/1/attempts/3/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-jury-moyen-a6-local_2_a8688b69dc0c** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-jury-moyen-a6-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E628](#e628), [E2922](#e2922)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E628](#e628), [E629](#e629)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:25:22 AGENT_FAILED Omega native graph blocked: tool_missing ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E628](#e628), [E629](#e629)
  Receipts=0c1edbf9-1593-5795-8996-790d88909762 failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/1/attempts/3/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-jury-moyen-a6-local_3_00b38a3f8cf3** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-jury-moyen-a6-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E636](#e636), [E2923](#e2923)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E636](#e636), [E637](#e637)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:25:22 AGENT_FAILED Omega native graph blocked: tool_missing ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E636](#e636), [E637](#e637)
  Receipts=a9f66fe0-0a74-5663-8684-a7bda3f30122 failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/1/attempts/3/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

### jury-difficile

Mission originale : « Trois architectures concurrentes sont proposées pour une messagerie temps réel. Les contraintes sont identiques. Produis leurs dossiers indépendamment, applique les gates factuels, puis demande au jury aveugle de comparer uniquement les candidats qui ont survécu. » [E644](#e644)

La mission demande trois architectures indépendantes et gate factuelle avant jury. Chaque monde décrit trois architectures, mais fournit un unique simulateur mémoire partagé. Le banc vérifie tri/déduplication/reprise sur un scénario, pas durable-before-ack, durabilité sur disque, trois implémentations, crashs ou performances. Confiance élevée sur le périmètre et les livrables ; propriétés non testées restent inconnues. [E645](#e645)

#### qual-20261006-jury-difficile-a5-local

Executor=local, dispatch exit=0. Capture 2026-10-06T10:48:17.164Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E646](#e646), [E647](#e647), [E648](#e648)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"enabled":true,"modelUris":["ollama://qwen2.5-coder:7b","ollama://llama3.1:8b"],"maxCostUsd":0.25}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-jury-difficile-a5-local_1_6f4e130504b7** — chambre=direct, rôle=direct_author, kind=creative_worker, type=GenOS. Parent=qual-20261006-jury-difficile-a5-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E649](#e649), [E2924](#e2924)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E649](#e649), [E650](#e650)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-jury-difficile-a5-local_1_6f4e130504b7' has no workspace delegation from orchestrator 'qual-20261006-jury-difficile-a5-local'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E653](#e653), [E649](#e649), [E650](#e650)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/2/attempts/0/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-jury-difficile-a5-local_2_49bcd4b5c7cb** — chambre=structured, rôle=planned_author, kind=creative_worker, type=GenOS. Parent=qual-20261006-jury-difficile-a5-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E654](#e654), [E2925](#e2925)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E654](#e654), [E655](#e655)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-jury-difficile-a5-local_2_49bcd4b5c7cb' has no workspace delegation from orchestrator 'qual-20261006-jury-difficile-a5-local'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E658](#e658), [E654](#e654), [E655](#e655)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/2/attempts/0/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-jury-difficile-a5-local_3_59428d72e2f3** — chambre=falsification, rôle=self_correcting_literary_author, kind=creative_worker, type=GenOS. Parent=qual-20261006-jury-difficile-a5-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E659](#e659), [E2926](#e2926)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E659](#e659), [E660](#e660)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-jury-difficile-a5-local_3_59428d72e2f3' has no workspace delegation from orchestrator 'qual-20261006-jury-difficile-a5-local'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E663](#e663), [E659](#e659), [E660](#e660)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/2/attempts/0/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-jury-difficile-a6-codex

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:17.578Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E664](#e664), [E665](#e665), [E666](#e666)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"enabled":true,"modelUris":["ollama://qwen2.5-coder:7b","ollama://llama3.1:8b"],"maxCostUsd":0.25}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-jury-difficile-a6-codex_1_be45677f2b92** — chambre=direct, rôle=direct_author, kind=creative_worker, type=GenOS. Parent=qual-20261006-jury-difficile-a6-codex, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E667](#e667), [E2927](#e2927)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E667](#e667), [E668](#e668)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-jury-difficile-a6-codex_1_be45677f2b92' has no workspace delegation from orchestrator 'qual-20261006-jury-difficile-a6-codex'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E671](#e671), [E667](#e667), [E668](#e668)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/2/attempts/1/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-jury-difficile-a6-codex_2_482eba5c402a** — chambre=structured, rôle=planned_author, kind=creative_worker, type=GenOS. Parent=qual-20261006-jury-difficile-a6-codex, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E672](#e672), [E2928](#e2928)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E672](#e672), [E673](#e673)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-jury-difficile-a6-codex_2_482eba5c402a' has no workspace delegation from orchestrator 'qual-20261006-jury-difficile-a6-codex'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E676](#e676), [E672](#e672), [E673](#e673)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/2/attempts/1/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-jury-difficile-a6-codex_3_47cd65c610fb** — chambre=falsification, rôle=self_correcting_literary_author, kind=creative_worker, type=GenOS. Parent=qual-20261006-jury-difficile-a6-codex, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E677](#e677), [E2929](#e2929)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E677](#e677), [E678](#e678)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-jury-difficile-a6-codex_3_47cd65c610fb' has no workspace delegation from orchestrator 'qual-20261006-jury-difficile-a6-codex'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E681](#e681), [E677](#e677), [E678](#e678)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/2/attempts/1/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-jury-difficile-a6-local

Executor=local, dispatch exit=0. Capture 2026-10-06T10:48:18.033Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E682](#e682), [E683](#e683), [E684](#e684)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"enabled":true,"modelUris":["ollama://qwen2.5-coder:7b","ollama://llama3.1:8b"],"maxCostUsd":0.25}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-jury-difficile-a6-local_1_27808c52ae9b** — chambre=direct, rôle=direct_author, kind=creative_worker, type=GenOS. Parent=qual-20261006-jury-difficile-a6-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E685](#e685), [E2930](#e2930)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E685](#e685), [E686](#e686)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:25:43 AGENT_FAILED Omega native graph blocked: tool_missing ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E693](#e693), [E685](#e685), [E686](#e686)
  Receipts=bce79a70-bab7-5fc0-819c-fc8e7185e502 failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/2/attempts/2/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-jury-difficile-a6-local_2_8dbe66849c64** — chambre=structured, rôle=planned_author, kind=creative_worker, type=GenOS. Parent=qual-20261006-jury-difficile-a6-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E694](#e694), [E2931](#e2931)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E694](#e694), [E695](#e695)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:25:42 AGENT_FAILED Omega native graph blocked: tool_missing ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E694](#e694), [E695](#e695)
  Receipts=57e9172c-7b4e-5920-8f4a-635019041bf1 failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/2/attempts/2/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-jury-difficile-a6-local_3_d28cb944565a** — chambre=falsification, rôle=self_correcting_literary_author, kind=creative_worker, type=GenOS. Parent=qual-20261006-jury-difficile-a6-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E702](#e702), [E2932](#e2932)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E702](#e702), [E703](#e703)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:25:42 AGENT_FAILED Omega native graph blocked: tool_missing ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E702](#e702), [E703](#e703)
  Receipts=3bc31147-6020-56fd-8ebf-7f1ec4d8e708 failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/2/attempts/2/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-jury-difficile-a7-codex

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:18.444Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E710](#e710), [E711](#e711), [E712](#e712)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"enabled":true,"modelUris":["ollama://qwen2.5-coder:7b","ollama://llama3.1:8b"],"maxCostUsd":0.25}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-jury-difficile-a7-codex_1_fb50525dea16** — chambre=direct, rôle=direct_author, kind=creative_worker, type=GenOS. Parent=qual-20261006-jury-difficile-a7-codex, relation=independent, maxTokens=8000. Capturé=blocked/PIDnull; actuel=blocked/PIDnull. [E713](#e713), [E2933](#e2933)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E713](#e713), [E714](#e714), [E769](#e769), [E771](#e771), [E758](#e758)
  Relecture : SQL/outbox, journal répliqué et quorum distincts conceptuellement. Le code produit une liste ACK après insertion Map, sans disque. Conflits id/seq rejetés. Distinction simulation/production honnête. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées.
  Dernier report JSON parsable=true; champs=outcome, claims, workerArtifact, acceptanceChecks, evidence, evidenceVector, evidenceVectorEvidence, hardConstraintsPassed, budgetStatus, uncertainties, executionLimits, unmetPreconditions. [E758](#e758)
  Première défaillance observée=2026-10-06 10:38:50 BUDGET_EXHAUSTED tokens budget exhausted during execution (161794 > 8000). ; guardrail persisté=tokens budget exhausted during execution (161794 > 8000).. Cascade=BUDGET_EXHAUSTED→STRATEGY_GUARDRAIL_BLOCKED→AGENT_RUNTIME_HALT_REQUESTED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E713](#e713), [E714](#e714)
  Receipts=a62a9e6a-0ee9-50d9-8f17-52e2fb198d00 blocked verified=false ; bindings=1, runs=1, commandes capturées=6. Copie exacte audit.json#/cases/2/attempts/3/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-jury-difficile-a7-codex_2_638d0a78b383** — chambre=structured, rôle=planned_author, kind=creative_worker, type=GenOS. Parent=qual-20261006-jury-difficile-a7-codex, relation=independent, maxTokens=8000. Capturé=blocked/PIDnull; actuel=blocked/PIDnull. [E773](#e773), [E2934](#e2934)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E773](#e773), [E774](#e774), [E818](#e818), [E820](#e820), [E816](#e816)
  Relecture : SQL, consensus et acteur append-only distincts conceptuellement. Le code ne produit aucune trace ACK et ignore disconnect ; le dossier le reconnaît. PASS ne prouve pas durable-before-ack. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées. Réserves : evidenceVector contient booléen/objet ; le banc n’en vérifie pas le schéma de gate.
  Dernier report JSON parsable=true; champs=outcome, claims, workerArtifact, evidence. [E816](#e816)
  Première défaillance observée=trace terminale absente de la capture ; guardrail persisté=tokens budget exhausted during execution (121966 > 8000).. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E773](#e773), [E774](#e774)
  Receipts=a06ccc20-cd6d-5c10-8b78-afc025fd096e blocked verified=false ; bindings=1, runs=1, commandes capturées=5. Copie exacte audit.json#/cases/2/attempts/3/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-jury-difficile-a7-codex_3_78f40b13d2dd** — chambre=falsification, rôle=self_correcting_literary_author, kind=creative_worker, type=GenOS. Parent=qual-20261006-jury-difficile-a7-codex, relation=independent, maxTokens=8000. Capturé=blocked/PIDnull; actuel=blocked/PIDnull. [E822](#e822), [E2935](#e2935)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E822](#e822), [E823](#e823), [E869](#e869), [E871](#e871), [E858](#e858)
  Relecture : SQL, journal partitionné et acteur décrits ; le code tri final ne garantit pas livraison en ligne sans trou, ce qui est reconnu. Pas d’ACK observable, accepte seq=0 au-delà de l’instance. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées.
  Dernier report JSON parsable=true; champs=outcome, claims, workerArtifact, evidence. [E858](#e858)
  Première défaillance observée=2026-10-06 10:38:15 BUDGET_EXHAUSTED tokens budget exhausted during execution (99641 > 8000). ; guardrail persisté=tokens budget exhausted during execution (99641 > 8000).. Cascade=BUDGET_EXHAUSTED→AGENT_HALTED→STRATEGY_GUARDRAIL_BLOCKED→AGENT_RUNTIME_HALT_REQUESTED→RUNTIME_EVENT_PROCESSING_FAILED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E822](#e822), [E823](#e823)
  Receipts=47cc74ae-9f9e-525d-81d5-977fbd6b0baa blocked verified=false ; bindings=1, runs=1, commandes capturées=4. Copie exacte audit.json#/cases/2/attempts/3/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

### jury-tres-complexe

Mission originale : « Résous un problème ambigu comportant plusieurs solutions techniquement valides : concevoir un langage de configuration lisible par humain, déterministe, versionnable et sûr. Les mondes construisent trois designs indépendants. Les vérifications techniques éliminent les designs invalides. Le jury aveugle analyse uniquement les designs survivants et doit être autorisé à s'abstenir s'il n'existe pas de préférence suffisamment fondée. » [E873](#e873)

La grammaire imposée key=value remplace le design ouvert d’un langage et fixe la sécurité à huit chaînes. Le test compterait seulement trois designs et juryMayAbstain, sans vérifier lisibilité ni cohérence générale. Aucun livrable dans ces essais. Confiance élevée sur le périmètre et les livrables ; propriétés non testées restent inconnues. [E874](#e874)

#### qual-20261006-jury-tres-complexe-a5-local

Executor=local, dispatch exit=0. Capture 2026-10-06T10:48:29.829Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E875](#e875), [E876](#e876), [E877](#e877)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"enabled":true,"modelUris":["ollama://qwen2.5-coder:7b","ollama://llama3.1:8b"],"maxCostUsd":0.25}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-jury-tres-complexe-a5-local_1_d75d20063449** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-jury-tres-complexe-a5-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E878](#e878), [E2936](#e2936)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E878](#e878), [E879](#e879)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-jury-tres-complexe-a5-local_1_d75d20063449' has no workspace delegation from orchestrator 'qual-20261006-jury-tres-complexe-a5-local'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E882](#e882), [E878](#e878), [E879](#e879)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/3/attempts/0/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-jury-tres-complexe-a5-local_2_1eebfcb0e68e** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-jury-tres-complexe-a5-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E883](#e883), [E2937](#e2937)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E883](#e883), [E884](#e884)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-jury-tres-complexe-a5-local_2_1eebfcb0e68e' has no workspace delegation from orchestrator 'qual-20261006-jury-tres-complexe-a5-local'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E887](#e887), [E883](#e883), [E884](#e884)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/3/attempts/0/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-jury-tres-complexe-a5-local_3_f3ff8c5a7d34** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-jury-tres-complexe-a5-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E888](#e888), [E2938](#e2938)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E888](#e888), [E889](#e889)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-jury-tres-complexe-a5-local_3_f3ff8c5a7d34' has no workspace delegation from orchestrator 'qual-20261006-jury-tres-complexe-a5-local'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E892](#e892), [E888](#e888), [E889](#e889)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/3/attempts/0/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-jury-tres-complexe-a6-local

Executor=local, dispatch exit=0. Capture 2026-10-06T10:48:30.641Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E893](#e893), [E894](#e894), [E895](#e895)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"enabled":true,"modelUris":["ollama://qwen2.5-coder:7b","ollama://llama3.1:8b"],"maxCostUsd":0.25}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-jury-tres-complexe-a6-local_1_e6cd1939364f** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-jury-tres-complexe-a6-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E896](#e896), [E2939](#e2939)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E896](#e896), [E897](#e897)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:26:02 AGENT_FAILED Omega native graph blocked: tool_missing ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E896](#e896), [E897](#e897)
  Receipts=a45f4f02-eeba-5d7e-8906-f07135b4cc63 failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/3/attempts/1/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-jury-tres-complexe-a6-local_2_0b704ab46dbd** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-jury-tres-complexe-a6-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E904](#e904), [E2940](#e2940)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E904](#e904), [E905](#e905)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:26:02 AGENT_FAILED Omega native graph blocked: tool_missing ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E904](#e904), [E905](#e905)
  Receipts=5e5e8751-3e45-5980-8d44-5de520171e5e failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/3/attempts/1/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-jury-tres-complexe-a6-local_3_f08f41326182** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-jury-tres-complexe-a6-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E912](#e912), [E2941](#e2941)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E912](#e912), [E913](#e913)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:26:02 AGENT_FAILED Omega native graph blocked: tool_missing ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E912](#e912), [E913](#e913)
  Receipts=11cbf25d-5349-5cea-86bd-082455fcddf1 failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/3/attempts/1/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-jury-tres-complexe-a7-codex

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:31.325Z: escalated; DB actuelle=escalated, motif=Trinity mission timed out: qual-20261006-jury-tres-complexe-a7-codex. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E921](#e921), [E922](#e922), [E923](#e923)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"enabled":true,"modelUris":["ollama://qwen2.5-coder:7b","ollama://llama3.1:8b"],"maxCostUsd":0.25}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-jury-tres-complexe-a7-codex_1_e4f0062ce892** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-jury-tres-complexe-a7-codex, relation=independent, maxTokens=8000. Capturé=idle/PIDnull; actuel=idle/PIDnull. [E924](#e924), [E2942](#e2942)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E924](#e924), [E925](#e925)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=trace terminale absente de la capture ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E924](#e924), [E925](#e925)
  Receipts=aucun ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/3/attempts/2/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-jury-tres-complexe-a7-codex_2_19640d21ff4b** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-jury-tres-complexe-a7-codex, relation=independent, maxTokens=8000. Capturé=idle/PIDnull; actuel=idle/PIDnull. [E930](#e930), [E2943](#e2943)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E930](#e930), [E931](#e931)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=trace terminale absente de la capture ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E930](#e930), [E931](#e931)
  Receipts=aucun ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/3/attempts/2/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-jury-tres-complexe-a7-codex_3_1e04aadd1535** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-jury-tres-complexe-a7-codex, relation=independent, maxTokens=8000. Capturé=idle/PIDnull; actuel=idle/PIDnull. [E936](#e936), [E2944](#e2944)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E936](#e936), [E937](#e937)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=trace terminale absente de la capture ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E936](#e936), [E937](#e937)
  Receipts=aucun ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/3/attempts/2/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-jury-tres-complexe-a8-codex

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:32.450Z: escalated; DB actuelle=escalated, motif=Trinity mission timed out: qual-20261006-jury-tres-complexe-a8-codex. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E942](#e942), [E943](#e943), [E944](#e944)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"enabled":true,"modelUris":["ollama://qwen2.5-coder:7b","ollama://llama3.1:8b"],"maxCostUsd":0.25}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-jury-tres-complexe-a8-codex_1_cea4ff5eec79** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-jury-tres-complexe-a8-codex, relation=independent, maxTokens=8000. Capturé=idle/PIDnull; actuel=idle/PIDnull. [E945](#e945), [E2945](#e2945)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E945](#e945), [E946](#e946)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne11 log [GarageFabric] Reconciliation blocked: SQLITE_MISUSE: Database handle is closed ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E952](#e952), [E953](#e953), [E945](#e945), [E946](#e946)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/3/attempts/3/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-jury-tres-complexe-a8-codex_2_8c0ff1209cd6** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-jury-tres-complexe-a8-codex, relation=independent, maxTokens=8000. Capturé=idle/PIDnull; actuel=idle/PIDnull. [E954](#e954), [E2946](#e2946)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E954](#e954), [E955](#e955)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne21 log [GarageFabric] Reconciliation blocked: SQLITE_MISUSE: Database handle is closed ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E961](#e961), [E962](#e962), [E954](#e954), [E955](#e955)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/3/attempts/3/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-jury-tres-complexe-a8-codex_3_a5528812a801** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-jury-tres-complexe-a8-codex, relation=independent, maxTokens=8000. Capturé=idle/PIDnull; actuel=idle/PIDnull. [E964](#e964), [E2947](#e2947)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E964](#e964), [E965](#e965)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne11 log Error: BIOLOGICAL_WORKER_MISSION_AMBIGUOUS ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E971](#e971), [E964](#e964), [E965](#e965)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/3/attempts/3/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

### recursive-simple

Mission originale : « Détermine combien de zéros termine 100!. Si une étape intermédiaire devient le véritable sous-problème, résous-la séparément avant de reprendre le problème parent. » [E972](#e972)

Réponse 24 correcte sur n=0..200 par oracle BigInt, mais le contrat fournissait déjà answer.zeros100=24. Aucun sous-problème restant : ne pas déclencher de récursion inutile est conforme à la condition de la mission simple. Cela ne teste pas une sous-Trinity. Confiance élevée sur le périmètre et les livrables ; propriétés non testées restent inconnues. [E973](#e973)

#### qual-20261006-recursive-simple-a1

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:36.221Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E974](#e974), [E975](#e975), [E976](#e976)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant=180000. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-recursive-simple-a1_1_224130d38400** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-recursive-simple-a1, relation=independent, maxTokens=8000. Capturé=blocked/PIDnull; actuel=blocked/PIDnull. [E977](#e977), [E2948](#e2948)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E977](#e977), [E978](#e978), [E1012](#e1012), [E1014](#e1014), [E1010](#e1010)
  Relecture : Divisions successives par5, validation n entier sûr. Démonstration de valuation correcte ; answer minimal, report final JSON distinct dans la trace. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées.
  Dernier report JSON parsable=true; champs=outcome, claims, workerArtifact, specialtyAssessment, acceptanceChecks, evidence, uncertainties, executionLimits, evidenceVector, evidenceVectorEvidence, hardConstraintsPassed, budgetStatus, scopeCompletion. [E1010](#e1010)
  Première défaillance observée=trace terminale absente de la capture ; guardrail persisté=tokens budget exhausted during execution (74752 > 8000).. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E977](#e977), [E978](#e978)
  Receipts=d87f0434-220a-5346-8873-93fff82a50f4 blocked verified=false ; bindings=1, runs=1, commandes capturées=4. Copie exacte audit.json#/cases/4/attempts/0/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-recursive-simple-a1_2_bf1ae8148ee6** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-recursive-simple-a1, relation=independent, maxTokens=8000. Capturé=blocked/PIDnull; actuel=blocked/PIDnull. [E1016](#e1016), [E2949](#e2949)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E1016](#e1016), [E1017](#e1017), [E1047](#e1047), [E1049](#e1049), [E1045](#e1045)
  Relecture : Même calcul et hypothèses ; explique explicitement qu’aucun sous-problème ne nécessite une branche. Dernier message narratif, pas dossier JSON scellé. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées.
  Dernier report JSON parsable=false; champs=narration/absent. [E1045](#e1045)
  Première défaillance observée=trace terminale absente de la capture ; guardrail persisté=tokens budget exhausted during execution (113592 > 8000).. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E1016](#e1016), [E1017](#e1017)
  Receipts=6a2d6b4a-c5df-505f-8ff8-4b7176db50e9 blocked verified=false ; bindings=1, runs=1, commandes capturées=4. Copie exacte audit.json#/cases/4/attempts/0/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-recursive-simple-a1_3_2e0ee3bce739** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-recursive-simple-a1, relation=independent, maxTokens=8000. Capturé=blocked/PIDnull; actuel=blocked/PIDnull. [E1051](#e1051), [E2950](#e2950)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E1051](#e1051), [E1052](#e1052), [E1085](#e1085), [E1087](#e1087), [E1082](#e1082)
  Relecture : Même calcul correct ; accents remplacés par ? dans answer, lisibilité dégradée. Stratégie contre-factuelle explicitement locale. Budget illimité déclaré erroné. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées. Réserves : budgetStatus ignore ou contredit les plafonds request et worker ; non mesuré ne signifie pas illimité.
  Dernier report JSON parsable=false; champs=narration/absent. [E1082](#e1082)
  Première défaillance observée=trace terminale absente de la capture ; guardrail persisté=tokens budget exhausted during execution (93835 > 8000).. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E1051](#e1051), [E1052](#e1052)
  Receipts=e0b84721-0f66-56d3-8636-cc974b4cbd9e blocked verified=false ; bindings=1, runs=1, commandes capturées=4. Copie exacte audit.json#/cases/4/attempts/0/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

### recursive-moyen

Mission originale : « Trouve le nombre minimal de pièces pour former 63 avec des pièces de valeurs {1, 5, 11, 17}. Si le choix de la propriété de sous-structure optimale devient critique, traite explicitement ce sous-problème avant la résolution finale. » [E1089](#e1089)

Minimum5 correct, décomposition17+17+17+11+1. Preuve optimale par sous-structure et borne/parité convaincante. BFS indépendant n=0..150 ; les dénominations sont fixes. Sous-problème traité textuellement, aucune résolution Trinity indépendante attestée. Confiance élevée sur le périmètre et les livrables ; propriétés non testées restent inconnues. [E1090](#e1090)

#### qual-20261006-recursive-moyen-a1

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:35.067Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E1091](#e1091), [E1092](#e1092), [E1093](#e1093)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant=180000. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-recursive-moyen-a1_1_9e7cd32e595f** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-recursive-moyen-a1, relation=independent, maxTokens=8000. Capturé=blocked/PIDnull; actuel=blocked/PIDnull. [E1094](#e1094), [E2951](#e2951)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E1094](#e1094), [E1095](#e1095), [E1136](#e1136), [E1138](#e1138), [E1134](#e1134)
  Relecture : DP itérative, positive/reusable validées. Contre-exemple glouton15=3 pièces versus5 correct. Limites de grande taille explicites. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées.
  Dernier report JSON parsable=true; champs=outcome, claims, scopeCompletion, workerArtifact, specialtyAssessment, acceptanceChecks, evidence, evidenceVector, evidenceVectorEvidence, hardConstraintsPassed, budgetStatus, uncertainties, executionLimits. [E1134](#e1134)
  Première défaillance observée=trace terminale absente de la capture ; guardrail persisté=tokens budget exhausted during execution (96282 > 8000).. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E1094](#e1094), [E1095](#e1095)
  Receipts=08214dfa-781f-5bad-8d46-1bca530d89ff blocked verified=false ; bindings=1, runs=1, commandes capturées=5. Copie exacte audit.json#/cases/5/attempts/0/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-recursive-moyen-a1_2_6fc24c5b5f4c** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-recursive-moyen-a1, relation=independent, maxTokens=8000. Capturé=blocked/PIDnull; actuel=blocked/PIDnull. [E1140](#e1140), [E2952](#e2952)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E1140](#e1140), [E1141](#e1141), [E1191](#e1191), [E1193](#e1193), [E1189](#e1189)
  Relecture : DP même recurrence, preuve par induction correcte. Distinction BFS/oracle et non-récursion explicite. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées. Réserves : evidenceVector contient booléen/objet ; le banc n’en vérifie pas le schéma de gate.
  Dernier report JSON parsable=true; champs=outcome, claims, workerArtifact, specialtyAssessment, acceptanceChecks, hardConstraintsPassed, executionLimits. [E1189](#e1189)
  Première défaillance observée=trace terminale absente de la capture ; guardrail persisté=tokens budget exhausted during execution (138017 > 8000).. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E1140](#e1140), [E1141](#e1141)
  Receipts=2ec18f76-99d3-5971-8495-b9ef75b9a3b9 blocked verified=false ; bindings=1, runs=1, commandes capturées=7. Copie exacte audit.json#/cases/5/attempts/0/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-recursive-moyen-a1_3_392c781d9639** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-recursive-moyen-a1, relation=independent, maxTokens=8000. Capturé=blocked/PIDnull; actuel=blocked/PIDnull. [E1195](#e1195), [E2953](#e2953)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E1195](#e1195), [E1196](#e1196), [E1248](#e1248), [E1250](#e1250), [E1237](#e1237)
  Relecture : DP correcte et comparaison glouton pertinente. La stratégie n_way_counterfactual_fork reste une comparaison locale, pas un fork runtime. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées. Réserves : evidenceVector contient booléen/objet ; le banc n’en vérifie pas le schéma de gate.
  Dernier report JSON parsable=false; champs=narration/absent. [E1237](#e1237)
  Première défaillance observée=2026-10-06 10:33:11 BUDGET_EXHAUSTED tokens budget exhausted during execution (118921 > 8000). ; guardrail persisté=tokens budget exhausted during execution (118921 > 8000).. Cascade=BUDGET_EXHAUSTED→STRATEGY_GUARDRAIL_BLOCKED→AGENT_RUNTIME_HALT_REQUESTED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E1195](#e1195), [E1196](#e1196)
  Receipts=7506a5c4-57df-5c6a-8386-51e379ce9eef blocked verified=false ; bindings=1, runs=1, commandes capturées=5. Copie exacte audit.json#/cases/5/attempts/0/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

### recursive-difficile

Mission originale : « Construis un algorithme permettant de trouver le meilleur ordre d'exécution de tâches avec dépendances et coûts. Identifie le sous-problème qui crée le plus d'incertitude et lance dessus une résolution Trinity indépendante avant de poursuivre. » [E1252](#e1252)

Objectif choisi : somme pondérée des temps de fin sur une machine et six jobs fixes. Oracle énumère cinq ordres, optimum94 A,C,E,B,D,F. Le sous-problème critique est identifié, mais la résolution Trinity indépendante exigée avant reprise n’est pas lancée. Confiance élevée sur le périmètre et les livrables ; propriétés non testées restent inconnues. [E1253](#e1253)

#### qual-20261006-recursive-difficile-a1

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:33.964Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E1254](#e1254), [E1255](#e1255), [E1256](#e1256)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant=180000. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-recursive-difficile-a1_1_99e4784db063** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-recursive-difficile-a1, relation=independent, maxTokens=8000. Capturé=blocked/PIDnull; actuel=blocked/PIDnull. [E1257](#e1257), [E2954](#e2954)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E1257](#e1257), [E1258](#e1258), [E1302](#e1302), [E1304](#e1304), [E1300](#e1300)
  Relecture : DP à masques32bits limitée22jobs, preuve temps(S) et dominance correcte. hardConstraintsPassed=false malgré outcome=success : succès artefact, mission partielle. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées.
  Dernier report JSON parsable=false; champs=narration/absent. [E1300](#e1300)
  Première défaillance observée=trace terminale absente de la capture ; guardrail persisté=tokens budget exhausted during execution (121413 > 8000).. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E1257](#e1257), [E1258](#e1258)
  Receipts=75d204e7-9fad-59fc-8661-abbb620c3c89 blocked verified=false ; bindings=1, runs=1, commandes capturées=5. Copie exacte audit.json#/cases/6/attempts/0/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-recursive-difficile-a1_2_eae9a49deadd** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-recursive-difficile-a1, relation=independent, maxTokens=8000. Capturé=blocked/PIDnull; actuel=blocked/PIDnull. [E1306](#e1306), [E2955](#e2955)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E1306](#e1306), [E1307](#e1307), [E1355](#e1355), [E1357](#e1357), [E1353](#e1353)
  Relecture : DP masquesBigInt et pointeurs ; preuve correcte. Coût exponentiel sans borne explicite. Sous-Trinity non lancée et reconnue. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées.
  Dernier report JSON parsable=true; champs=outcome, claims, workerArtifact, specialtyAssessment, acceptanceChecks, evidence, uncertainties, executionLimits, evidenceVector, evidenceVectorEvidence, hardConstraintsPassed, budgetStatus. [E1353](#e1353)
  Première défaillance observée=trace terminale absente de la capture ; guardrail persisté=tokens budget exhausted during execution (194885 > 8000).. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E1306](#e1306), [E1307](#e1307)
  Receipts=ad5cf8e7-5b03-578a-87f3-4adc718f591d blocked verified=false ; bindings=1, runs=1, commandes capturées=6. Copie exacte audit.json#/cases/6/attempts/0/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-recursive-difficile-a1_3_fce44866d092** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-recursive-difficile-a1, relation=independent, maxTokens=8000. Capturé=blocked/PIDnull; actuel=blocked/PIDnull. [E1359](#e1359), [E2956](#e2956)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E1359](#e1359), [E1360](#e1360), [E1412](#e1412), [E1414](#e1414), [E1410](#e1410)
  Relecture : DP BigInt copie les préfixes ; complexité O(n²2^n) reconnue. Non-récursion explicitement indiquée. Preuve de dominance reste locale. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées.
  Dernier report JSON parsable=false; champs=narration/absent. [E1410](#e1410)
  Première défaillance observée=trace terminale absente de la capture ; guardrail persisté=tokens budget exhausted during execution (120148 > 8000).. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E1359](#e1359), [E1360](#e1360)
  Receipts=f0d0b239-30f1-5f52-8651-20a67e2511b9 blocked verified=false ; bindings=1, runs=1, commandes capturées=7. Copie exacte audit.json#/cases/6/attempts/0/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

### recursive-tres-complexe

Mission originale : « Conçois une méthode générale pour résoudre un problème combinatoire composé de contraintes logiques, d'optimisation et de dépendances temporelles. Chaque fois qu'un claim central reste non vérifié ou qu'un sous-problème menace toute la solution, il peut déclencher une Trinity imbriquée. Empêche les cycles de récursion, limite la profondeur et conserve la provenance de chaque sous-résultat jusqu'à la conclusion parent. » [E1416](#e1416)

Sac à dos0/1 six objets/six capacités remplace le problème logique, optimisation et temporalité ouvert. Les champs decomposition/recursion seraient déclaratifs ; aucune contrainte temporelle ni lignée ne serait exécutée par ce banc. Aucune sortie. Confiance élevée sur le périmètre et les livrables ; propriétés non testées restent inconnues. [E1417](#e1417)

#### qual-20261006-recursive-tres-complexe-a1

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:37.688Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E1418](#e1418), [E1419](#e1419), [E1420](#e1420)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant=180000. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-recursive-tres-complexe-a1_1_e17b4b73633c** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-recursive-tres-complexe-a1, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E1421](#e1421), [E2957](#e2957)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E1421](#e1421), [E1422](#e1422)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:37:19 STRATEGY_GUARDRAIL_BLOCKED Phase 'snapshot' gate failed: ENAMETOOLONG: name too long, mkdtemp 'D:\GenOS-Trinity-qualification-20261006-01a1109a\jury-exploratory\capsules\qual-20261006-recursive-tres-complexe-a1\worker_qual-20261006-recursive-tres-complexe-a1_1_e17b4b73633c_run_1791283025076\.genos\workspace-snapshots\.snapshot-e1593db8af50-XXXXXX'. ; guardrail persisté=Phase 'snapshot' gate failed: ENAMETOOLONG: name too long, mkdtemp 'D:\GenOS-Trinity-qualification-20261006-01a1109a\jury-exploratory\capsules\qual-20261006-recursive-tres-complexe-a1\worker_qual-20261006-recursive-tres-complexe-a1_1_e17b4b73633c_run_1791283025076\.genos\workspace-snapshots\.snapshot-e1593db8af50-XXXXXX'.. Cascade=STRATEGY_GUARDRAIL_BLOCKED→AGENT_RUNTIME_HALT_REQUESTED→RUNTIME_EVENT_PROCESSING_FAILED→RUNTIME_EVENT_PROCESSING_FAILED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E1440](#e1440), [E1421](#e1421), [E1422](#e1422)
  Receipts=d33f8348-7004-59d0-8ec5-ebce6bf26cb0 blocked verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/7/attempts/0/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-recursive-tres-complexe-a1_2_ba6227b04146** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-recursive-tres-complexe-a1, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E1441](#e1441), [E2958](#e2958)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E1441](#e1441), [E1442](#e1442)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:37:17 STRATEGY_GUARDRAIL_BLOCKED Phase 'snapshot' gate failed: ENAMETOOLONG: name too long, mkdtemp 'D:\GenOS-Trinity-qualification-20261006-01a1109a\jury-exploratory\capsules\qual-20261006-recursive-tres-complexe-a1\worker_qual-20261006-recursive-tres-complexe-a1_2_ba6227b04146_run_1791283024492\.genos\workspace-snapshots\.snapshot-e1593db8af50-XXXXXX'. ; guardrail persisté=Phase 'snapshot' gate failed: ENAMETOOLONG: name too long, mkdtemp 'D:\GenOS-Trinity-qualification-20261006-01a1109a\jury-exploratory\capsules\qual-20261006-recursive-tres-complexe-a1\worker_qual-20261006-recursive-tres-complexe-a1_2_ba6227b04146_run_1791283024492\.genos\workspace-snapshots\.snapshot-e1593db8af50-XXXXXX'.. Cascade=STRATEGY_GUARDRAIL_BLOCKED→AGENT_RUNTIME_HALT_REQUESTED→RUNTIME_EVENT_PROCESSING_FAILED→RUNTIME_EVENT_PROCESSING_FAILED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E1460](#e1460), [E1441](#e1441), [E1442](#e1442)
  Receipts=11d57099-288f-5ed8-8df1-7be0486ec314 blocked verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/7/attempts/0/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-recursive-tres-complexe-a1_3_f385e1b114a7** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-recursive-tres-complexe-a1, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E1461](#e1461), [E2959](#e2959)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E1461](#e1461), [E1462](#e1462)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:37:18 STRATEGY_GUARDRAIL_BLOCKED Phase 'snapshot' gate failed: ENAMETOOLONG: name too long, mkdtemp 'D:\GenOS-Trinity-qualification-20261006-01a1109a\jury-exploratory\capsules\qual-20261006-recursive-tres-complexe-a1\worker_qual-20261006-recursive-tres-complexe-a1_3_f385e1b114a7_run_1791283024613\.genos\workspace-snapshots\.snapshot-e1593db8af50-XXXXXX'. ; guardrail persisté=Phase 'snapshot' gate failed: ENAMETOOLONG: name too long, mkdtemp 'D:\GenOS-Trinity-qualification-20261006-01a1109a\jury-exploratory\capsules\qual-20261006-recursive-tres-complexe-a1\worker_qual-20261006-recursive-tres-complexe-a1_3_f385e1b114a7_run_1791283024613\.genos\workspace-snapshots\.snapshot-e1593db8af50-XXXXXX'.. Cascade=STRATEGY_GUARDRAIL_BLOCKED→AGENT_RUNTIME_HALT_REQUESTED→RUNTIME_EVENT_PROCESSING_FAILED→RUNTIME_EVENT_PROCESSING_FAILED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E1480](#e1480), [E1461](#e1461), [E1462](#e1462)
  Receipts=dfbe3acd-cfc5-568e-82fa-6c56a2a1c37e blocked verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/7/attempts/0/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

### adaptive-simple

Mission originale : « Résous cette énigme avec trois pistes indépendantes : je pense à un nombre entre 1 et 100, divisible par 4 et par 6 mais pas par 5, et supérieur à 50. Consacre davantage d'effort uniquement à une piste qui conserve une incertitude justifiée. » [E1481](#e1481)

Le contrat fixe domaine1..100 et demande toutes les solutions [72,84,96], plutôt qu’un entier secret identifiable. Incertitude0 légitime seulement pour l’exhaustivité de cet ensemble, pas l’identité du nombre pensé. Aucune réallocation nécessaire si tout est couvert. Confiance élevée sur le périmètre et les livrables ; propriétés non testées restent inconnues. [E1482](#e1482)

#### qual-20261006-adaptive-simple-a1

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:02.126Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E1483](#e1483), [E1484](#e1484), [E1485](#e1485)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"poolTokens":18000,"minimumTokens":3000}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-adaptive-simple-a1_1_5a01e6349af1** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-adaptive-simple-a1, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E1486](#e1486), [E2960](#e2960)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E1486](#e1486), [E1487](#e1487), [E1535](#e1535), [E1537](#e1537), [E1523](#e1523)
  Relecture : Trois calculs locaux codés : exhaustif, PPCM et ensembles, comparaison effective dans solve. Distingue explicitement le nombre pensé non identifiable. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées.
  Dernier report JSON parsable=true; champs=outcome, claims, workerArtifact, specialtyAssessment, acceptanceChecks, evidence, uncertainties, executionLimits, evidenceVector, evidenceVectorEvidence, hardConstraintsPassed, budgetStatus, scopeCompletion. [E1523](#e1523)
  Première défaillance observée=2026-10-06 10:31:31 BUDGET_EXHAUSTED tokens budget exhausted during execution (95115 > 8000). ; guardrail persisté=tokens budget exhausted during execution (95115 > 8000).. Cascade=BUDGET_EXHAUSTED→STRATEGY_GUARDRAIL_BLOCKED→AGENT_RUNTIME_HALT_REQUESTED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E1534](#e1534), [E1486](#e1486), [E1487](#e1487)
  Receipts=cc842a3f-5cc5-5e1b-8a5c-f183137313db blocked verified=false ; bindings=1, runs=1, commandes capturées=5. Copie exacte audit.json#/cases/8/attempts/0/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-adaptive-simple-a1_2_f72843d7b389** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-adaptive-simple-a1, relation=independent, maxTokens=8000. Capturé=blocked/PIDnull; actuel=blocked/PIDnull. [E1539](#e1539), [E2961](#e2961)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E1539](#e1539), [E1540](#e1540), [E1578](#e1578), [E1580](#e1580), [E1576](#e1576)
  Relecture : Trois calculs locaux cohérents, comparaison en solve. Zéro incertitude sur ensemble, absence de réallocation expliquée. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées.
  Dernier report JSON parsable=true; champs=outcome, claims, workerArtifact, acceptanceChecks, evidence, specialtyAssessment, evidenceVector, evidenceVectorEvidence, hardConstraintsPassed, budgetStatus, uncertainties, executionLimits. [E1576](#e1576)
  Première défaillance observée=trace terminale absente de la capture ; guardrail persisté=tokens budget exhausted during execution (94795 > 8000).. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E1539](#e1539), [E1540](#e1540)
  Receipts=c696c94e-1361-5ecf-81ae-bd1b6290e80b blocked verified=false ; bindings=1, runs=1, commandes capturées=5. Copie exacte audit.json#/cases/8/attempts/0/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-adaptive-simple-a1_3_c12cb360a5cf** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-adaptive-simple-a1, relation=independent, maxTokens=8000. Capturé=blocked/PIDnull; actuel=blocked/PIDnull. [E1582](#e1582), [E2962](#e2962)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E1582](#e1582), [E1583](#e1583), [E1621](#e1621), [E1623](#e1623), [E1619](#e1619)
  Relecture : Trois calculs corrects ; le terme pistes indépendantes désigne trois fonctions du même worker, pas trois travailleurs adaptatifs supplémentaires. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées.
  Dernier report JSON parsable=true; champs=outcome, claims, workerArtifact, specialtyAssessment, acceptanceChecks, evidence, strategyTrace, evidenceVector, evidenceVectorEvidence, hardConstraintsPassed, budgetStatus, uncertainties, executionLimits. [E1619](#e1619)
  Première défaillance observée=trace terminale absente de la capture ; guardrail persisté=tokens budget exhausted during execution (96660 > 8000).. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E1582](#e1582), [E1583](#e1583)
  Receipts=8acaa82f-c722-5ee2-812a-23e72704c978 blocked verified=false ; bindings=1, runs=1, commandes capturées=5. Copie exacte audit.json#/cases/8/attempts/0/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

### adaptive-moyen

Mission originale : « Trouve l'algorithme le plus approprié pour détecter un cycle dans un graphe selon qu'il est dirigé ou non dirigé. Commence avec une allocation équilibrée, puis réalloue le travail aux mondes où des hypothèses importantes restent réellement non résolues. » [E1625](#e1625)

Le banc aurait testé 4 160 graphes de4sommets et deux boucles propres avec oracles fermeture/UnionFind. Aucune implémentation ; le défaut de binding précède la génération. Le banc ne mesurerait pas réallocation ni incertitude causale. Confiance élevée sur le périmètre et les livrables ; propriétés non testées restent inconnues. [E1626](#e1626)

#### qual-20261006-adaptive-moyen-a1

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:47:58.819Z: escalated; DB actuelle=escalated, motif=Trinity mission timed out: qual-20261006-adaptive-moyen-a1. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E1627](#e1627), [E1628](#e1628), [E1629](#e1629)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"poolTokens":18000,"minimumTokens":3000}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-adaptive-moyen-a1_1_ae50b0a8a4ae** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-adaptive-moyen-a1, relation=independent, maxTokens=8000. Capturé=idle/PIDnull; actuel=idle/PIDnull. [E1630](#e1630), [E2963](#e2963)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E1630](#e1630), [E1631](#e1631)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne10 log [GarageFabric] Reconciliation blocked: SQLITE_MISUSE: Database handle is closed ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E1637](#e1637), [E1638](#e1638), [E1630](#e1630), [E1631](#e1631)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/9/attempts/0/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-adaptive-moyen-a1_2_891a636a206e** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-adaptive-moyen-a1, relation=independent, maxTokens=8000. Capturé=idle/PIDnull; actuel=idle/PIDnull. [E1639](#e1639), [E2964](#e2964)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E1639](#e1639), [E1640](#e1640)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne10 log Error: BIOLOGICAL_WORKER_MISSION_AMBIGUOUS ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E1646](#e1646), [E1639](#e1639), [E1640](#e1640)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/9/attempts/0/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-adaptive-moyen-a1_3_36aa03da16ea** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-adaptive-moyen-a1, relation=independent, maxTokens=8000. Capturé=idle/PIDnull; actuel=idle/PIDnull. [E1647](#e1647), [E2965](#e2965)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E1647](#e1647), [E1648](#e1648)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne10 log Error: BIOLOGICAL_WORKER_MISSION_AMBIGUOUS ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E1654](#e1654), [E1647](#e1647), [E1648](#e1648)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/9/attempts/0/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-adaptive-moyen-a2

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:00.832Z: escalated; DB actuelle=escalated, motif=Trinity mission timed out: qual-20261006-adaptive-moyen-a2. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E1655](#e1655), [E1656](#e1656), [E1657](#e1657)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"poolTokens":18000,"minimumTokens":3000}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-adaptive-moyen-a2_1_a1ae93c77347** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-adaptive-moyen-a2, relation=independent, maxTokens=8000. Capturé=idle/PIDnull; actuel=idle/PIDnull. [E1658](#e1658), [E2966](#e2966)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E1658](#e1658), [E1659](#e1659)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne21 log [GarageFabric] Reconciliation blocked: SQLITE_MISUSE: Database handle is closed ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E1665](#e1665), [E1666](#e1666), [E1658](#e1658), [E1659](#e1659)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/9/attempts/1/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-adaptive-moyen-a2_2_445b73b6d9e2** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-adaptive-moyen-a2, relation=independent, maxTokens=8000. Capturé=idle/PIDnull; actuel=idle/PIDnull. [E1667](#e1667), [E2967](#e2967)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E1667](#e1667), [E1668](#e1668)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne20 log Error: BIOLOGICAL_WORKER_MISSION_AMBIGUOUS ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E1674](#e1674), [E1667](#e1667), [E1668](#e1668)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/9/attempts/1/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-adaptive-moyen-a2_3_b65698e57116** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-adaptive-moyen-a2, relation=independent, maxTokens=8000. Capturé=idle/PIDnull; actuel=idle/PIDnull. [E1675](#e1675), [E2968](#e2968)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E1675](#e1675), [E1676](#e1676)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne11 log Error: BIOLOGICAL_WORKER_MISSION_AMBIGUOUS ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E1682](#e1682), [E1675](#e1675), [E1676](#e1676)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/9/attempts/1/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

### adaptive-difficile

Mission originale : « Analyse trois explications possibles d'un bug intermittent dans un système distribué fictif. Après une première passe égale, consacre les ressources restantes aux hypothèses qui présentent la plus forte incertitude documentée, sans supprimer prématurément les autres. » [E1683](#e1683)

Les quatre traces et la causalité par priorité sont fournies dans le contrat. Classer ces indicateurs n’est pas découvrir une cause. Trois fichiers apparus après la capture ne possèdent aucun replay indépendant historique ; code relu statiquement seulement. Confiance élevée sur le périmètre et les livrables ; propriétés non testées restent inconnues. [E1684](#e1684)

#### qual-20261006-adaptive-difficile-a2

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:47:57.387Z: sealed_running; DB actuelle=escalated, motif=Trinity mission timed out: qual-20261006-adaptive-difficile-a2. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E1685](#e1685), [E1686](#e1686), [E1687](#e1687)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"poolTokens":18000,"minimumTokens":3000}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-adaptive-difficile-a2_1_47d82d105c2d** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-adaptive-difficile-a2, relation=independent, maxTokens=8000. Capturé=running/PID93056; actuel=error/PIDnull. [E1688](#e1688), [E2969](#e2969)
  Artefact historique=pas de PASS, tardif sans replay=true, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E1688](#e1688), [E1689](#e1689), [E1716](#e1716), [E1717](#e1717), [E1713](#e1713)
  Relecture : diagnose respecte statiquement la priorité imposée. Plan local12obligations avec sélection gloutonne de couverture ; gateAdaptive refuse absence/doublons. Les confirmations locales sont distinctes du runtime. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées.
  Dernier report JSON parsable=false; champs=narration/absent. [E1713](#e1713)
  Première défaillance observée=ligne4551 log Error: GenOS orchestrator timed out ; guardrail persisté=tokens budget exhausted during execution (103429 > 8000).. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E1715](#e1715), [E1688](#e1688), [E1689](#e1689)
  Receipts=d22b7643-623d-505b-8449-6f21ae7489d1 blocked verified=false ; bindings=1, runs=1, commandes capturées=2. Copie exacte audit.json#/cases/10/attempts/0/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-adaptive-difficile-a2_2_425cd03c3869** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-adaptive-difficile-a2, relation=independent, maxTokens=8000. Capturé=running/PID45228; actuel=error/PIDnull. [E1718](#e1718), [E2970](#e2970)
  Artefact historique=pas de PASS, tardif sans replay=true, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E1718](#e1718), [E1719](#e1719), [E1743](#e1743), [E1744](#e1744), [E1732](#e1732)
  Relecture : diagnose conforme ; expériences locales7obligations et sélection de l’incertitude maximale. Tests indépendants annoncés quatre, complémentaires autogénérés. Événements experiment.json locaux, pas réallocation GenOS. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées.
  Dernier report JSON parsable=false; champs=narration/absent. [E1732](#e1732)
  Première défaillance observée=ligne4601 log Error: GenOS orchestrator timed out ; guardrail persisté=tokens budget exhausted during execution (147297 > 8000).. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E1742](#e1742), [E1718](#e1718), [E1719](#e1719)
  Receipts=b0d50c18-e2a3-520b-8f73-349e9df993ff blocked verified=false ; bindings=1, runs=1, commandes capturées=2. Copie exacte audit.json#/cases/10/attempts/0/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-adaptive-difficile-a2_3_687480aa0905** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-adaptive-difficile-a2, relation=independent, maxTokens=8000. Capturé=running/PID88308; actuel=error/PIDnull. [E1745](#e1745), [E2971](#e2971)
  Artefact historique=pas de PASS, tardif sans replay=true, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E1745](#e1745), [E1746](#e1746), [E1772](#e1772), [E1773](#e1773), [E1759](#e1759)
  Relecture : diagnose conforme ; gateAdaptive alloue selon0.1+couverture manquante, reste cyclique. Plan9tests et ratio3/2/1 proposés/locaux, pas allocation de workers. Entrées invalides hors contrat. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées.
  Dernier report JSON parsable=false; champs=narration/absent. [E1759](#e1759)
  Première défaillance observée=ligne4541 log Error: GenOS orchestrator timed out ; guardrail persisté=tokens budget exhausted during execution (189358 > 8000).. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E1771](#e1771), [E1745](#e1745), [E1746](#e1746)
  Receipts=e264f717-df6f-56b4-8c51-ee9adc4acfec blocked verified=false ; bindings=1, runs=1, commandes capturées=2. Copie exacte audit.json#/cases/10/attempts/0/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

### adaptive-tres-complexe

Mission originale : « Résous un problème d'optimisation où trois familles d'approches ont des niveaux d'incertitude très différents. Impose un budget total strict. Commence par une exploration minimale équitable, estime l'incertitude résiduelle à partir des preuves obtenues, alloue dynamiquement le budget restant et justifie chaque réallocation. Compare le résultat final à ce qu'aurait probablement produit une allocation uniforme. » [E1774](#e1774)

Sac à dos fixe sert de résultat exact, mais méthodes>=3 et evidenceRefs non vides ne prouveraient ni preuves réelles ni réallocation ni comparaison uniforme exécutée. Aucun livrable ; des idle sans PID ne constituaient pas une complétion. Confiance élevée sur le périmètre et les livrables ; propriétés non testées restent inconnues. [E1775](#e1775)

#### qual-20261006-adaptive-tres-complexe-a2

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:03.381Z: sealed_running; DB actuelle=escalated, motif=Trinity mission timed out: qual-20261006-adaptive-tres-complexe-a2. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E1776](#e1776), [E1777](#e1777), [E1778](#e1778)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"poolTokens":18000,"minimumTokens":3000}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-adaptive-tres-complexe-a2_1_0d05c542ef32** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-adaptive-tres-complexe-a2, relation=independent, maxTokens=8000. Capturé=idle/PID69956; actuel=idle/PID69956. [E1779](#e1779), [E2972](#e2972)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E1779](#e1779), [E1780](#e1780)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne61 log Error: SQLITE_BUSY: database is locked ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E1786](#e1786), [E1779](#e1779), [E1780](#e1780)
  Receipts=aucun ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/11/attempts/0/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-adaptive-tres-complexe-a2_2_84a79a1ca074** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-adaptive-tres-complexe-a2, relation=independent, maxTokens=8000. Capturé=idle/PIDnull; actuel=error/PIDnull. [E1787](#e1787), [E2973](#e2973)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E1787](#e1787), [E1788](#e1788)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:47:48 STRATEGY_GUARDRAIL_BLOCKED Phase 'snapshot' gate failed: ENAMETOOLONG: name too long, mkdtemp 'D:\GenOS-Trinity-qualification-20261006-01a1109a\jury-exploratory\capsules\qual-20261006-adaptive-tres-complexe-a2\worker_qual-20261006-adaptive-tres-complexe-a2_2_84a79a1ca074_run_1791283647173\.genos\workspace-snapshots\.snapshot-5542244676d4-XXXXXX'. ; guardrail persisté=Phase 'snapshot' gate failed: ENAMETOOLONG: name too long, mkdtemp 'D:\GenOS-Trinity-qualification-20261006-01a1109a\jury-exploratory\capsules\qual-20261006-adaptive-tres-complexe-a2\worker_qual-20261006-adaptive-tres-complexe-a2_2_84a79a1ca074_run_1791283647173\.genos\workspace-snapshots\.snapshot-5542244676d4-XXXXXX'.. Cascade=STRATEGY_GUARDRAIL_BLOCKED→AGENT_RUNTIME_HALT_REQUESTED→RUNTIME_EVENT_PROCESSING_FAILED→RUNTIME_EVENT_PROCESSING_FAILED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E1806](#e1806), [E1787](#e1787), [E1788](#e1788)
  Receipts=453ec83a-f173-52c6-8b62-b26df0833d08 blocked verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/11/attempts/0/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-adaptive-tres-complexe-a2_3_06bd3b594bcc** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-adaptive-tres-complexe-a2, relation=independent, maxTokens=8000. Capturé=idle/PIDnull; actuel=error/PIDnull. [E1807](#e1807), [E2974](#e2974)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E1807](#e1807), [E1808](#e1808)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:47:49 STRATEGY_GUARDRAIL_BLOCKED Phase 'snapshot' gate failed: ENAMETOOLONG: name too long, mkdtemp 'D:\GenOS-Trinity-qualification-20261006-01a1109a\jury-exploratory\capsules\qual-20261006-adaptive-tres-complexe-a2\worker_qual-20261006-adaptive-tres-complexe-a2_3_06bd3b594bcc_run_1791283647827\.genos\workspace-snapshots\.snapshot-5542244676d4-XXXXXX'. ; guardrail persisté=Phase 'snapshot' gate failed: ENAMETOOLONG: name too long, mkdtemp 'D:\GenOS-Trinity-qualification-20261006-01a1109a\jury-exploratory\capsules\qual-20261006-adaptive-tres-complexe-a2\worker_qual-20261006-adaptive-tres-complexe-a2_3_06bd3b594bcc_run_1791283647827\.genos\workspace-snapshots\.snapshot-5542244676d4-XXXXXX'.. Cascade=STRATEGY_GUARDRAIL_BLOCKED→AGENT_RUNTIME_HALT_REQUESTED→RUNTIME_EVENT_PROCESSING_FAILED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E1824](#e1824), [E1807](#e1807), [E1808](#e1808)
  Receipts=cc4484ff-037b-544b-8453-ba2b8a036d8a blocked verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/11/attempts/0/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

### exploratory-simple

Mission originale : « Trouve trois utilisations réellement inhabituelles d'une feuille de papier qui ne soient ni écrire, ni dessiner, ni fabriquer un avion. » [E1825](#e1825)

Concepts inhabituels hors écrire/dessiner/avion, plausibilité physique non vérifiée. Le banc vérifie graphes syntaxiques et scénarios choisis par leur auteur ; family distinct est seulement une chaîne. Les deux fractions [0,0] ne différencient pas les concepts. Confiance élevée sur le périmètre et les livrables ; propriétés non testées restent inconnues. [E1826](#e1826)

#### qual-20261006-exploratory-simple-a2

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:09.904Z: escalated; DB actuelle=escalated, motif=Trinity mission timed out: qual-20261006-exploratory-simple-a2. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E1827](#e1827), [E1828](#e1828), [E1829](#e1829)

Budget demandé={"tokens":30000,"events":120,"latencyMs":240000,"costUsd":2} ; config variant={"replicaBudget":1,"tokensPerReplica":6000}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-exploratory-simple-a2_1_6b022e56b537** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-exploratory-simple-a2, relation=independent, maxTokens=8000. Capturé=idle/PIDnull; actuel=idle/PIDnull. [E1830](#e1830), [E2975](#e2975)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E1830](#e1830), [E1831](#e1831)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:06:10 AGENT_FAILED Runtime exited unsuccessfully: For more information, try '--help'. ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E1830](#e1830), [E1831](#e1831)
  Receipts=2b8c4a70-7500-52f2-8cd6-7db4311c5b02 failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/12/attempts/0/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-exploratory-simple-a2_2_ff1db7067d76** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-exploratory-simple-a2, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E1846](#e1846), [E2976](#e2976)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E1846](#e1846), [E1847](#e1847)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:06:06 AGENT_FAILED Runtime exited unsuccessfully: For more information, try '--help'. ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E1846](#e1846), [E1847](#e1847)
  Receipts=e8b65847-d601-5fd9-8f40-93929df30b0c failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/12/attempts/0/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-exploratory-simple-a2_3_30ae2809378b** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-exploratory-simple-a2, relation=independent, maxTokens=8000. Capturé=idle/PIDnull; actuel=idle/PIDnull. [E1868](#e1868), [E2977](#e2977)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E1868](#e1868), [E1869](#e1869)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:06:06 AGENT_FAILED Runtime exited unsuccessfully: For more information, try '--help'. ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E1868](#e1868), [E1869](#e1869)
  Receipts=66ac43fb-fdc4-550a-85be-efbd44ec8ff4 failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/12/attempts/0/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-exploratory-simple-a3

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:10.976Z: escalated; DB actuelle=escalated, motif=Trinity mission timed out: qual-20261006-exploratory-simple-a3. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E1881](#e1881), [E1882](#e1882), [E1883](#e1883)

Budget demandé={"tokens":30000,"events":120,"latencyMs":240000,"costUsd":2} ; config variant={"replicaBudget":1,"tokensPerReplica":6000}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-exploratory-simple-a3_1_42b4ddc85ab1** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-exploratory-simple-a3, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E1884](#e1884), [E2978](#e2978)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E1884](#e1884), [E1885](#e1885), [E1913](#e1913)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent. [E1913](#e1913)
  Première défaillance observée=2026-10-06 10:09:30 BUDGET_EXHAUSTED tokens budget exhausted during execution (86007 > 8000). ; guardrail persisté=tokens budget exhausted during execution (86007 > 8000).. Cascade=BUDGET_EXHAUSTED→STRATEGY_GUARDRAIL_BLOCKED→AGENT_RUNTIME_HALT_REQUESTED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E1924](#e1924), [E1884](#e1884), [E1885](#e1885)
  Receipts=502dd7d1-f83f-590a-8536-e5978f751691 blocked verified=false ; bindings=1, runs=1, commandes capturées=3. Copie exacte audit.json#/cases/12/attempts/1/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-exploratory-simple-a3_2_a826950eed02** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-exploratory-simple-a3, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E1925](#e1925), [E2979](#e2979)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E1925](#e1925), [E1926](#e1926), [E1942](#e1942)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent. [E1942](#e1942)
  Première défaillance observée=2026-10-06 10:09:17 BUDGET_EXHAUSTED tokens budget exhausted during execution (34678 > 8000). ; guardrail persisté=tokens budget exhausted during execution (34678 > 8000).. Cascade=BUDGET_EXHAUSTED→STRATEGY_GUARDRAIL_BLOCKED→AGENT_RUNTIME_HALT_REQUESTED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E1953](#e1953), [E1925](#e1925), [E1926](#e1926)
  Receipts=1c7a6828-8dbf-5683-8139-02f68f9f5114 blocked verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/12/attempts/1/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-exploratory-simple-a3_3_8ef4cf5b6283** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-exploratory-simple-a3, relation=independent, maxTokens=8000. Capturé=idle/PIDnull; actuel=idle/PIDnull. [E1954](#e1954), [E2980](#e2980)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E1954](#e1954), [E1955](#e1955), [E1979](#e1979)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent. [E1979](#e1979)
  Première défaillance observée=trace terminale absente de la capture ; guardrail persisté=tokens budget exhausted during execution (51417 > 8000).. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E1954](#e1954), [E1955](#e1955)
  Receipts=e033e4ba-c835-5998-8b3f-36df7509546d blocked verified=false ; bindings=1, runs=1, commandes capturées=2. Copie exacte audit.json#/cases/12/attempts/1/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-exploratory-simple-a4

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:12.307Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E1981](#e1981), [E1982](#e1982), [E1983](#e1983)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"replicaBudget":1,"tokensPerReplica":150000}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-exploratory-simple-a4_1_c6d9bdfe1ab5** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-exploratory-simple-a4, relation=independent, maxTokens=8000. Capturé=blocked/PIDnull; actuel=blocked/PIDnull. [E1984](#e1984), [E2981](#e2981)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E1984](#e1984), [E1985](#e1985), [E2031](#e2031), [E2029](#e2029)
  Relecture : Condensation/clapet/vibration : trois mécanismes plausibles, hypothèses correctement explicites. Aucun solution.cjs historique, mais graphe rejoué directement par le banc. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées. Réserves : Le banc ne requiert pas solution.cjs : PASS du graphe dans answer uniquement.
  Dernier report JSON parsable=true; champs=outcome, claims, scopeCompletion. [E2029](#e2029)
  Première défaillance observée=trace terminale absente de la capture ; guardrail persisté=tokens budget exhausted during execution (98148 > 8000).. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E1984](#e1984), [E1985](#e1985)
  Receipts=6e383727-386e-54a4-87f2-efa52dcad349 blocked verified=false ; bindings=1, runs=1, commandes capturées=6. Copie exacte audit.json#/cases/12/attempts/2/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-exploratory-simple-a4_2_1c166f85842a** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-exploratory-simple-a4, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2033](#e2033), [E2982](#e2982)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E2033](#e2033), [E2034](#e2034), [E2095](#e2095), [E2082](#e2082)
  Relecture : Capteur sacrificiel/frein de bille/mèche capillaire : mécanismes distincts, caractère réellement inhabituel subjectif. Tous les triggers supposent les phénomènes physiques. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées. Réserves : Le banc ne requiert pas solution.cjs : PASS du graphe dans answer uniquement.
  Dernier report JSON parsable=false; champs=narration/absent. [E2082](#e2082)
  Première défaillance observée=2026-10-06 10:17:20 BUDGET_EXHAUSTED tokens budget exhausted during execution (164040 > 8000). ; guardrail persisté=tokens budget exhausted during execution (164040 > 8000).. Cascade=BUDGET_EXHAUSTED→STRATEGY_GUARDRAIL_BLOCKED→AGENT_RUNTIME_HALT_REQUESTED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E2093](#e2093), [E2094](#e2094), [E2033](#e2033), [E2034](#e2034)
  Receipts=d2d93184-0cca-579f-8446-d5a35141f4b5 blocked verified=false ; bindings=1, runs=1, commandes capturées=7. Copie exacte audit.json#/cases/12/attempts/2/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-exploratory-simple-a4_3_1850d60c5d07** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-exploratory-simple-a4, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2097](#e2097), [E2983](#e2983)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E2097](#e2097), [E2098](#e2098), [E2164](#e2164), [E2152](#e2152)
  Relecture : Clapet/hygromorphie/cale : différences mécaniques plausibles et risques mesurés non revendiqués. Plusieurs graphes sont des cycles quasi-isomorphes, diversité non mesurée par les fractions. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées. Réserves : Le banc ne requiert pas solution.cjs : PASS du graphe dans answer uniquement. budgetStatus ignore ou contredit les plafonds request et worker ; non mesuré ne signifie pas illimité.
  Dernier report JSON parsable=false; champs=narration/absent. [E2152](#e2152)
  Première défaillance observée=2026-10-06 10:17:23 BUDGET_EXHAUSTED tokens budget exhausted during execution (162562 > 8000). ; guardrail persisté=tokens budget exhausted during execution (162562 > 8000).. Cascade=BUDGET_EXHAUSTED→STRATEGY_GUARDRAIL_BLOCKED→AGENT_RUNTIME_HALT_REQUESTED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E2163](#e2163), [E2097](#e2097), [E2098](#e2098)
  Receipts=29a5a813-6805-5a24-8f7d-dccb3cfebc60 blocked verified=false ; bindings=1, runs=1, commandes capturées=8. Copie exacte audit.json#/cases/12/attempts/2/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-exploratory-simple-a5-local

Executor=local, dispatch exit=0. Capture 2026-10-06T10:48:13.292Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E2166](#e2166), [E2167](#e2167), [E2168](#e2168)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"replicaBudget":1,"tokensPerReplica":150000}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-exploratory-simple-a5-local_1_f61004319924** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-exploratory-simple-a5-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2169](#e2169), [E2984](#e2984)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2169](#e2169), [E2170](#e2170)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-exploratory-simple-a5-local_1_f61004319924' has no workspace delegation from orchestrator 'qual-20261006-exploratory-simple-a5-local'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E2173](#e2173), [E2169](#e2169), [E2170](#e2170)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/12/attempts/3/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-exploratory-simple-a5-local_2_305e6bf62477** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-exploratory-simple-a5-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2174](#e2174), [E2985](#e2985)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2174](#e2174), [E2175](#e2175)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-exploratory-simple-a5-local_2_305e6bf62477' has no workspace delegation from orchestrator 'qual-20261006-exploratory-simple-a5-local'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E2178](#e2178), [E2174](#e2174), [E2175](#e2175)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/12/attempts/3/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-exploratory-simple-a5-local_3_7d1ec7d742c3** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-exploratory-simple-a5-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2179](#e2179), [E2986](#e2986)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2179](#e2179), [E2180](#e2180)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-exploratory-simple-a5-local_3_7d1ec7d742c3' has no workspace delegation from orchestrator 'qual-20261006-exploratory-simple-a5-local'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E2183](#e2183), [E2179](#e2179), [E2180](#e2180)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/12/attempts/3/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-exploratory-simple-a6-codex

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:13.790Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E2184](#e2184), [E2185](#e2185), [E2186](#e2186)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"replicaBudget":1,"tokensPerReplica":150000}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-exploratory-simple-a6-codex_1_2483fdab3f8c** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-exploratory-simple-a6-codex, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2187](#e2187), [E2987](#e2987)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2187](#e2187), [E2188](#e2188)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-exploratory-simple-a6-codex_1_2483fdab3f8c' has no workspace delegation from orchestrator 'qual-20261006-exploratory-simple-a6-codex'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E2191](#e2191), [E2187](#e2187), [E2188](#e2188)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/12/attempts/4/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-exploratory-simple-a6-codex_2_2e279819f040** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-exploratory-simple-a6-codex, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2192](#e2192), [E2988](#e2988)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2192](#e2192), [E2193](#e2193)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-exploratory-simple-a6-codex_2_2e279819f040' has no workspace delegation from orchestrator 'qual-20261006-exploratory-simple-a6-codex'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E2196](#e2196), [E2192](#e2192), [E2193](#e2193)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/12/attempts/4/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-exploratory-simple-a6-codex_3_768a30e19ef1** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-exploratory-simple-a6-codex, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2197](#e2197), [E2989](#e2989)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2197](#e2197), [E2198](#e2198)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-exploratory-simple-a6-codex_3_768a30e19ef1' has no workspace delegation from orchestrator 'qual-20261006-exploratory-simple-a6-codex'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E2201](#e2201), [E2197](#e2197), [E2198](#e2198)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/12/attempts/4/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-exploratory-simple-a6-local

Executor=local, dispatch exit=0. Capture 2026-10-06T10:48:14.356Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E2202](#e2202), [E2203](#e2203), [E2204](#e2204)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"replicaBudget":1,"tokensPerReplica":150000}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-exploratory-simple-a6-local_1_6405a46c2b8f** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-exploratory-simple-a6-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2205](#e2205), [E2990](#e2990)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2205](#e2205), [E2206](#e2206)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:25:16 AGENT_FAILED Omega native graph blocked: tool_missing ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E2205](#e2205), [E2206](#e2206)
  Receipts=6faa51a6-96e8-5f13-82ba-a90cbb7c7ca2 failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/12/attempts/5/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-exploratory-simple-a6-local_2_896430d0f358** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-exploratory-simple-a6-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2214](#e2214), [E2991](#e2991)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2214](#e2214), [E2215](#e2215)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:25:16 AGENT_FAILED Omega native graph blocked: tool_missing ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E2214](#e2214), [E2215](#e2215)
  Receipts=577e523d-7a4e-5ebf-8b43-ebadfe74a48d failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/12/attempts/5/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-exploratory-simple-a6-local_3_4c2ebf0f7c82** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-exploratory-simple-a6-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2223](#e2223), [E2992](#e2992)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2223](#e2223), [E2224](#e2224)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:25:16 AGENT_FAILED Omega native graph blocked: tool_missing ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E2223](#e2223), [E2224](#e2224)
  Receipts=070a51e4-9f69-5132-8b9e-6f33a48ebca3 failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/12/attempts/5/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

### exploratory-moyen

Mission originale : « Imagine plusieurs systèmes de navigation pour une interface sans menus, sans barre de navigation et sans moteur de recherche. Cherche des familles de comportements différentes plutôt que des variations graphiques. » [E2232](#e2232)

Deux PASS sur deux tentatives, seulement un conforme qualitativement. a3 monde1 viole sans menus/barre/moteur : propose barre d’onglets et champ de recherche. a6 monde1 propose destination par espace, relation et accomplissement, conforme à l’interdiction mais sans UI ni test utilisateurs. Le banc ne vérifie aucune interdiction. Confiance élevée sur le périmètre et les livrables ; propriétés non testées restent inconnues. [E2233](#e2233)

#### qual-20261006-exploratory-moyen-a3

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:05.986Z: escalated; DB actuelle=escalated, motif=Trinity mission timed out: qual-20261006-exploratory-moyen-a3. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E2234](#e2234), [E2235](#e2235), [E2236](#e2236)

Budget demandé={"tokens":30000,"events":120,"latencyMs":240000,"costUsd":2} ; config variant={"replicaBudget":1,"tokensPerReplica":6000}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-exploratory-moyen-a3_1_fe023e892b31** — chambre=direct, rôle=baseline_product_designer, kind=bounded_worker, type=GenOS. Parent=qual-20261006-exploratory-moyen-a3, relation=independent, maxTokens=8000. Capturé=blocked/PIDnull; actuel=blocked/PIDnull. [E2237](#e2237), [E2993](#e2993)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E2237](#e2237), [E2238](#e2238), [E2280](#e2280), [E2277](#e2277)
  Relecture : a3 monde1 : VIOLATION de mission établie, malgré PASS du graphe. Six variantes de trois familles familières, toutes basées sur un envoi externe inventé. Pas de solution.cjs historique. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées. Réserves : Le banc ne requiert pas solution.cjs : PASS du graphe dans answer uniquement. Interdictions mission originale violées : onglets et moteur de recherche.
  Dernier report JSON parsable=false; champs=narration/absent. [E2277](#e2277)
  Première défaillance observée=trace terminale absente de la capture ; guardrail persisté=tokens budget exhausted during execution (90462 > 8000).. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E2279](#e2279), [E2237](#e2237), [E2238](#e2238)
  Receipts=8812aff3-bdb1-5cd7-88f2-7d425bf54b38 blocked verified=false ; bindings=1, runs=1, commandes capturées=5. Copie exacte audit.json#/cases/13/attempts/0/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-exploratory-moyen-a3_2_3153a207fd5d** — chambre=structured, rôle=planned_product_designer, kind=specialist, type=GenOS. Parent=qual-20261006-exploratory-moyen-a3, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2282](#e2282), [E2994](#e2994)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2282](#e2282), [E2283](#e2283), [E2299](#e2299)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent. [E2299](#e2299)
  Première défaillance observée=2026-10-06 10:13:24 BUDGET_EXHAUSTED tokens budget exhausted during execution (33340 > 8000). ; guardrail persisté=tokens budget exhausted during execution (33340 > 8000).. Cascade=BUDGET_EXHAUSTED→STRATEGY_GUARDRAIL_BLOCKED→AGENT_RUNTIME_HALT_REQUESTED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E2308](#e2308), [E2309](#e2309), [E2282](#e2282), [E2283](#e2283)
  Receipts=71af6453-fda1-5c0d-8b9a-e6e1dcd8d5c8 blocked verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/13/attempts/0/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-exploratory-moyen-a3_3_34c428cce2dc** — chambre=falsification, rôle=usability_critic, kind=verifier_worker, type=GenOS. Parent=qual-20261006-exploratory-moyen-a3, relation=independent, maxTokens=8000. Capturé=blocked/PIDnull; actuel=blocked/PIDnull. [E2310](#e2310), [E2995](#e2995)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2310](#e2310), [E2311](#e2311), [E2327](#e2327)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent. [E2327](#e2327)
  Première défaillance observée=trace terminale absente de la capture ; guardrail persisté=tokens budget exhausted during execution (33325 > 8000).. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E2310](#e2310), [E2311](#e2311)
  Receipts=eb32d8e9-be23-5cfb-8a8c-842ad951e2ad blocked verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/13/attempts/0/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-exploratory-moyen-a5-local

Executor=local, dispatch exit=0. Capture 2026-10-06T10:48:06.660Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E2329](#e2329), [E2330](#e2330), [E2331](#e2331)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"replicaBudget":1,"tokensPerReplica":150000}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-exploratory-moyen-a5-local_1_a06e1405277d** — chambre=direct, rôle=baseline_product_designer, kind=bounded_worker, type=GenOS. Parent=qual-20261006-exploratory-moyen-a5-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2332](#e2332), [E2996](#e2996)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2332](#e2332), [E2333](#e2333)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-exploratory-moyen-a5-local_1_a06e1405277d' has no workspace delegation from orchestrator 'qual-20261006-exploratory-moyen-a5-local'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E2336](#e2336), [E2332](#e2332), [E2333](#e2333)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/13/attempts/1/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-exploratory-moyen-a5-local_2_42970779b499** — chambre=structured, rôle=planned_product_designer, kind=specialist, type=GenOS. Parent=qual-20261006-exploratory-moyen-a5-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2337](#e2337), [E2997](#e2997)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2337](#e2337), [E2338](#e2338)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-exploratory-moyen-a5-local_2_42970779b499' has no workspace delegation from orchestrator 'qual-20261006-exploratory-moyen-a5-local'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E2341](#e2341), [E2337](#e2337), [E2338](#e2338)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/13/attempts/1/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-exploratory-moyen-a5-local_3_53f4b5c1c098** — chambre=falsification, rôle=usability_critic, kind=verifier_worker, type=GenOS. Parent=qual-20261006-exploratory-moyen-a5-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2342](#e2342), [E2998](#e2998)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2342](#e2342), [E2343](#e2343)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-exploratory-moyen-a5-local_3_53f4b5c1c098' has no workspace delegation from orchestrator 'qual-20261006-exploratory-moyen-a5-local'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E2346](#e2346), [E2342](#e2342), [E2343](#e2343)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/13/attempts/1/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-exploratory-moyen-a6-codex

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:07.583Z: escalated; DB actuelle=escalated, motif=Trinity mission timed out: qual-20261006-exploratory-moyen-a6-codex. Journal=0, calibration=0. Chemins distincts=false, snapshot commun=true. [E2347](#e2347), [E2348](#e2348), [E2349](#e2349)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"replicaBudget":1,"tokensPerReplica":150000}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-exploratory-moyen-a6-codex_1_361228b80193** — chambre=direct, rôle=baseline_product_designer, kind=bounded_worker, type=GenOS. Parent=qual-20261006-exploratory-moyen-a6-codex, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2350](#e2350), [E2999](#e2999)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E2350](#e2350), [E2351](#e2351), [E2414](#e2414), [E2416](#e2416), [E2394](#e2394)
  Relecture : a6 monde1 : familles espace/liens/tâche réellement différentes, sans menus/recherche décrits. Moteur replay fonctionne à la lecture ; les6scénarios supplémentaires figurent dans les commandes. Usabilité inconnue. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées.
  Dernier report JSON parsable=false; champs=narration/absent. [E2394](#e2394)
  Première défaillance observée=2026-10-06 10:26:28 AGENT_RUNTIME_HALT_REQUESTED Runtime halted: Swarm Sentinel detected infinite cognitive repetition / deadlock. ; guardrail persisté=Runtime halted by deadlock_collapse: Cyclic deadlock detected: periodic loop of length 4 detected.. Cascade=AGENT_RUNTIME_HALT_REQUESTED→AGENT_HALTED→AGENT_FINALIZATION_ERROR→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E2406](#e2406), [E2407](#e2407), [E2350](#e2350), [E2351](#e2351)
  Receipts=e11f7d03-8570-5934-8de7-efa49c6f5033 blocked verified=false ; bindings=1, runs=1, commandes capturées=7. Copie exacte audit.json#/cases/13/attempts/2/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-exploratory-moyen-a6-codex_2_c7bd458d658d** — chambre=structured, rôle=planned_product_designer, kind=specialist, type=GenOS. Parent=qual-20261006-exploratory-moyen-a6-codex, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2418](#e2418), [E3000](#e3000)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. replay absent. [E2418](#e2418)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: SQLITE_FULL: database or disk is full ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E2420](#e2420), [E2418](#e2418)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/13/attempts/2/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-exploratory-moyen-a6-codex_3_3c8fe6588fcb** — chambre=falsification, rôle=usability_critic, kind=verifier_worker, type=GenOS. Parent=qual-20261006-exploratory-moyen-a6-codex, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2421](#e2421), [E3001](#e3001)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. replay absent. [E2421](#e2421)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: SQLITE_FULL: database or disk is full ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E2423](#e2423), [E2421](#e2421)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/13/attempts/2/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-exploratory-moyen-a6-local

Executor=local, dispatch exit=0. Capture 2026-10-06T10:48:08.870Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E2424](#e2424), [E2425](#e2425), [E2426](#e2426)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"replicaBudget":1,"tokensPerReplica":150000}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-exploratory-moyen-a6-local_1_bdd778e6bb2d** — chambre=direct, rôle=baseline_product_designer, kind=bounded_worker, type=GenOS. Parent=qual-20261006-exploratory-moyen-a6-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2427](#e2427), [E3002](#e3002)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2427](#e2427), [E2428](#e2428)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: SQLITE_FULL: database or disk is full ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E2430](#e2430), [E2427](#e2427), [E2428](#e2428)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/13/attempts/3/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-exploratory-moyen-a6-local_2_9ea3d712ccef** — chambre=structured, rôle=planned_product_designer, kind=specialist, type=GenOS. Parent=qual-20261006-exploratory-moyen-a6-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2431](#e2431), [E3003](#e3003)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2431](#e2431), [E2432](#e2432)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:25:35 AGENT_FAILED Omega native graph blocked: tool_missing ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E2431](#e2431), [E2432](#e2432)
  Receipts=6c06447a-f339-5363-874e-9a3f7192b75c failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/13/attempts/3/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-exploratory-moyen-a6-local_3_02d29b00a025** — chambre=falsification, rôle=usability_critic, kind=verifier_worker, type=GenOS. Parent=qual-20261006-exploratory-moyen-a6-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2440](#e2440), [E3004](#e3004)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2440](#e2440), [E2441](#e2441)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:25:35 AGENT_FAILED Omega native graph blocked: tool_missing ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E2440](#e2440), [E2441](#e2441)
  Receipts=f66483e0-3bb6-5e86-8eec-6a4fb2013135 failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/13/attempts/3/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

### exploratory-difficile

Mission originale : « Invente des manières radicalement différentes pour un agent logiciel de représenter et transmettre son incertitude sans utiliser un simple nombre entre 0 et 1. Cherche plusieurs niches conceptuelles et conserve les solutions à la fois nouvelles et utilisables. » [E2449](#e2449)

Aucune sortie. Le contrat réduit aussi cette mission exploratoire à des graphes et deux fractions ; faux positif de diversité possible avec noms nouveaux. Phase snapshot et délégation échouent avant examen conceptuel. Confiance élevée sur le périmètre et les livrables ; propriétés non testées restent inconnues. [E2450](#e2450)

#### qual-20261006-exploratory-difficile-a5-local

Executor=local, dispatch exit=0. Capture 2026-10-06T10:48:04.246Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E2451](#e2451), [E2452](#e2452), [E2453](#e2453)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"replicaBudget":1,"tokensPerReplica":150000}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-exploratory-difficile-a5-local_1_0b97f47865d7** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-exploratory-difficile-a5-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2454](#e2454), [E3005](#e3005)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2454](#e2454), [E2455](#e2455)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-exploratory-difficile-a5-local_1_0b97f47865d7' has no workspace delegation from orchestrator 'qual-20261006-exploratory-difficile-a5-local'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E2458](#e2458), [E2454](#e2454), [E2455](#e2455)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/14/attempts/0/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-exploratory-difficile-a5-local_2_1d79e67ec3bc** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-exploratory-difficile-a5-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2459](#e2459), [E3006](#e3006)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2459](#e2459), [E2460](#e2460)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-exploratory-difficile-a5-local_2_1d79e67ec3bc' has no workspace delegation from orchestrator 'qual-20261006-exploratory-difficile-a5-local'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E2463](#e2463), [E2459](#e2459), [E2460](#e2460)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/14/attempts/0/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-exploratory-difficile-a5-local_3_b3526a3aea42** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-exploratory-difficile-a5-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2464](#e2464), [E3007](#e3007)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2464](#e2464), [E2465](#e2465)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-exploratory-difficile-a5-local_3_b3526a3aea42' has no workspace delegation from orchestrator 'qual-20261006-exploratory-difficile-a5-local'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E2468](#e2468), [E2464](#e2464), [E2465](#e2465)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/14/attempts/0/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-exploratory-difficile-a6-codex

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:04.911Z: escalated; DB actuelle=escalated, motif=Trinity mission timed out: qual-20261006-exploratory-difficile-a6-codex. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E2469](#e2469), [E2470](#e2470), [E2471](#e2471)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"replicaBudget":1,"tokensPerReplica":150000}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-exploratory-difficile-a6-codex_1_e72753913d87** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-exploratory-difficile-a6-codex, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2472](#e2472), [E3008](#e3008)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2472](#e2472), [E2473](#e2473)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:33:15 STRATEGY_GUARDRAIL_BLOCKED Phase 'snapshot' gate failed: ENOENT: no such file or directory, mkdtemp 'D:\GenOS-Trinity-qualification-20261006-01a1109a\jury-exploratory\capsules\qual-20261006-exploratory-difficile-a6-codex\worker_qual-20261006-exploratory-difficile-a6-codex_1_e72753913d87_run_1791282779397\.genos\workspace-snapshots\.snapshot-19f25d2062ee-XXXXXX'. ; guardrail persisté=Phase 'snapshot' gate failed: ENOENT: no such file or directory, mkdtemp 'D:\GenOS-Trinity-qualification-20261006-01a1109a\jury-exploratory\capsules\qual-20261006-exploratory-difficile-a6-codex\worker_qual-20261006-exploratory-difficile-a6-codex_1_e72753913d87_run_1791282779397\.genos\workspace-snapshots\.snapshot-19f25d2062ee-XXXXXX'.. Cascade=STRATEGY_GUARDRAIL_BLOCKED→AGENT_RUNTIME_HALT_REQUESTED→RUNTIME_EVENT_PROCESSING_FAILED→RUNTIME_EVENT_PROCESSING_FAILED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E2491](#e2491), [E2492](#e2492), [E2472](#e2472), [E2473](#e2473)
  Receipts=92beb153-ae2d-517a-85d0-db15dfa65eb8 blocked verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/14/attempts/1/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-exploratory-difficile-a6-codex_2_9cfaa5d3ada1** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-exploratory-difficile-a6-codex, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2496](#e2496), [E3009](#e3009)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2496](#e2496), [E2497](#e2497)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:33:16 STRATEGY_GUARDRAIL_BLOCKED Phase 'snapshot' gate failed: ENOENT: no such file or directory, mkdtemp 'D:\GenOS-Trinity-qualification-20261006-01a1109a\jury-exploratory\capsules\qual-20261006-exploratory-difficile-a6-codex\worker_qual-20261006-exploratory-difficile-a6-codex_2_9cfaa5d3ada1_run_1791282779669\.genos\workspace-snapshots\.snapshot-19f25d2062ee-XXXXXX'. ; guardrail persisté=Phase 'snapshot' gate failed: ENOENT: no such file or directory, mkdtemp 'D:\GenOS-Trinity-qualification-20261006-01a1109a\jury-exploratory\capsules\qual-20261006-exploratory-difficile-a6-codex\worker_qual-20261006-exploratory-difficile-a6-codex_2_9cfaa5d3ada1_run_1791282779669\.genos\workspace-snapshots\.snapshot-19f25d2062ee-XXXXXX'.. Cascade=STRATEGY_GUARDRAIL_BLOCKED→AGENT_RUNTIME_HALT_REQUESTED→RUNTIME_EVENT_PROCESSING_FAILED→RUNTIME_EVENT_PROCESSING_FAILED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E2515](#e2515), [E2516](#e2516), [E2496](#e2496), [E2497](#e2497)
  Receipts=2e3cc607-33d7-5abf-8ca6-a5145f4e23ae blocked verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/14/attempts/1/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-exploratory-difficile-a6-codex_3_4690d098df3b** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-exploratory-difficile-a6-codex, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2520](#e2520), [E3010](#e3010)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2520](#e2520), [E2521](#e2521)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:33:17 STRATEGY_GUARDRAIL_BLOCKED Phase 'snapshot' gate failed: ENOENT: no such file or directory, mkdtemp 'D:\GenOS-Trinity-qualification-20261006-01a1109a\jury-exploratory\capsules\qual-20261006-exploratory-difficile-a6-codex\worker_qual-20261006-exploratory-difficile-a6-codex_3_4690d098df3b_run_1791282780296\.genos\workspace-snapshots\.snapshot-19f25d2062ee-XXXXXX'. ; guardrail persisté=Phase 'snapshot' gate failed: ENOENT: no such file or directory, mkdtemp 'D:\GenOS-Trinity-qualification-20261006-01a1109a\jury-exploratory\capsules\qual-20261006-exploratory-difficile-a6-codex\worker_qual-20261006-exploratory-difficile-a6-codex_3_4690d098df3b_run_1791282780296\.genos\workspace-snapshots\.snapshot-19f25d2062ee-XXXXXX'.. Cascade=STRATEGY_GUARDRAIL_BLOCKED→AGENT_RUNTIME_HALT_REQUESTED→RUNTIME_EVENT_PROCESSING_FAILED→RUNTIME_EVENT_PROCESSING_FAILED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E2539](#e2539), [E2540](#e2540), [E2520](#e2520), [E2521](#e2521)
  Receipts=c0a263ba-94c6-5911-810e-498f8707e8b7 blocked verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/14/attempts/1/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-exploratory-difficile-a6-local

Executor=local, dispatch exit=0. Capture 2026-10-06T10:48:05.440Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E2544](#e2544), [E2545](#e2545), [E2546](#e2546)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"replicaBudget":1,"tokensPerReplica":150000}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-exploratory-difficile-a6-local_1_767baa0ccd99** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-exploratory-difficile-a6-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2547](#e2547), [E3011](#e3011)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2547](#e2547), [E2548](#e2548)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:25:54 AGENT_FAILED Omega native graph blocked: tool_missing ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E2556](#e2556), [E2547](#e2547), [E2548](#e2548)
  Receipts=7789b840-5bab-53f8-889d-358c9b65f0e0 failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/14/attempts/2/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-exploratory-difficile-a6-local_2_fd02649b2318** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-exploratory-difficile-a6-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2557](#e2557), [E3012](#e3012)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2557](#e2557), [E2558](#e2558)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:25:54 AGENT_FAILED Omega native graph blocked: tool_missing ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E2566](#e2566), [E2557](#e2557), [E2558](#e2558)
  Receipts=d1df8afe-3c40-5701-89b5-0adf3b6b7d29 failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/14/attempts/2/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-exploratory-difficile-a6-local_3_44da8700b0bd** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-exploratory-difficile-a6-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2567](#e2567), [E3013](#e3013)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2567](#e2567), [E2568](#e2568)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:25:55 AGENT_FAILED Omega native graph blocked: tool_missing ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E2576](#e2576), [E2567](#e2567), [E2568](#e2568)
  Receipts=4ada7179-235a-57f0-892b-1d8e4cb68435 failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/14/attempts/2/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

### exploratory-tres-complexe

Mission originale : « Concevoir de nouvelles architectures de coordination pour une population de 100 agents sans imposer de hiérarchie centrale, sans utiliser simplement une blockchain et sans reproduire directement swarm/blackboard/market. Explore plusieurs niches comportementales, mesure explicitement la différence structurelle entre solutions, écarte les pseudo-nouveautés superficielles et conserve un ensemble Quality-Diversity plutôt qu'un unique gagnant. » [E2577](#e2577)

Trois familles décrites par monde, mais aucun réseau/population de100 agents, horloge ou conservation globale exécutés. Le replayPopulation du monde2 répète100automates indépendants : ce n’est pas coordination. Tous les vecteurs [0,0] rendent QD aveugle aux différences, archives locales seulement. Confiance élevée sur le périmètre et les livrables ; propriétés non testées restent inconnues. [E2578](#e2578)

#### qual-20261006-exploratory-tres-complexe-a5-local

Executor=local, dispatch exit=0. Capture 2026-10-06T10:48:14.935Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E2579](#e2579), [E2580](#e2580), [E2581](#e2581)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"replicaBudget":1,"tokensPerReplica":150000}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-exploratory-tres-complexe-a5-local_1_f7a4ba8fcd33** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-exploratory-tres-complexe-a5-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2582](#e2582), [E3014](#e3014)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2582](#e2582), [E2583](#e2583)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-exploratory-tres-complexe-a5-local_1_f7a4ba8fcd33' has no workspace delegation from orchestrator 'qual-20261006-exploratory-tres-complexe-a5-local'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E2586](#e2586), [E2582](#e2582), [E2583](#e2583)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/15/attempts/0/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-exploratory-tres-complexe-a5-local_2_96ba90ebc265** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-exploratory-tres-complexe-a5-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2587](#e2587), [E3015](#e3015)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2587](#e2587), [E2588](#e2588)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-exploratory-tres-complexe-a5-local_2_96ba90ebc265' has no workspace delegation from orchestrator 'qual-20261006-exploratory-tres-complexe-a5-local'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E2591](#e2591), [E2587](#e2587), [E2588](#e2588)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/15/attempts/0/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-exploratory-tres-complexe-a5-local_3_fec7cf309957** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-exploratory-tres-complexe-a5-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2592](#e2592), [E3016](#e3016)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2592](#e2592), [E2593](#e2593)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=ligne1 log Error: Worker 'worker_qual-20261006-exploratory-tres-complexe-a5-local_3_fec7cf309957' has no workspace delegation from orchestrator 'qual-20261006-exploratory-tres-complexe-a5-local'. ; guardrail persisté=absent. Cascade=non capturée. Ordre observable, cause racine inconnue si traces insuffisantes. [E2596](#e2596), [E2592](#e2592), [E2593](#e2593)
  Receipts=aucun ; bindings=0, runs=0, commandes capturées=0. Copie exacte audit.json#/cases/15/attempts/0/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-exploratory-tres-complexe-a6-local

Executor=local, dispatch exit=0. Capture 2026-10-06T10:48:15.542Z: escalated; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E2597](#e2597), [E2598](#e2598), [E2599](#e2599)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"replicaBudget":1,"tokensPerReplica":150000}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-exploratory-tres-complexe-a6-local_1_97d17f72f64b** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-exploratory-tres-complexe-a6-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2600](#e2600), [E3017](#e3017)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2600](#e2600), [E2601](#e2601)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:26:15 AGENT_FAILED Omega native graph blocked: tool_missing ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E2609](#e2609), [E2600](#e2600), [E2601](#e2601)
  Receipts=45a3d618-baef-5b34-883c-ebe0243b1045 failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/15/attempts/1/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-exploratory-tres-complexe-a6-local_2_68e2649ba6b3** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-exploratory-tres-complexe-a6-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2610](#e2610), [E3018](#e3018)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2610](#e2610), [E2611](#e2611)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:26:15 AGENT_FAILED Omega native graph blocked: tool_missing ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E2619](#e2619), [E2610](#e2610), [E2611](#e2611)
  Receipts=8353d313-d7e4-509a-8fd9-0285c7950825 failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/15/attempts/1/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-exploratory-tres-complexe-a6-local_3_0db08659c1d7** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-exploratory-tres-complexe-a6-local, relation=independent, maxTokens=8000. Capturé=error/PIDnull; actuel=error/PIDnull. [E2620](#e2620), [E3019](#e3019)
  Artefact historique=pas de PASS, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=1, contrôles intacts=true. [E2620](#e2620), [E2621](#e2621)
  Relecture : Aucun answer/solution disponible ; aucune qualité de réponse attribuée. Rejet runtime distinct de réponse mathématiquement fausse. Confiance : élevée sur absence capturée.
  Dernier report JSON parsable=false; champs=narration/absent.
  Première défaillance observée=2026-10-06 10:26:15 AGENT_FAILED Omega native graph blocked: tool_missing ; guardrail persisté=absent. Cascade=AGENT_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E2629](#e2629), [E2620](#e2620), [E2621](#e2621)
  Receipts=8c508ed0-c2be-5368-8cc8-490b5fcfbd7a failed verified=false ; bindings=1, runs=1, commandes capturées=0. Copie exacte audit.json#/cases/15/attempts/1/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

#### qual-20261006-exploratory-tres-complexe-a8-codex

Executor=codex, dispatch exit=0. Capture 2026-10-06T10:48:16.359Z: sealed_running; DB actuelle=escalated, motif=TRINITY_WORLD_EXECUTION_INCOMPLETE. Journal=0, calibration=0. Chemins distincts=true, snapshot commun=true. [E2630](#e2630), [E2631](#e2631), [E2632](#e2632)

Budget demandé={"tokens":600000,"events":180,"latencyMs":480000,"costUsd":6} ; config variant={"replicaBudget":1,"tokensPerReplica":150000}. Valeurs demandées distinctes du budget effectivement lié.

- **Monde 1: worker_qual-20261006-exploratory-tres-complexe-a8-codex_1_4d9192c2dead** — chambre=direct, rôle=basic_implementation, kind=bounded_worker, type=GenOS. Parent=qual-20261006-exploratory-tres-complexe-a8-codex, relation=independent, maxTokens=8000. Capturé=idle/PIDnull; actuel=error/PIDnull. [E2633](#e2633), [E3020](#e3020)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E2633](#e2633), [E2634](#e2634), [E2718](#e2718), [E2720](#e2720), [E2684](#e2684)
  Relecture : Calendrier/droits/compensation : distinctions conceptuelles, composition de techniques connues, nouveauté non certifiée. solution.cjs est un générateur de answer et un replay ; aucune population. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées.
  Dernier report JSON parsable=true; champs=outcome, claims, evidence, scopeCompletion. [E2684](#e2684)
  Première défaillance observée=2026-10-06 10:42:59 BUDGET_EXHAUSTED tokens budget exhausted during execution (124944 > 8000). ; guardrail persisté=tokens budget exhausted during execution (124944 > 8000).. Cascade=BUDGET_EXHAUSTED→STRATEGY_GUARDRAIL_BLOCKED→AGENT_RUNTIME_HALT_REQUESTED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E2695](#e2695), [E2696](#e2696), [E2633](#e2633), [E2634](#e2634)
  Receipts=e7377986-04c6-5c22-80b9-35e15242805e blocked verified=false ; bindings=1, runs=1, commandes capturées=7. Copie exacte audit.json#/cases/15/attempts/2/worlds/0, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 2: worker_qual-20261006-exploratory-tres-complexe-a8-codex_2_2aacbd359632** — chambre=structured, rôle=interview_plan_implementation, kind=specialist, type=GenOS. Parent=qual-20261006-exploratory-tres-complexe-a8-codex, relation=independent, maxTokens=8000. Capturé=blocked/PIDnull; actuel=blocked/PIDnull. [E2722](#e2722), [E3021](#e3021)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E2722](#e2722), [E2723](#e2723), [E2806](#e2806), [E2808](#e2808), [E2773](#e2773)
  Relecture : Créneaux/droits/domaines : replayPopulation exige100séquences mais ne les fait pas interagir. Contraintes préconfigurées et chronométrage non exécutés ; limitations honnêtes. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées.
  Dernier report JSON parsable=false; champs=narration/absent. [E2773](#e2773)
  Première défaillance observée=2026-10-06 10:42:50 BUDGET_EXHAUSTED tokens budget exhausted during execution (124948 > 8000). ; guardrail persisté=tokens budget exhausted during execution (124948 > 8000).. Cascade=BUDGET_EXHAUSTED→AGENT_HALTED→STRATEGY_GUARDRAIL_BLOCKED→AGENT_RUNTIME_HALT_REQUESTED→RUNTIME_EVENT_PROCESSING_FAILED→AGENT_HALTED→RUNTIME_EVENT_PROCESSING_FAILED. Ordre observable, cause racine inconnue si traces insuffisantes. [E2784](#e2784), [E2785](#e2785), [E2722](#e2722), [E2723](#e2723)
  Receipts=7f9157b7-4975-543f-80aa-1d3ef2bb05bd blocked verified=false ; bindings=1, runs=1, commandes capturées=7. Copie exacte audit.json#/cases/15/attempts/2/worlds/1, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

- **Monde 3: worker_qual-20261006-exploratory-tres-complexe-a8-codex_3_cdc447466658** — chambre=falsification, rôle=self_correcting_implementation, kind=adaptive_worker, type=GenOS. Parent=qual-20261006-exploratory-tres-complexe-a8-codex, relation=independent, maxTokens=8000. Capturé=idle/PIDnull; actuel=error/PIDnull. [E2810](#e2810), [E3022](#e3022)
  Artefact historique=PASS protégé, tardif sans replay=false, worker runtime valide=false, promotion=false. exit=0, contrôles intacts=true. [E2810](#e2810), [E2811](#e2811), [E2881](#e2881), [E2883](#e2883), [E2846](#e2846)
  Relecture : Partition/calendrier/réparation idempotente : différences de graphes et hypothèses explicites. Réparation peut dupliquer le travail, settled ne signifie pas réussite globale. ArchiveQD dans le texte, pas archive runtime. Confiance : élevée sur texte/code ; limitée aux propriétés non exécutées. Réserves : budgetStatus ignore ou contredit les plafonds request et worker ; non mesuré ne signifie pas illimité.
  Dernier report JSON parsable=false; champs=narration/absent. [E2846](#e2846)
  Première défaillance observée=2026-10-06 10:42:36 AGENT_RUNTIME_HALT_REQUESTED Runtime halted: Swarm Sentinel detected infinite cognitive repetition / deadlock. ; guardrail persisté=Runtime halted by deadlock_collapse: Cyclic deadlock detected: periodic loop of length 3 detected.. Cascade=AGENT_RUNTIME_HALT_REQUESTED→AGENT_HALTED. Ordre observable, cause racine inconnue si traces insuffisantes. [E2860](#e2860), [E2861](#e2861), [E2810](#e2810), [E2811](#e2811)
  Receipts=782567e6-19bd-5386-8e29-1f055117c0bd blocked verified=false ; bindings=1, runs=1, commandes capturées=6. Copie exacte audit.json#/cases/15/attempts/2/worlds/2, SHA-256 6a320ef528bed305121c17730e998b1bdb4f1f71548dc0e2817667f67ef0927f.

## Améliorations et critères d’acceptation

### jury

- **P0** Tester admission factuelle avant toute notation et produire deux votes anonymisés de modèles distincts, abstention possible, avec coûts réels et autorité none. Critère : Un dossier faux exclu, deux appels/votes corrélés aux anonymes, aucune provenance dans dossier, score clair et gate finale indépendante.
- **P1** Séparer clarté humaine, preuve logique et test algorithmique ; renforcer doublons et ACK. Critère : Rejeter index positif incorrect pour doublon ; trace durable/commit/ACK ordonnée ; jury estime clarté uniquement sur survivants.

### exploratory

- **P0** Vérifier toutes interdictions originales, conserver texte intégral et couverture exigence par exigence. Critère : Le dossier onglets/recherche a3 doit être rejeté ; espace/liens/tâche passe la revue des interdictions.
- **P1** Choisir des descripteurs discriminants par mission et calculés indépendamment ; réplique vers niche réellement absente. Critère : Au moins deux niches mesurées depuis propriétés observées, worker de réplique distinct, niche atteinte recalculée ; pas simple changement de family.
- **P1** Définir les propriétés collectives et physiques comme campagnes séparées. Critère : 100 agents avec interactions/pannes et invariants partagés réellement simulés ; papier avec essais physiques et échecs, ou statut conceptuel explicite.

### recursive

- **P0** Protocole de sous-problème, childMissionId, parent/snapshot/conditions de reprise, budget et résultat vérifié. Critère : Cas difficile ne reprend qu’après une sous-Trinity indépendante traceable ; contrôle causal de dépendance parent/enfant et preuve de provenance.
- **P1** Séparer calcul récursif local, DP et récursion organisationnelle ; sélectionner un cas où un sous-problème est nécessaire. Critère : Cas100! correctement reste sans enfant ; cas important crée enfant, plafond profondeur, détection cycle et test reprise contrôlés.

### adaptive

- **P0** Créer reçus indépendants pour les obligations avant estimation d’incertitude ; comptabiliser requested/granted/consumed pour trois workers et continuations. Critère : Incertitude inconnue refusée ; budget total jamais dépassé ; minimum équitable, justification et événements distincts de code local.
- **P1** Comparaison uniforme exécutée sur mêmes instances, budgets et seeds. Critère : Rapport différence mesurée et incertitude, aucun contrefactuel probable présenté comme expérience.

### common

- **P0** Instrumenter binding avec requestedMissionId, candidateIds/status et motif none/multiple ; réconcilier états PID/receipts/superviseur. Critère : Zéro ambiguïté trompeuse ; erreur première visible ; aucune expérience sealed_running sans worker actif au-delà du délai de réconciliation.
- **P0** Corriger comptabilité avant toute hausse de budget ; inclure contexte/cached/output/exact-estimated/coût indisponible. Critère : Mêmes consommations dans événements, strategy metrics et receipt ; missing reste unknown, pas0 ; gardes toujours actives.
- **P1** Persister rôle scientifique, kind, recette et capacités exécutées ; éviter domaine littérature pour architecture distribuée. Critère : Jury difficile reçoit software architecture, pas creative_worker littéraire ; interview réelle ou planned sans interview déclaré.

Recommandations fondées sur F1–F12 et les missions, pas des corrections exécutées. Confiance élevée sur besoin de couverture/instrumentation, mise en œuvre à tester. [E0](#e0), [E2280](#e2280), [E2232](#e2232), [E2233](#e2233), [E2280](#e2280), [E2414](#e2414), [E2893](#e2893), [E0](#e0), [E2885](#e2885), [E2886](#e2886), [E117](#e117), [E528](#e528), [E2083](#e2083), [E2887](#e2887), [E1638](#e1638), [E1646](#e1646), [E1654](#e1654), [E2892](#e2892), [E93](#e93), [E174](#e174), [E2155](#e2155), [E2891](#e2891), [E2203](#e2203), [E2890](#e2890), [E2888](#e2888), [E2889](#e2889), [E644](#e644), [E711](#e711), [E0](#e0)

## Corrections de l’ancien bilan

Exploratory moyen totalise2 PASS sur2 tentatives, mais a3monde1 viole la mission. a6monde1 répond conceptuellement. Sealed_running sansPID était une capture, pas une réussite : aujourd’hui43 escalated. Ne pas confondre budgets, tool_missing, snapshots, délégation, SQLITE_FULL et binding. Trois succès mathématiques recursive ne valident pas une sous-Trinity. Archives déclaratives et tests adaptive locaux ne prouvent pas activation runtime. [E2280](#e2280), [E2414](#e2414), [E0](#e0)

## Catalogue des sources citées

<a id="e0"></a> **E0** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/publication.json) ; pointer / ; SHA-256 aa40800da510d55281a30a97aeaf1bb4cd8e9454c625835e8c5ff7b66b9651c8.

<a id="e2280"></a> **E2280** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a3/world-1-answer.json) ; pointer / ; SHA-256 33246e0bf43d95015cdcfb0843901971c4bebac92d8f31d23078ffb4e6c72d09.

<a id="e2232"></a> **E2232** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/scripts/missions.json) ; pointer /missions/45/mission ; SHA-256 5943ddd0760a9636f8dad6e7395adb2ce9afecf02603abcdc7d2c8019bbd163f.

<a id="e2233"></a> **E2233** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/sources/exploratory-moyen/verify.cjs) ; pointer / ; ligne 1 ; SHA-256 1dfccad8043303bae8ded5fcdbeff5156d30c5889593ea633568c594269594ee.

<a id="e2414"></a> **E2414** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-codex/world-1-answer.json) ; pointer / ; SHA-256 9e97006a93099efbee662786735a152733faeda271efd7de67316d6c81de2aa4.

<a id="e2893"></a> **E2893** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/rapport-jury-exploratory.json) ; pointer /results/13 ; SHA-256 06f8fe65d3e11c28956995abb285cd89b4040f0f83bff08025e7c12fa018e1ef.

<a id="e2885"></a> **E2885** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/runtime/backend/bin/trinity-supervisor.cjs) ; pointer / ; ligne 101 ; SHA-256 8050207dfa07d55e0ec035fffa5fd92449af74604ef9ffcd3546e266945e617f.

<a id="e2886"></a> **E2886** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/runtime/backend/bin/agent-runtime-events.cjs) ; pointer / ; ligne 57 ; SHA-256 58312590af828fe901899a515f6d7e9f3472fc8399aaf44f6219da5f01ae2fe3.

<a id="e117"></a> **E117** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a3/evidence.json) ; pointer /tables/telemetry_events/36 ; SHA-256 55e1d8da8896ad030511eaa227708cf63b82aa25ba06f2c33426dd36d6fd43a0.

<a id="e528"></a> **E528** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a4/evidence.json) ; pointer /tables/telemetry_events/104 ; SHA-256 d7fff9f7d2c89f0a54737f6be20bb382c5b2929f42705910ea1e77dbce992f47.

<a id="e2083"></a> **E2083** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a4/evidence.json) ; pointer /tables/telemetry_events/97 ; SHA-256 ff2eca562b6907ef81e03770bac07587d6f3be7405da4ad692630dd36dcd9591.

<a id="e2887"></a> **E2887** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/runtime/backend/src/services/biologicalWorkerStore.js) ; pointer / ; ligne 38 ; SHA-256 0f6b43ab8d8b67d502b0e0b734f65b2f45b2fc5e4fbc0bef9c6d22e4cf192569.

<a id="e1638"></a> **E1638** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-adaptive-moyen-a1_1_ae50b0a8a4ae.log) ; pointer / ; ligne 11 ; SHA-256 e6e895a46475dc40bc5e7ec0d25a0b0cb6d256c96c694732bc6187596a215b3e.

<a id="e1646"></a> **E1646** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-adaptive-moyen-a1_2_891a636a206e.log) ; pointer / ; ligne 10 ; SHA-256 80fd96e5d9d73650dcfe302b1cd8dc69dd8e02bbe56fa1ddce4f30ffac703a85.

<a id="e1654"></a> **E1654** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-adaptive-moyen-a1_3_36aa03da16ea.log) ; pointer / ; ligne 10 ; SHA-256 80fd96e5d9d73650dcfe302b1cd8dc69dd8e02bbe56fa1ddce4f30ffac703a85.

<a id="e2892"></a> **E2892** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/runtime/backend/src/services/search/naturalSearchRuntime.js) ; pointer / ; ligne 144 ; SHA-256 6764304c44e793ac05a9ed9cf52b39396ef3bac87ebe33202f18d01cf6154de9.

<a id="e93"></a> **E93** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a3/evidence.json) ; pointer /tables/telemetry_events/15 ; SHA-256 55e1d8da8896ad030511eaa227708cf63b82aa25ba06f2c33426dd36d6fd43a0.

<a id="e174"></a> **E174** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a4/evidence.json) ; pointer /tables/telemetry_events/25 ; SHA-256 5b5dd2c601775b714b3cfddc48c7048beb6f8c486d38268c3fdd4d22b7ce70b5.

<a id="e2155"></a> **E2155** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a4/evidence.json) ; pointer /tables/telemetry_events/162 ; SHA-256 ff2eca562b6907ef81e03770bac07587d6f3be7405da4ad692630dd36dcd9591.

<a id="e2891"></a> **E2891** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/runtime/backend/src/services/agentRuntimeAdapter/missionPlanning.js) ; pointer / ; ligne 146 ; SHA-256 714be133d6ddfd6aaba74ed8872130859ca8d05b4271a53ef2927fc2e1db2d6e.

<a id="e2203"></a> **E2203** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a6-local/evidence.json) ; pointer / ; SHA-256 b371da4bf44dfff613afd9ec8047fb4b57f11ba96c3b8052233a8c482f758954.

<a id="e2890"></a> **E2890** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/runtime/backend/src/services/topologyNCEService.js) ; pointer / ; ligne 14 ; SHA-256 29e9a472812cea6fdedcaca707ad6988c30e8d71bed833fc5355023559b78f54.

<a id="e2888"></a> **E2888** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/runtime/backend/src/services/trinityComparisonRuntime.js) ; pointer / ; ligne 27 ; SHA-256 d83da54488bff27546b05240b6768f2617c87baea1f1eae47a54b3593a932c04.

<a id="e2889"></a> **E2889** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/runtime/backend/src/services/trinityAdaptiveBudgetService.js) ; pointer / ; ligne 6 ; SHA-256 009bb43aa9a3f3c70d6ca89a6ca3c8f3e7f0dd978f69da66b0974b9c7b9a8a88.

<a id="e644"></a> **E644** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/scripts/missions.json) ; pointer /missions/26/mission ; SHA-256 5943ddd0760a9636f8dad6e7395adb2ce9afecf02603abcdc7d2c8019bbd163f.

<a id="e711"></a> **E711** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a7-codex/evidence.json) ; pointer / ; SHA-256 2b323b068732a78bb1f36c396ecbaf8e9c8ba24c4b8d60eb3951c44ebd67757e.

<a id="e2"></a> **E2** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/sources/jury-simple/verify.cjs) ; pointer / ; ligne 1 ; SHA-256 5740466d8be278c8b6f2357f31e1c8c3ef27753f2a83809ec97db92abbc7e6e0.

<a id="e338"></a> **E338** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/sources/jury-moyen/verify.cjs) ; pointer / ; ligne 1 ; SHA-256 b870c571be2d7c7542a5f3a67bb5cd35c0c1b180f44e56c3b0e0463b8c5ad8bf.

<a id="e645"></a> **E645** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/sources/jury-difficile/verify.cjs) ; pointer / ; ligne 1 ; SHA-256 8d8317ddad19d31c92069fe2d888c9a51ba945e3c361c07a615e80c3f670a25c.

<a id="e874"></a> **E874** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/sources/jury-tres-complexe/verify.cjs) ; pointer / ; ligne 1 ; SHA-256 b6db9883a1615fde165a45858b39f253db8f8af71cd9bd2e42fe3d3f8b9d9261.

<a id="e973"></a> **E973** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/sources/recursive-simple/verify.cjs) ; pointer / ; ligne 1 ; SHA-256 1050c3fb7d24a6e9250bcddc13eaa4197502361ff686ec708bfcb04a5b410d8e.

<a id="e1090"></a> **E1090** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/sources/recursive-moyen/verify.cjs) ; pointer / ; ligne 1 ; SHA-256 ad5c9da03ad1b2f122fec1106b4a57e89dd3d5630b848fd1f3cd4c8249c97eee.

<a id="e1253"></a> **E1253** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/sources/recursive-difficile/verify.cjs) ; pointer / ; ligne 1 ; SHA-256 d2103f363942472eb9978ba98be8f8ed175f4c43b7271f72f91f5ff33bf7737c.

<a id="e1417"></a> **E1417** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/sources/recursive-tres-complexe/verify.cjs) ; pointer / ; ligne 1 ; SHA-256 537f056e3c2180df102f7b81a6afe7e823fea7d73e66a08732a260c545fefdc3.

<a id="e1482"></a> **E1482** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/sources/adaptive-simple/verify.cjs) ; pointer / ; ligne 1 ; SHA-256 66ca50f07a4c058f61f0599995403b0145fdbd96efd63ac4803a98bda748be13.

<a id="e1626"></a> **E1626** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/sources/adaptive-moyen/verify.cjs) ; pointer / ; ligne 1 ; SHA-256 de7cf0fd8a9b701e061ce1c4b8881032a02de39487fa8289efabe74ccd142eda.

<a id="e1684"></a> **E1684** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/sources/adaptive-difficile/verify.cjs) ; pointer / ; ligne 1 ; SHA-256 79d078845eaaaecb8fd3809c758ccc79aa49eec05be3ab853167ea911e519489.

<a id="e1775"></a> **E1775** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/sources/adaptive-tres-complexe/verify.cjs) ; pointer / ; ligne 1 ; SHA-256 b1f294953e10b2494638aafe50463cf4d5e38f05cdd739a062c9951183dec4ad.

<a id="e1826"></a> **E1826** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/sources/exploratory-simple/verify.cjs) ; pointer / ; ligne 1 ; SHA-256 1dfccad8043303bae8ded5fcdbeff5156d30c5889593ea633568c594269594ee.

<a id="e2450"></a> **E2450** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/sources/exploratory-difficile/verify.cjs) ; pointer / ; ligne 1 ; SHA-256 1dfccad8043303bae8ded5fcdbeff5156d30c5889593ea633568c594269594ee.

<a id="e2578"></a> **E2578** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/sources/exploratory-tres-complexe/verify.cjs) ; pointer / ; ligne 1 ; SHA-256 1dfccad8043303bae8ded5fcdbeff5156d30c5889593ea633568c594269594ee.

<a id="e1010"></a> **E1010** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-simple-a1/evidence.json) ; pointer /tables/telemetry_events/34 ; SHA-256 7c495c790793600dedd7789fd9c157b53f3c052dcd4eb5de0aac321fcad9b852.

<a id="e1012"></a> **E1012** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-simple-a1/world-1-answer.json) ; pointer / ; SHA-256 4f648088172e22c4c1c96438922055a9828df953a5f29696424d88179c4f74b6.

<a id="e1"></a> **E1** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/scripts/missions.json) ; pointer /missions/24/mission ; SHA-256 5943ddd0760a9636f8dad6e7395adb2ce9afecf02603abcdc7d2c8019bbd163f.

<a id="e3"></a> **E3** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple/request.json) ; pointer / ; SHA-256 b2d85e03077500ec88dd88accf0b2ca2b700881dcec9d48f845ffe2a940c6e24.

<a id="e4"></a> **E4** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple/evidence.json) ; pointer / ; SHA-256 1513cc65799c0a8a1d100e49cab2b9bae787e7b3aa9f1a20b7488a3e79fa983f.

<a id="e5"></a> **E5** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e7"></a> **E7** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 1513cc65799c0a8a1d100e49cab2b9bae787e7b3aa9f1a20b7488a3e79fa983f.

<a id="e2894"></a> **E2894** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple/evidence.json) ; pointer /tables/agents/1 ; SHA-256 1513cc65799c0a8a1d100e49cab2b9bae787e7b3aa9f1a20b7488a3e79fa983f.

<a id="e8"></a> **E8** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple/evidence.json) ; pointer /replays/0 ; SHA-256 1513cc65799c0a8a1d100e49cab2b9bae787e7b3aa9f1a20b7488a3e79fa983f.

<a id="e14"></a> **E14** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-simple_1_b9cd2e2eca4f.log) ; pointer / ; ligne 1 ; SHA-256 112eb4de4640a660d149313b9a010ed1958b5006012eb3c6630b1c30fd387c98.

<a id="e15"></a> **E15** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 1513cc65799c0a8a1d100e49cab2b9bae787e7b3aa9f1a20b7488a3e79fa983f.

<a id="e2895"></a> **E2895** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple/evidence.json) ; pointer /tables/agents/2 ; SHA-256 1513cc65799c0a8a1d100e49cab2b9bae787e7b3aa9f1a20b7488a3e79fa983f.

<a id="e16"></a> **E16** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple/evidence.json) ; pointer /replays/1 ; SHA-256 1513cc65799c0a8a1d100e49cab2b9bae787e7b3aa9f1a20b7488a3e79fa983f.

<a id="e22"></a> **E22** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-simple_2_853b56af3d84.log) ; pointer / ; ligne 1 ; SHA-256 112eb4de4640a660d149313b9a010ed1958b5006012eb3c6630b1c30fd387c98.

<a id="e23"></a> **E23** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 1513cc65799c0a8a1d100e49cab2b9bae787e7b3aa9f1a20b7488a3e79fa983f.

<a id="e2896"></a> **E2896** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple/evidence.json) ; pointer /tables/agents/3 ; SHA-256 1513cc65799c0a8a1d100e49cab2b9bae787e7b3aa9f1a20b7488a3e79fa983f.

<a id="e24"></a> **E24** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple/evidence.json) ; pointer /replays/2 ; SHA-256 1513cc65799c0a8a1d100e49cab2b9bae787e7b3aa9f1a20b7488a3e79fa983f.

<a id="e30"></a> **E30** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-simple_3_7a21776d5251.log) ; pointer / ; ligne 1 ; SHA-256 112eb4de4640a660d149313b9a010ed1958b5006012eb3c6630b1c30fd387c98.

<a id="e31"></a> **E31** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a2/request.json) ; pointer / ; SHA-256 6d37a5c44ab04119df8328e5521ae11b486a0b62b339681c1fff807c0686f166.

<a id="e32"></a> **E32** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a2/evidence.json) ; pointer / ; SHA-256 1c1d373adb560b2558afb783501f8cbc90e0028803224a640c103f2ba4bd40b1.

<a id="e33"></a> **E33** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a2/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e34"></a> **E34** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a2/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 1c1d373adb560b2558afb783501f8cbc90e0028803224a640c103f2ba4bd40b1.

<a id="e2897"></a> **E2897** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a2/evidence.json) ; pointer /tables/agents/1 ; SHA-256 1c1d373adb560b2558afb783501f8cbc90e0028803224a640c103f2ba4bd40b1.

<a id="e35"></a> **E35** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a2/evidence.json) ; pointer /replays/0 ; SHA-256 1c1d373adb560b2558afb783501f8cbc90e0028803224a640c103f2ba4bd40b1.

<a id="e54"></a> **E54** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a2/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 1c1d373adb560b2558afb783501f8cbc90e0028803224a640c103f2ba4bd40b1.

<a id="e2898"></a> **E2898** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a2/evidence.json) ; pointer /tables/agents/2 ; SHA-256 1c1d373adb560b2558afb783501f8cbc90e0028803224a640c103f2ba4bd40b1.

<a id="e55"></a> **E55** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a2/evidence.json) ; pointer /replays/1 ; SHA-256 1c1d373adb560b2558afb783501f8cbc90e0028803224a640c103f2ba4bd40b1.

<a id="e64"></a> **E64** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a2/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 1c1d373adb560b2558afb783501f8cbc90e0028803224a640c103f2ba4bd40b1.

<a id="e2899"></a> **E2899** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a2/evidence.json) ; pointer /tables/agents/3 ; SHA-256 1c1d373adb560b2558afb783501f8cbc90e0028803224a640c103f2ba4bd40b1.

<a id="e65"></a> **E65** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a2/evidence.json) ; pointer /replays/2 ; SHA-256 1c1d373adb560b2558afb783501f8cbc90e0028803224a640c103f2ba4bd40b1.

<a id="e77"></a> **E77** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a3/request.json) ; pointer / ; SHA-256 4e64ce8d11dedc3433b8cedd20cb484668d48c9200632ec6b81192a770c671ec.

<a id="e78"></a> **E78** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a3/evidence.json) ; pointer / ; SHA-256 55e1d8da8896ad030511eaa227708cf63b82aa25ba06f2c33426dd36d6fd43a0.

<a id="e79"></a> **E79** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a3/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e80"></a> **E80** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a3/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 55e1d8da8896ad030511eaa227708cf63b82aa25ba06f2c33426dd36d6fd43a0.

<a id="e2900"></a> **E2900** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a3/evidence.json) ; pointer /tables/agents/1 ; SHA-256 55e1d8da8896ad030511eaa227708cf63b82aa25ba06f2c33426dd36d6fd43a0.

<a id="e81"></a> **E81** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a3/evidence.json) ; pointer /replays/0 ; SHA-256 55e1d8da8896ad030511eaa227708cf63b82aa25ba06f2c33426dd36d6fd43a0.

<a id="e97"></a> **E97** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a3/evidence.json) ; pointer /tables/telemetry_events/19 ; SHA-256 55e1d8da8896ad030511eaa227708cf63b82aa25ba06f2c33426dd36d6fd43a0.

<a id="e99"></a> **E99** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a3/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 55e1d8da8896ad030511eaa227708cf63b82aa25ba06f2c33426dd36d6fd43a0.

<a id="e2901"></a> **E2901** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a3/evidence.json) ; pointer /tables/agents/2 ; SHA-256 55e1d8da8896ad030511eaa227708cf63b82aa25ba06f2c33426dd36d6fd43a0.

<a id="e100"></a> **E100** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a3/evidence.json) ; pointer /replays/1 ; SHA-256 55e1d8da8896ad030511eaa227708cf63b82aa25ba06f2c33426dd36d6fd43a0.

<a id="e116"></a> **E116** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a3/evidence.json) ; pointer /tables/telemetry_events/35 ; SHA-256 55e1d8da8896ad030511eaa227708cf63b82aa25ba06f2c33426dd36d6fd43a0.

<a id="e127"></a> **E127** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-simple-a3_2_55c8902c936c.log) ; pointer / ; ligne 649 ; SHA-256 a8e0cae5660e2dcc4708cbd19e1fc31a6f0bbd36147275cbc8e168054a82fb85.

<a id="e128"></a> **E128** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a3/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 55e1d8da8896ad030511eaa227708cf63b82aa25ba06f2c33426dd36d6fd43a0.

<a id="e2902"></a> **E2902** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a3/evidence.json) ; pointer /tables/agents/3 ; SHA-256 55e1d8da8896ad030511eaa227708cf63b82aa25ba06f2c33426dd36d6fd43a0.

<a id="e129"></a> **E129** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a3/evidence.json) ; pointer /replays/2 ; SHA-256 55e1d8da8896ad030511eaa227708cf63b82aa25ba06f2c33426dd36d6fd43a0.

<a id="e145"></a> **E145** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a3/evidence.json) ; pointer /tables/telemetry_events/60 ; SHA-256 55e1d8da8896ad030511eaa227708cf63b82aa25ba06f2c33426dd36d6fd43a0.

<a id="e147"></a> **E147** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a4/request.json) ; pointer / ; SHA-256 871e3c16f0c47f61124b933332af69a6c9f1902b95ed6854c66a3071a31563a7.

<a id="e148"></a> **E148** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a4/evidence.json) ; pointer / ; SHA-256 5b5dd2c601775b714b3cfddc48c7048beb6f8c486d38268c3fdd4d22b7ce70b5.

<a id="e149"></a> **E149** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a4/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e150"></a> **E150** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a4/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 5b5dd2c601775b714b3cfddc48c7048beb6f8c486d38268c3fdd4d22b7ce70b5.

<a id="e2903"></a> **E2903** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a4/evidence.json) ; pointer /tables/agents/1 ; SHA-256 5b5dd2c601775b714b3cfddc48c7048beb6f8c486d38268c3fdd4d22b7ce70b5.

<a id="e151"></a> **E151** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a4/evidence.json) ; pointer /replays/0 ; SHA-256 5b5dd2c601775b714b3cfddc48c7048beb6f8c486d38268c3fdd4d22b7ce70b5.

<a id="e196"></a> **E196** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a4/world-1-answer.json) ; pointer / ; SHA-256 39d6e27a5731cb023b692d20a6bf1e5b9719eb8c4010b1cd9dc44bb61d0a17b8.

<a id="e198"></a> **E198** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a4/world-1-solution.cjs) ; pointer / ; SHA-256 ea45dd2bc12a39b85e61f6bcf3013b0cb32700d7e35cf2177d352849d50e8dc6.

<a id="e194"></a> **E194** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a4/evidence.json) ; pointer /tables/telemetry_events/45 ; SHA-256 5b5dd2c601775b714b3cfddc48c7048beb6f8c486d38268c3fdd4d22b7ce70b5.

<a id="e200"></a> **E200** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a4/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 5b5dd2c601775b714b3cfddc48c7048beb6f8c486d38268c3fdd4d22b7ce70b5.

<a id="e2904"></a> **E2904** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a4/evidence.json) ; pointer /tables/agents/2 ; SHA-256 5b5dd2c601775b714b3cfddc48c7048beb6f8c486d38268c3fdd4d22b7ce70b5.

<a id="e201"></a> **E201** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a4/evidence.json) ; pointer /replays/1 ; SHA-256 5b5dd2c601775b714b3cfddc48c7048beb6f8c486d38268c3fdd4d22b7ce70b5.

<a id="e238"></a> **E238** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a4/world-2-answer.json) ; pointer / ; SHA-256 5ebb57fe1ed00f1ecb755ee1f398fd7031ce9ec1a15f23ee1486745ee82c9b42.

<a id="e240"></a> **E240** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a4/world-2-solution.cjs) ; pointer / ; SHA-256 71b17caa3866fa579c97cf2451e3881009a15550fff567ff13611161aa69b7f4.

<a id="e236"></a> **E236** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a4/evidence.json) ; pointer /tables/telemetry_events/80 ; SHA-256 5b5dd2c601775b714b3cfddc48c7048beb6f8c486d38268c3fdd4d22b7ce70b5.

<a id="e242"></a> **E242** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a4/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 5b5dd2c601775b714b3cfddc48c7048beb6f8c486d38268c3fdd4d22b7ce70b5.

<a id="e2905"></a> **E2905** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a4/evidence.json) ; pointer /tables/agents/3 ; SHA-256 5b5dd2c601775b714b3cfddc48c7048beb6f8c486d38268c3fdd4d22b7ce70b5.

<a id="e243"></a> **E243** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a4/evidence.json) ; pointer /replays/2 ; SHA-256 5b5dd2c601775b714b3cfddc48c7048beb6f8c486d38268c3fdd4d22b7ce70b5.

<a id="e289"></a> **E289** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a4/world-3-answer.json) ; pointer / ; SHA-256 eb2b31dbd7d50f72094e27b3480cd9c1000e22eb10556209cad2867182206a17.

<a id="e291"></a> **E291** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a4/world-3-solution.cjs) ; pointer / ; SHA-256 a44f2ec66b8ea5430c7d72a37712c28de776fb76d649ba39948d972ca8b98e1c.

<a id="e279"></a> **E279** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a4/evidence.json) ; pointer /tables/telemetry_events/116 ; SHA-256 5b5dd2c601775b714b3cfddc48c7048beb6f8c486d38268c3fdd4d22b7ce70b5.

<a id="e293"></a> **E293** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a5-local/request.json) ; pointer / ; SHA-256 26aa97f233c4e1c359e7f80342a355f366007bc93226a9f8942715749c034cc8.

<a id="e294"></a> **E294** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a5-local/evidence.json) ; pointer / ; SHA-256 b4779bf16af175529d8956d568d2fb7ecb5b66ed24dd5e87ed79c66c796e0932.

<a id="e295"></a> **E295** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a5-local/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e296"></a> **E296** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a5-local/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 b4779bf16af175529d8956d568d2fb7ecb5b66ed24dd5e87ed79c66c796e0932.

<a id="e2906"></a> **E2906** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a5-local/evidence.json) ; pointer /tables/agents/1 ; SHA-256 b4779bf16af175529d8956d568d2fb7ecb5b66ed24dd5e87ed79c66c796e0932.

<a id="e297"></a> **E297** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a5-local/evidence.json) ; pointer /replays/0 ; SHA-256 b4779bf16af175529d8956d568d2fb7ecb5b66ed24dd5e87ed79c66c796e0932.

<a id="e300"></a> **E300** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-simple-a5-local_1_6a1c05491dcc.log) ; pointer / ; ligne 1 ; SHA-256 a10a16aa1c8b97ccab96f48dbb591d168138059336c96ff254afac8735e3e453.

<a id="e301"></a> **E301** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a5-local/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 b4779bf16af175529d8956d568d2fb7ecb5b66ed24dd5e87ed79c66c796e0932.

<a id="e2907"></a> **E2907** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a5-local/evidence.json) ; pointer /tables/agents/2 ; SHA-256 b4779bf16af175529d8956d568d2fb7ecb5b66ed24dd5e87ed79c66c796e0932.

<a id="e302"></a> **E302** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a5-local/evidence.json) ; pointer /replays/1 ; SHA-256 b4779bf16af175529d8956d568d2fb7ecb5b66ed24dd5e87ed79c66c796e0932.

<a id="e305"></a> **E305** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-simple-a5-local_2_279d796d3869.log) ; pointer / ; ligne 1 ; SHA-256 4329811d81f6af39b11fb711760438a76e66586e1c5d140d79efdc5074b9c0b7.

<a id="e306"></a> **E306** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a5-local/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 b4779bf16af175529d8956d568d2fb7ecb5b66ed24dd5e87ed79c66c796e0932.

<a id="e2908"></a> **E2908** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a5-local/evidence.json) ; pointer /tables/agents/3 ; SHA-256 b4779bf16af175529d8956d568d2fb7ecb5b66ed24dd5e87ed79c66c796e0932.

<a id="e307"></a> **E307** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a5-local/evidence.json) ; pointer /replays/2 ; SHA-256 b4779bf16af175529d8956d568d2fb7ecb5b66ed24dd5e87ed79c66c796e0932.

<a id="e310"></a> **E310** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-simple-a5-local_3_38711ddf1e65.log) ; pointer / ; ligne 1 ; SHA-256 408b8c0c3bc743d1681dda26ddc363f1bb98f445fe68a0dabe82d47a77b1cf3c.

<a id="e311"></a> **E311** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a6-local/request.json) ; pointer / ; SHA-256 e35283a28998c368580b64b74572d84990edeaf3b415aa0dafb72588d99d8def.

<a id="e312"></a> **E312** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a6-local/evidence.json) ; pointer / ; SHA-256 bf3595beb77f24f4f21c7c99e8a4f7f31240a7bd6e1e8e7bd52bf5c06bfa6912.

<a id="e313"></a> **E313** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a6-local/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e314"></a> **E314** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a6-local/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 bf3595beb77f24f4f21c7c99e8a4f7f31240a7bd6e1e8e7bd52bf5c06bfa6912.

<a id="e2909"></a> **E2909** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a6-local/evidence.json) ; pointer /tables/agents/1 ; SHA-256 bf3595beb77f24f4f21c7c99e8a4f7f31240a7bd6e1e8e7bd52bf5c06bfa6912.

<a id="e315"></a> **E315** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a6-local/evidence.json) ; pointer /replays/0 ; SHA-256 bf3595beb77f24f4f21c7c99e8a4f7f31240a7bd6e1e8e7bd52bf5c06bfa6912.

<a id="e322"></a> **E322** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a6-local/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 bf3595beb77f24f4f21c7c99e8a4f7f31240a7bd6e1e8e7bd52bf5c06bfa6912.

<a id="e2910"></a> **E2910** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a6-local/evidence.json) ; pointer /tables/agents/2 ; SHA-256 bf3595beb77f24f4f21c7c99e8a4f7f31240a7bd6e1e8e7bd52bf5c06bfa6912.

<a id="e323"></a> **E323** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a6-local/evidence.json) ; pointer /replays/1 ; SHA-256 bf3595beb77f24f4f21c7c99e8a4f7f31240a7bd6e1e8e7bd52bf5c06bfa6912.

<a id="e330"></a> **E330** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a6-local/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 bf3595beb77f24f4f21c7c99e8a4f7f31240a7bd6e1e8e7bd52bf5c06bfa6912.

<a id="e2911"></a> **E2911** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a6-local/evidence.json) ; pointer /tables/agents/3 ; SHA-256 bf3595beb77f24f4f21c7c99e8a4f7f31240a7bd6e1e8e7bd52bf5c06bfa6912.

<a id="e331"></a> **E331** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-simple-a6-local/evidence.json) ; pointer /replays/2 ; SHA-256 bf3595beb77f24f4f21c7c99e8a4f7f31240a7bd6e1e8e7bd52bf5c06bfa6912.

<a id="e337"></a> **E337** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/scripts/missions.json) ; pointer /missions/25/mission ; SHA-256 5943ddd0760a9636f8dad6e7395adb2ce9afecf02603abcdc7d2c8019bbd163f.

<a id="e339"></a> **E339** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a3/request.json) ; pointer / ; SHA-256 307d935c2e297506f9ff6f6465728b9d776bea3c40d9bbad1736995cf311c8f6.

<a id="e340"></a> **E340** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a3/evidence.json) ; pointer / ; SHA-256 d1cacf81094ceb394002bd733025473fc9c4a78c792517a9291921fdc7f69db1.

<a id="e341"></a> **E341** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a3/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e342"></a> **E342** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a3/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 d1cacf81094ceb394002bd733025473fc9c4a78c792517a9291921fdc7f69db1.

<a id="e2912"></a> **E2912** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a3/evidence.json) ; pointer /tables/agents/1 ; SHA-256 d1cacf81094ceb394002bd733025473fc9c4a78c792517a9291921fdc7f69db1.

<a id="e343"></a> **E343** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a3/evidence.json) ; pointer /replays/0 ; SHA-256 d1cacf81094ceb394002bd733025473fc9c4a78c792517a9291921fdc7f69db1.

<a id="e359"></a> **E359** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a3/evidence.json) ; pointer /tables/telemetry_events/20 ; SHA-256 d1cacf81094ceb394002bd733025473fc9c4a78c792517a9291921fdc7f69db1.

<a id="e361"></a> **E361** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a3/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 d1cacf81094ceb394002bd733025473fc9c4a78c792517a9291921fdc7f69db1.

<a id="e2913"></a> **E2913** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a3/evidence.json) ; pointer /tables/agents/2 ; SHA-256 d1cacf81094ceb394002bd733025473fc9c4a78c792517a9291921fdc7f69db1.

<a id="e362"></a> **E362** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a3/evidence.json) ; pointer /replays/1 ; SHA-256 d1cacf81094ceb394002bd733025473fc9c4a78c792517a9291921fdc7f69db1.

<a id="e378"></a> **E378** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a3/evidence.json) ; pointer /tables/telemetry_events/36 ; SHA-256 d1cacf81094ceb394002bd733025473fc9c4a78c792517a9291921fdc7f69db1.

<a id="e387"></a> **E387** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-moyen-a3_2_85a7d1edc8a6.log) ; pointer / ; ligne 613 ; SHA-256 34a7011cef190f745f6ea849a45c50a74342929c7198a7079b4ca3921a74ea47.

<a id="e388"></a> **E388** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a3/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 d1cacf81094ceb394002bd733025473fc9c4a78c792517a9291921fdc7f69db1.

<a id="e2914"></a> **E2914** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a3/evidence.json) ; pointer /tables/agents/3 ; SHA-256 d1cacf81094ceb394002bd733025473fc9c4a78c792517a9291921fdc7f69db1.

<a id="e389"></a> **E389** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a3/evidence.json) ; pointer /replays/2 ; SHA-256 d1cacf81094ceb394002bd733025473fc9c4a78c792517a9291921fdc7f69db1.

<a id="e405"></a> **E405** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a3/evidence.json) ; pointer /tables/telemetry_events/59 ; SHA-256 d1cacf81094ceb394002bd733025473fc9c4a78c792517a9291921fdc7f69db1.

<a id="e416"></a> **E416** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-moyen-a3_3_10c604d1a517.log) ; pointer / ; ligne 622 ; SHA-256 043d675d38e92ff3e97853600e44da5b0a0f8ee6cfc929e0473c2554d08ef6fe.

<a id="e417"></a> **E417** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a4/request.json) ; pointer / ; SHA-256 7bc6ac4ea9360cdf893e9ccd85e79035be86eadbe7f7949b41e4daf907510bce.

<a id="e418"></a> **E418** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a4/evidence.json) ; pointer / ; SHA-256 d7fff9f7d2c89f0a54737f6be20bb382c5b2929f42705910ea1e77dbce992f47.

<a id="e419"></a> **E419** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a4/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e420"></a> **E420** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a4/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 d7fff9f7d2c89f0a54737f6be20bb382c5b2929f42705910ea1e77dbce992f47.

<a id="e2915"></a> **E2915** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a4/evidence.json) ; pointer /tables/agents/1 ; SHA-256 d7fff9f7d2c89f0a54737f6be20bb382c5b2929f42705910ea1e77dbce992f47.

<a id="e421"></a> **E421** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a4/evidence.json) ; pointer /replays/0 ; SHA-256 d7fff9f7d2c89f0a54737f6be20bb382c5b2929f42705910ea1e77dbce992f47.

<a id="e470"></a> **E470** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a4/world-1-answer.json) ; pointer / ; SHA-256 71a1c9f88b4ac1dcbba0917a08571bdded4b508dd0b43ecd0f7674045062d216.

<a id="e472"></a> **E472** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a4/world-1-solution.cjs) ; pointer / ; SHA-256 c53b369450197142a6fec0de87b9b72bd149fae31c9ab3f369036c68e4808e9a.

<a id="e456"></a> **E456** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a4/evidence.json) ; pointer /tables/telemetry_events/40 ; SHA-256 d7fff9f7d2c89f0a54737f6be20bb382c5b2929f42705910ea1e77dbce992f47.

<a id="e469"></a> **E469** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-moyen-a4_1_e21be3433bae.log) ; pointer / ; ligne 1729 ; SHA-256 3e34dfe814cb7a1a8029ca19574863faf93dc17691cbd0e2980b781e7ae64f76.

<a id="e474"></a> **E474** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a4/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 d7fff9f7d2c89f0a54737f6be20bb382c5b2929f42705910ea1e77dbce992f47.

<a id="e2916"></a> **E2916** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a4/evidence.json) ; pointer /tables/agents/2 ; SHA-256 d7fff9f7d2c89f0a54737f6be20bb382c5b2929f42705910ea1e77dbce992f47.

<a id="e475"></a> **E475** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a4/evidence.json) ; pointer /replays/1 ; SHA-256 d7fff9f7d2c89f0a54737f6be20bb382c5b2929f42705910ea1e77dbce992f47.

<a id="e537"></a> **E537** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a4/world-2-answer.json) ; pointer / ; SHA-256 600eccc4f4fbd322d4a662844efa025a8865e20db3e08bacfaba7e37b233ac31.

<a id="e539"></a> **E539** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a4/world-2-solution.cjs) ; pointer / ; SHA-256 62c4b15a4ea37ed996f1da558ec342b3a04d4aa7d772c8ee99d662fafcfaf08c.

<a id="e525"></a> **E525** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a4/evidence.json) ; pointer /tables/telemetry_events/101 ; SHA-256 d7fff9f7d2c89f0a54737f6be20bb382c5b2929f42705910ea1e77dbce992f47.

<a id="e536"></a> **E536** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-moyen-a4_2_aa526c6e049b.log) ; pointer / ; ligne 1749 ; SHA-256 465c066ada126b1e29db5652266320a0dd1cb5f0951dced185c3b834afb0f561.

<a id="e541"></a> **E541** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a4/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 d7fff9f7d2c89f0a54737f6be20bb382c5b2929f42705910ea1e77dbce992f47.

<a id="e2917"></a> **E2917** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a4/evidence.json) ; pointer /tables/agents/3 ; SHA-256 d7fff9f7d2c89f0a54737f6be20bb382c5b2929f42705910ea1e77dbce992f47.

<a id="e542"></a> **E542** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a4/evidence.json) ; pointer /replays/2 ; SHA-256 d7fff9f7d2c89f0a54737f6be20bb382c5b2929f42705910ea1e77dbce992f47.

<a id="e600"></a> **E600** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a4/world-3-answer.json) ; pointer / ; SHA-256 342b03c6be2380cd7149e3e368dc0093667c7a8639ab33518c84ba1ce7795656.

<a id="e602"></a> **E602** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a4/world-3-solution.cjs) ; pointer / ; SHA-256 a02b1534273162aefd580d9b25f1a6a15b00f5c750ec321f85441028069d3db0.

<a id="e588"></a> **E588** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a4/evidence.json) ; pointer /tables/telemetry_events/156 ; SHA-256 d7fff9f7d2c89f0a54737f6be20bb382c5b2929f42705910ea1e77dbce992f47.

<a id="e599"></a> **E599** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-moyen-a4_3_8c74559d0a04.log) ; pointer / ; ligne 1737 ; SHA-256 2b3d1eebe34d3e99f2ccaece9463f34aeecdb50582eff1059d81f4d79024b539.

<a id="e604"></a> **E604** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a5-local/request.json) ; pointer / ; SHA-256 cc999a8e649a2273b43df1db5a38d39541a72ce081400e52dd9980a0e27e514a.

<a id="e605"></a> **E605** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a5-local/evidence.json) ; pointer / ; SHA-256 6cd2725d7b9e6caa56478cbc1e21bb40a1a1ed5ac39f14504773eb99483a9ff1.

<a id="e606"></a> **E606** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a5-local/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e607"></a> **E607** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a5-local/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 6cd2725d7b9e6caa56478cbc1e21bb40a1a1ed5ac39f14504773eb99483a9ff1.

<a id="e2918"></a> **E2918** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a5-local/evidence.json) ; pointer /tables/agents/1 ; SHA-256 6cd2725d7b9e6caa56478cbc1e21bb40a1a1ed5ac39f14504773eb99483a9ff1.

<a id="e608"></a> **E608** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a5-local/evidence.json) ; pointer /replays/0 ; SHA-256 6cd2725d7b9e6caa56478cbc1e21bb40a1a1ed5ac39f14504773eb99483a9ff1.

<a id="e611"></a> **E611** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-moyen-a5-local_1_f2d66a142cff.log) ; pointer / ; ligne 1 ; SHA-256 3bd6f11d427ab7b9efb217ccd19ee90814d7a08ceb9095bd1949e9d98e0aaa5e.

<a id="e612"></a> **E612** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a5-local/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 6cd2725d7b9e6caa56478cbc1e21bb40a1a1ed5ac39f14504773eb99483a9ff1.

<a id="e2919"></a> **E2919** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a5-local/evidence.json) ; pointer /tables/agents/2 ; SHA-256 6cd2725d7b9e6caa56478cbc1e21bb40a1a1ed5ac39f14504773eb99483a9ff1.

<a id="e613"></a> **E613** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a5-local/evidence.json) ; pointer /replays/1 ; SHA-256 6cd2725d7b9e6caa56478cbc1e21bb40a1a1ed5ac39f14504773eb99483a9ff1.

<a id="e616"></a> **E616** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-moyen-a5-local_2_8fe0f2e9c391.log) ; pointer / ; ligne 1 ; SHA-256 7a88e6dcece9b947dd8a77328b7396dae4c0c54d413f54a2f0b08dad31fbb52b.

<a id="e617"></a> **E617** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a5-local/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 6cd2725d7b9e6caa56478cbc1e21bb40a1a1ed5ac39f14504773eb99483a9ff1.

<a id="e2920"></a> **E2920** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a5-local/evidence.json) ; pointer /tables/agents/3 ; SHA-256 6cd2725d7b9e6caa56478cbc1e21bb40a1a1ed5ac39f14504773eb99483a9ff1.

<a id="e618"></a> **E618** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a5-local/evidence.json) ; pointer /replays/2 ; SHA-256 6cd2725d7b9e6caa56478cbc1e21bb40a1a1ed5ac39f14504773eb99483a9ff1.

<a id="e621"></a> **E621** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-moyen-a5-local_3_4932fc3d7ea3.log) ; pointer / ; ligne 1 ; SHA-256 c9e30c4bcda3dc8659711e2c2688c49770ce3b1564b6b7da3d73b05e47c330a8.

<a id="e622"></a> **E622** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a6-local/request.json) ; pointer / ; SHA-256 e57a7bba17637167a64f5b9c0a2010d8389ce05c4e1d2f756557b470e7729436.

<a id="e623"></a> **E623** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a6-local/evidence.json) ; pointer / ; SHA-256 fd964bfdb987e75482b332cc6b6a9213148359052baa666b3c94f52e742634f1.

<a id="e624"></a> **E624** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a6-local/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e625"></a> **E625** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a6-local/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 fd964bfdb987e75482b332cc6b6a9213148359052baa666b3c94f52e742634f1.

<a id="e2921"></a> **E2921** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a6-local/evidence.json) ; pointer /tables/agents/1 ; SHA-256 fd964bfdb987e75482b332cc6b6a9213148359052baa666b3c94f52e742634f1.

<a id="e627"></a> **E627** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-moyen-a6-local_1_d5566b1d32cf.log) ; pointer / ; ligne 1 ; SHA-256 863872581aa771b005a9e215de88b1a9725ec9fe11cbfcf43ef7a1dd73dfb050.

<a id="e628"></a> **E628** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a6-local/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 fd964bfdb987e75482b332cc6b6a9213148359052baa666b3c94f52e742634f1.

<a id="e2922"></a> **E2922** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a6-local/evidence.json) ; pointer /tables/agents/2 ; SHA-256 fd964bfdb987e75482b332cc6b6a9213148359052baa666b3c94f52e742634f1.

<a id="e629"></a> **E629** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a6-local/evidence.json) ; pointer /replays/0 ; SHA-256 fd964bfdb987e75482b332cc6b6a9213148359052baa666b3c94f52e742634f1.

<a id="e636"></a> **E636** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a6-local/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 fd964bfdb987e75482b332cc6b6a9213148359052baa666b3c94f52e742634f1.

<a id="e2923"></a> **E2923** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a6-local/evidence.json) ; pointer /tables/agents/3 ; SHA-256 fd964bfdb987e75482b332cc6b6a9213148359052baa666b3c94f52e742634f1.

<a id="e637"></a> **E637** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-moyen-a6-local/evidence.json) ; pointer /replays/1 ; SHA-256 fd964bfdb987e75482b332cc6b6a9213148359052baa666b3c94f52e742634f1.

<a id="e646"></a> **E646** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a5-local/request.json) ; pointer / ; SHA-256 9bb8c477012452a6d3d73ad3dfa86662603dc32e2dd40aa53940f4fa310ee4ce.

<a id="e647"></a> **E647** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a5-local/evidence.json) ; pointer / ; SHA-256 90bf256aedb804940c73cf239a4fab6a2c5802eb320f196d9d4866555ab2c649.

<a id="e648"></a> **E648** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a5-local/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e649"></a> **E649** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a5-local/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 90bf256aedb804940c73cf239a4fab6a2c5802eb320f196d9d4866555ab2c649.

<a id="e2924"></a> **E2924** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a5-local/evidence.json) ; pointer /tables/agents/1 ; SHA-256 90bf256aedb804940c73cf239a4fab6a2c5802eb320f196d9d4866555ab2c649.

<a id="e650"></a> **E650** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a5-local/evidence.json) ; pointer /replays/0 ; SHA-256 90bf256aedb804940c73cf239a4fab6a2c5802eb320f196d9d4866555ab2c649.

<a id="e653"></a> **E653** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-difficile-a5-local_1_6f4e130504b7.log) ; pointer / ; ligne 1 ; SHA-256 7f389575ab9fde2c5054dd16e8865d61f89e006da4ed7cd4c78d1ca02e583ca5.

<a id="e654"></a> **E654** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a5-local/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 90bf256aedb804940c73cf239a4fab6a2c5802eb320f196d9d4866555ab2c649.

<a id="e2925"></a> **E2925** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a5-local/evidence.json) ; pointer /tables/agents/2 ; SHA-256 90bf256aedb804940c73cf239a4fab6a2c5802eb320f196d9d4866555ab2c649.

<a id="e655"></a> **E655** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a5-local/evidence.json) ; pointer /replays/1 ; SHA-256 90bf256aedb804940c73cf239a4fab6a2c5802eb320f196d9d4866555ab2c649.

<a id="e658"></a> **E658** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-difficile-a5-local_2_49bcd4b5c7cb.log) ; pointer / ; ligne 1 ; SHA-256 b6aeb847d0609238fc21981851cd693136f1018e428d39c49910a45b30c302ee.

<a id="e659"></a> **E659** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a5-local/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 90bf256aedb804940c73cf239a4fab6a2c5802eb320f196d9d4866555ab2c649.

<a id="e2926"></a> **E2926** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a5-local/evidence.json) ; pointer /tables/agents/3 ; SHA-256 90bf256aedb804940c73cf239a4fab6a2c5802eb320f196d9d4866555ab2c649.

<a id="e660"></a> **E660** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a5-local/evidence.json) ; pointer /replays/2 ; SHA-256 90bf256aedb804940c73cf239a4fab6a2c5802eb320f196d9d4866555ab2c649.

<a id="e663"></a> **E663** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-difficile-a5-local_3_59428d72e2f3.log) ; pointer / ; ligne 1 ; SHA-256 df7b235649b3dd43ce2d959333a41294312f0677b1dae6a0152fa970aeabe097.

<a id="e664"></a> **E664** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a6-codex/request.json) ; pointer / ; SHA-256 b1fb3e1001ec4300ecf947f12c1e6b31d4eea5d1a8689d535204916a814a4089.

<a id="e665"></a> **E665** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a6-codex/evidence.json) ; pointer / ; SHA-256 eb5aa722dacdcf10fc422018b1000e718a84ce60eef0a68481c028d9817b16ea.

<a id="e666"></a> **E666** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a6-codex/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e667"></a> **E667** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a6-codex/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 eb5aa722dacdcf10fc422018b1000e718a84ce60eef0a68481c028d9817b16ea.

<a id="e2927"></a> **E2927** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a6-codex/evidence.json) ; pointer /tables/agents/1 ; SHA-256 eb5aa722dacdcf10fc422018b1000e718a84ce60eef0a68481c028d9817b16ea.

<a id="e668"></a> **E668** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a6-codex/evidence.json) ; pointer /replays/0 ; SHA-256 eb5aa722dacdcf10fc422018b1000e718a84ce60eef0a68481c028d9817b16ea.

<a id="e671"></a> **E671** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-difficile-a6-codex_1_be45677f2b92.log) ; pointer / ; ligne 1 ; SHA-256 8161415d90dbf1417a989d4233f60b863c47ac860bdbc400f63648681a7bedc5.

<a id="e672"></a> **E672** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a6-codex/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 eb5aa722dacdcf10fc422018b1000e718a84ce60eef0a68481c028d9817b16ea.

<a id="e2928"></a> **E2928** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a6-codex/evidence.json) ; pointer /tables/agents/2 ; SHA-256 eb5aa722dacdcf10fc422018b1000e718a84ce60eef0a68481c028d9817b16ea.

<a id="e673"></a> **E673** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a6-codex/evidence.json) ; pointer /replays/1 ; SHA-256 eb5aa722dacdcf10fc422018b1000e718a84ce60eef0a68481c028d9817b16ea.

<a id="e676"></a> **E676** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-difficile-a6-codex_2_482eba5c402a.log) ; pointer / ; ligne 1 ; SHA-256 c8b2cd113ede8800e92b3e9419bf527af4397120eb6d471b39c7e5f531e4ce02.

<a id="e677"></a> **E677** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a6-codex/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 eb5aa722dacdcf10fc422018b1000e718a84ce60eef0a68481c028d9817b16ea.

<a id="e2929"></a> **E2929** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a6-codex/evidence.json) ; pointer /tables/agents/3 ; SHA-256 eb5aa722dacdcf10fc422018b1000e718a84ce60eef0a68481c028d9817b16ea.

<a id="e678"></a> **E678** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a6-codex/evidence.json) ; pointer /replays/2 ; SHA-256 eb5aa722dacdcf10fc422018b1000e718a84ce60eef0a68481c028d9817b16ea.

<a id="e681"></a> **E681** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-difficile-a6-codex_3_47cd65c610fb.log) ; pointer / ; ligne 1 ; SHA-256 e3e8faaa496963bed8d1da61dc3290a13338815e46402c7ffe1a9542ca99196b.

<a id="e682"></a> **E682** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a6-local/request.json) ; pointer / ; SHA-256 249b4ac7fa51a66047d2bf9129d6c7644f8ebaa8f801cb6196f14d35e0c05827.

<a id="e683"></a> **E683** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a6-local/evidence.json) ; pointer / ; SHA-256 56a3557c0cf2b7f7157e718d7af72c0fa3e5964ccb2e54f409b3c9f4b51457b0.

<a id="e684"></a> **E684** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a6-local/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e685"></a> **E685** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a6-local/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 56a3557c0cf2b7f7157e718d7af72c0fa3e5964ccb2e54f409b3c9f4b51457b0.

<a id="e2930"></a> **E2930** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a6-local/evidence.json) ; pointer /tables/agents/1 ; SHA-256 56a3557c0cf2b7f7157e718d7af72c0fa3e5964ccb2e54f409b3c9f4b51457b0.

<a id="e686"></a> **E686** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a6-local/evidence.json) ; pointer /replays/0 ; SHA-256 56a3557c0cf2b7f7157e718d7af72c0fa3e5964ccb2e54f409b3c9f4b51457b0.

<a id="e693"></a> **E693** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-difficile-a6-local_1_27808c52ae9b.log) ; pointer / ; ligne 17 ; SHA-256 ff3230206e660bc9ea0b4fc264dbfaa704363db25dcd9198c4bc2a404ca07a9f.

<a id="e694"></a> **E694** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a6-local/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 56a3557c0cf2b7f7157e718d7af72c0fa3e5964ccb2e54f409b3c9f4b51457b0.

<a id="e2931"></a> **E2931** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a6-local/evidence.json) ; pointer /tables/agents/2 ; SHA-256 56a3557c0cf2b7f7157e718d7af72c0fa3e5964ccb2e54f409b3c9f4b51457b0.

<a id="e695"></a> **E695** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a6-local/evidence.json) ; pointer /replays/1 ; SHA-256 56a3557c0cf2b7f7157e718d7af72c0fa3e5964ccb2e54f409b3c9f4b51457b0.

<a id="e702"></a> **E702** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a6-local/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 56a3557c0cf2b7f7157e718d7af72c0fa3e5964ccb2e54f409b3c9f4b51457b0.

<a id="e2932"></a> **E2932** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a6-local/evidence.json) ; pointer /tables/agents/3 ; SHA-256 56a3557c0cf2b7f7157e718d7af72c0fa3e5964ccb2e54f409b3c9f4b51457b0.

<a id="e703"></a> **E703** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a6-local/evidence.json) ; pointer /replays/2 ; SHA-256 56a3557c0cf2b7f7157e718d7af72c0fa3e5964ccb2e54f409b3c9f4b51457b0.

<a id="e710"></a> **E710** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a7-codex/request.json) ; pointer / ; SHA-256 2d925ea062a7ff9216ce02afc1ed16dd6c40caab856717fa6e2fb79ac6eff864.

<a id="e712"></a> **E712** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a7-codex/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e713"></a> **E713** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a7-codex/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 2b323b068732a78bb1f36c396ecbaf8e9c8ba24c4b8d60eb3951c44ebd67757e.

<a id="e2933"></a> **E2933** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a7-codex/evidence.json) ; pointer /tables/agents/1 ; SHA-256 2b323b068732a78bb1f36c396ecbaf8e9c8ba24c4b8d60eb3951c44ebd67757e.

<a id="e714"></a> **E714** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a7-codex/evidence.json) ; pointer /replays/0 ; SHA-256 2b323b068732a78bb1f36c396ecbaf8e9c8ba24c4b8d60eb3951c44ebd67757e.

<a id="e769"></a> **E769** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a7-codex/world-1-answer.json) ; pointer / ; SHA-256 96ff41c4f29dbf22788877678eede0335747321ac7872459b9be9e29db7129f9.

<a id="e771"></a> **E771** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a7-codex/world-1-solution.cjs) ; pointer / ; SHA-256 23409efdc36ee6343485ef2a2529ad1238b22bf2b8deca8b61ae9e6840e24ae8.

<a id="e758"></a> **E758** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a7-codex/evidence.json) ; pointer /tables/telemetry_events/48 ; SHA-256 2b323b068732a78bb1f36c396ecbaf8e9c8ba24c4b8d60eb3951c44ebd67757e.

<a id="e773"></a> **E773** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a7-codex/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 2b323b068732a78bb1f36c396ecbaf8e9c8ba24c4b8d60eb3951c44ebd67757e.

<a id="e2934"></a> **E2934** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a7-codex/evidence.json) ; pointer /tables/agents/2 ; SHA-256 2b323b068732a78bb1f36c396ecbaf8e9c8ba24c4b8d60eb3951c44ebd67757e.

<a id="e774"></a> **E774** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a7-codex/evidence.json) ; pointer /replays/1 ; SHA-256 2b323b068732a78bb1f36c396ecbaf8e9c8ba24c4b8d60eb3951c44ebd67757e.

<a id="e818"></a> **E818** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a7-codex/world-2-answer.json) ; pointer / ; SHA-256 6cf0d8579be54fb8c9e4c41244738f684aa35a1747a71b5719ab89fb7c1e9241.

<a id="e820"></a> **E820** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a7-codex/world-2-solution.cjs) ; pointer / ; SHA-256 75dd571b117e058bf7de54fcfeb0276df2df45b39dbccea7749d3cb644d9dae4.

<a id="e816"></a> **E816** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a7-codex/evidence.json) ; pointer /tables/telemetry_events/99 ; SHA-256 2b323b068732a78bb1f36c396ecbaf8e9c8ba24c4b8d60eb3951c44ebd67757e.

<a id="e822"></a> **E822** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a7-codex/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 2b323b068732a78bb1f36c396ecbaf8e9c8ba24c4b8d60eb3951c44ebd67757e.

<a id="e2935"></a> **E2935** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a7-codex/evidence.json) ; pointer /tables/agents/3 ; SHA-256 2b323b068732a78bb1f36c396ecbaf8e9c8ba24c4b8d60eb3951c44ebd67757e.

<a id="e823"></a> **E823** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a7-codex/evidence.json) ; pointer /replays/2 ; SHA-256 2b323b068732a78bb1f36c396ecbaf8e9c8ba24c4b8d60eb3951c44ebd67757e.

<a id="e869"></a> **E869** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a7-codex/world-3-answer.json) ; pointer / ; SHA-256 d6c47cb1ab3fd5a86f4d2ff4bac4cdb84ba980d7bb0f493a76c6fd998dcc334b.

<a id="e871"></a> **E871** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a7-codex/world-3-solution.cjs) ; pointer / ; SHA-256 88cdfa6e64beb6689feb1bfc44025e5f1ac88ad12ad3687528c405b751eeb93b.

<a id="e858"></a> **E858** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-difficile-a7-codex/evidence.json) ; pointer /tables/telemetry_events/134 ; SHA-256 2b323b068732a78bb1f36c396ecbaf8e9c8ba24c4b8d60eb3951c44ebd67757e.

<a id="e873"></a> **E873** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/scripts/missions.json) ; pointer /missions/27/mission ; SHA-256 5943ddd0760a9636f8dad6e7395adb2ce9afecf02603abcdc7d2c8019bbd163f.

<a id="e875"></a> **E875** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a5-local/request.json) ; pointer / ; SHA-256 5ddbfa50b526415d71bf8b650843b4cffba4724718977d2214ecdafc3f90249e.

<a id="e876"></a> **E876** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a5-local/evidence.json) ; pointer / ; SHA-256 3ae5485d49fe22cbed3c3589ecf198bcb82ffb4ccfd0dfdea356b5bc220cd7d9.

<a id="e877"></a> **E877** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a5-local/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e878"></a> **E878** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a5-local/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 3ae5485d49fe22cbed3c3589ecf198bcb82ffb4ccfd0dfdea356b5bc220cd7d9.

<a id="e2936"></a> **E2936** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a5-local/evidence.json) ; pointer /tables/agents/1 ; SHA-256 3ae5485d49fe22cbed3c3589ecf198bcb82ffb4ccfd0dfdea356b5bc220cd7d9.

<a id="e879"></a> **E879** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a5-local/evidence.json) ; pointer /replays/0 ; SHA-256 3ae5485d49fe22cbed3c3589ecf198bcb82ffb4ccfd0dfdea356b5bc220cd7d9.

<a id="e882"></a> **E882** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-tres-complexe-a5-local_1_d75d20063449.log) ; pointer / ; ligne 1 ; SHA-256 ae72fe410609aef193c55f3efd404f1679fe801d44e5dfe300b9a85171c2b8a4.

<a id="e883"></a> **E883** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a5-local/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 3ae5485d49fe22cbed3c3589ecf198bcb82ffb4ccfd0dfdea356b5bc220cd7d9.

<a id="e2937"></a> **E2937** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a5-local/evidence.json) ; pointer /tables/agents/2 ; SHA-256 3ae5485d49fe22cbed3c3589ecf198bcb82ffb4ccfd0dfdea356b5bc220cd7d9.

<a id="e884"></a> **E884** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a5-local/evidence.json) ; pointer /replays/1 ; SHA-256 3ae5485d49fe22cbed3c3589ecf198bcb82ffb4ccfd0dfdea356b5bc220cd7d9.

<a id="e887"></a> **E887** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-tres-complexe-a5-local_2_1eebfcb0e68e.log) ; pointer / ; ligne 1 ; SHA-256 11b6f2817e1918585f429467525af3c7fb511e9bb31e3fbbf69a6e82e36d0c38.

<a id="e888"></a> **E888** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a5-local/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 3ae5485d49fe22cbed3c3589ecf198bcb82ffb4ccfd0dfdea356b5bc220cd7d9.

<a id="e2938"></a> **E2938** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a5-local/evidence.json) ; pointer /tables/agents/3 ; SHA-256 3ae5485d49fe22cbed3c3589ecf198bcb82ffb4ccfd0dfdea356b5bc220cd7d9.

<a id="e889"></a> **E889** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a5-local/evidence.json) ; pointer /replays/2 ; SHA-256 3ae5485d49fe22cbed3c3589ecf198bcb82ffb4ccfd0dfdea356b5bc220cd7d9.

<a id="e892"></a> **E892** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-tres-complexe-a5-local_3_f3ff8c5a7d34.log) ; pointer / ; ligne 1 ; SHA-256 004ab498b6855374a52e9600ba30393b8305fcb52da5f8d1eace3d05494f3d88.

<a id="e893"></a> **E893** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a6-local/request.json) ; pointer / ; SHA-256 4d85f4bc8b961205e0884d4d96eef432fa7bb09f1c34c31bba56e57f0a2aceb8.

<a id="e894"></a> **E894** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a6-local/evidence.json) ; pointer / ; SHA-256 68be5410f4a81c3c34a70887479caa02293ae7fffe50e77a30f071ac6508aad2.

<a id="e895"></a> **E895** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a6-local/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e896"></a> **E896** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a6-local/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 68be5410f4a81c3c34a70887479caa02293ae7fffe50e77a30f071ac6508aad2.

<a id="e2939"></a> **E2939** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a6-local/evidence.json) ; pointer /tables/agents/1 ; SHA-256 68be5410f4a81c3c34a70887479caa02293ae7fffe50e77a30f071ac6508aad2.

<a id="e897"></a> **E897** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a6-local/evidence.json) ; pointer /replays/0 ; SHA-256 68be5410f4a81c3c34a70887479caa02293ae7fffe50e77a30f071ac6508aad2.

<a id="e904"></a> **E904** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a6-local/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 68be5410f4a81c3c34a70887479caa02293ae7fffe50e77a30f071ac6508aad2.

<a id="e2940"></a> **E2940** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a6-local/evidence.json) ; pointer /tables/agents/2 ; SHA-256 68be5410f4a81c3c34a70887479caa02293ae7fffe50e77a30f071ac6508aad2.

<a id="e905"></a> **E905** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a6-local/evidence.json) ; pointer /replays/1 ; SHA-256 68be5410f4a81c3c34a70887479caa02293ae7fffe50e77a30f071ac6508aad2.

<a id="e912"></a> **E912** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a6-local/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 68be5410f4a81c3c34a70887479caa02293ae7fffe50e77a30f071ac6508aad2.

<a id="e2941"></a> **E2941** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a6-local/evidence.json) ; pointer /tables/agents/3 ; SHA-256 68be5410f4a81c3c34a70887479caa02293ae7fffe50e77a30f071ac6508aad2.

<a id="e913"></a> **E913** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a6-local/evidence.json) ; pointer /replays/2 ; SHA-256 68be5410f4a81c3c34a70887479caa02293ae7fffe50e77a30f071ac6508aad2.

<a id="e921"></a> **E921** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a7-codex/request.json) ; pointer / ; SHA-256 6cd2a34ee94a19b2243357164e487a40744d94e700e69cbd2095c94907572002.

<a id="e922"></a> **E922** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a7-codex/evidence.json) ; pointer / ; SHA-256 eec56e3a870b3e60114912297967198544a0fefddf185813c7c2f443ae00b950.

<a id="e923"></a> **E923** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a7-codex/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e924"></a> **E924** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a7-codex/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 eec56e3a870b3e60114912297967198544a0fefddf185813c7c2f443ae00b950.

<a id="e2942"></a> **E2942** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a7-codex/evidence.json) ; pointer /tables/agents/1 ; SHA-256 eec56e3a870b3e60114912297967198544a0fefddf185813c7c2f443ae00b950.

<a id="e925"></a> **E925** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a7-codex/evidence.json) ; pointer /replays/0 ; SHA-256 eec56e3a870b3e60114912297967198544a0fefddf185813c7c2f443ae00b950.

<a id="e930"></a> **E930** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a7-codex/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 eec56e3a870b3e60114912297967198544a0fefddf185813c7c2f443ae00b950.

<a id="e2943"></a> **E2943** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a7-codex/evidence.json) ; pointer /tables/agents/2 ; SHA-256 eec56e3a870b3e60114912297967198544a0fefddf185813c7c2f443ae00b950.

<a id="e931"></a> **E931** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a7-codex/evidence.json) ; pointer /replays/1 ; SHA-256 eec56e3a870b3e60114912297967198544a0fefddf185813c7c2f443ae00b950.

<a id="e936"></a> **E936** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a7-codex/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 eec56e3a870b3e60114912297967198544a0fefddf185813c7c2f443ae00b950.

<a id="e2944"></a> **E2944** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a7-codex/evidence.json) ; pointer /tables/agents/3 ; SHA-256 eec56e3a870b3e60114912297967198544a0fefddf185813c7c2f443ae00b950.

<a id="e937"></a> **E937** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a7-codex/evidence.json) ; pointer /replays/2 ; SHA-256 eec56e3a870b3e60114912297967198544a0fefddf185813c7c2f443ae00b950.

<a id="e942"></a> **E942** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a8-codex/request.json) ; pointer / ; SHA-256 9048ae3b257b0eba296b65a5a1680590c58e14399850c2a2d60026ac7967124f.

<a id="e943"></a> **E943** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a8-codex/evidence.json) ; pointer / ; SHA-256 28af63c1f01f938bff033798316ba02893522abc59c17feab7e7b1c65f5cbf59.

<a id="e944"></a> **E944** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a8-codex/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e945"></a> **E945** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a8-codex/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 28af63c1f01f938bff033798316ba02893522abc59c17feab7e7b1c65f5cbf59.

<a id="e2945"></a> **E2945** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a8-codex/evidence.json) ; pointer /tables/agents/1 ; SHA-256 28af63c1f01f938bff033798316ba02893522abc59c17feab7e7b1c65f5cbf59.

<a id="e946"></a> **E946** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a8-codex/evidence.json) ; pointer /replays/0 ; SHA-256 28af63c1f01f938bff033798316ba02893522abc59c17feab7e7b1c65f5cbf59.

<a id="e952"></a> **E952** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-tres-complexe-a8-codex_1_cea4ff5eec79.log) ; pointer / ; ligne 11 ; SHA-256 7c984b86280a5bf03c225d0b4353e958025fc50807991b86ddea0afdced8676d.

<a id="e953"></a> **E953** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-tres-complexe-a8-codex_1_cea4ff5eec79.log) ; pointer / ; ligne 12 ; SHA-256 7c984b86280a5bf03c225d0b4353e958025fc50807991b86ddea0afdced8676d.

<a id="e954"></a> **E954** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a8-codex/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 28af63c1f01f938bff033798316ba02893522abc59c17feab7e7b1c65f5cbf59.

<a id="e2946"></a> **E2946** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a8-codex/evidence.json) ; pointer /tables/agents/2 ; SHA-256 28af63c1f01f938bff033798316ba02893522abc59c17feab7e7b1c65f5cbf59.

<a id="e955"></a> **E955** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a8-codex/evidence.json) ; pointer /replays/1 ; SHA-256 28af63c1f01f938bff033798316ba02893522abc59c17feab7e7b1c65f5cbf59.

<a id="e961"></a> **E961** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-tres-complexe-a8-codex_2_8c0ff1209cd6.log) ; pointer / ; ligne 21 ; SHA-256 5179d0a09d52112ffb50085ad76deca03e57488218d3aec9a82c261bf307d905.

<a id="e962"></a> **E962** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-tres-complexe-a8-codex_2_8c0ff1209cd6.log) ; pointer / ; ligne 22 ; SHA-256 5179d0a09d52112ffb50085ad76deca03e57488218d3aec9a82c261bf307d905.

<a id="e964"></a> **E964** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a8-codex/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 28af63c1f01f938bff033798316ba02893522abc59c17feab7e7b1c65f5cbf59.

<a id="e2947"></a> **E2947** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a8-codex/evidence.json) ; pointer /tables/agents/3 ; SHA-256 28af63c1f01f938bff033798316ba02893522abc59c17feab7e7b1c65f5cbf59.

<a id="e965"></a> **E965** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/jury-tres-complexe-a8-codex/evidence.json) ; pointer /replays/2 ; SHA-256 28af63c1f01f938bff033798316ba02893522abc59c17feab7e7b1c65f5cbf59.

<a id="e971"></a> **E971** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-jury-tres-complexe-a8-codex_3_a5528812a801.log) ; pointer / ; ligne 11 ; SHA-256 301620f8a5799313c5247285561e4def477319a1e31b0d5a023afd1d540ec3fc.

<a id="e972"></a> **E972** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/scripts/missions.json) ; pointer /missions/28/mission ; SHA-256 5943ddd0760a9636f8dad6e7395adb2ce9afecf02603abcdc7d2c8019bbd163f.

<a id="e974"></a> **E974** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-simple-a1/request.json) ; pointer / ; SHA-256 98e0ed08235102902cb17e5e61f3340a7f156b786a2e5c1647b291cf2d41243d.

<a id="e975"></a> **E975** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-simple-a1/evidence.json) ; pointer / ; SHA-256 7c495c790793600dedd7789fd9c157b53f3c052dcd4eb5de0aac321fcad9b852.

<a id="e976"></a> **E976** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-simple-a1/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e977"></a> **E977** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-simple-a1/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 7c495c790793600dedd7789fd9c157b53f3c052dcd4eb5de0aac321fcad9b852.

<a id="e2948"></a> **E2948** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-simple-a1/evidence.json) ; pointer /tables/agents/1 ; SHA-256 7c495c790793600dedd7789fd9c157b53f3c052dcd4eb5de0aac321fcad9b852.

<a id="e978"></a> **E978** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-simple-a1/evidence.json) ; pointer /replays/0 ; SHA-256 7c495c790793600dedd7789fd9c157b53f3c052dcd4eb5de0aac321fcad9b852.

<a id="e1014"></a> **E1014** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-simple-a1/world-1-solution.cjs) ; pointer / ; SHA-256 95b9651d3253e91ac8494b78e38ad38cc2ecd995bd62839e836fe35e38da4b8b.

<a id="e1016"></a> **E1016** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-simple-a1/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 7c495c790793600dedd7789fd9c157b53f3c052dcd4eb5de0aac321fcad9b852.

<a id="e2949"></a> **E2949** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-simple-a1/evidence.json) ; pointer /tables/agents/2 ; SHA-256 7c495c790793600dedd7789fd9c157b53f3c052dcd4eb5de0aac321fcad9b852.

<a id="e1017"></a> **E1017** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-simple-a1/evidence.json) ; pointer /replays/1 ; SHA-256 7c495c790793600dedd7789fd9c157b53f3c052dcd4eb5de0aac321fcad9b852.

<a id="e1047"></a> **E1047** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-simple-a1/world-2-answer.json) ; pointer / ; SHA-256 c818b6476577ddbbc134466533690b377ce235cfd101be1e68f0bc37ae61857d.

<a id="e1049"></a> **E1049** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-simple-a1/world-2-solution.cjs) ; pointer / ; SHA-256 315beb5cea7b90d4e515bf9bcd4eb4b36530b792df44a20b7a65b46a190ae95d.

<a id="e1045"></a> **E1045** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-simple-a1/evidence.json) ; pointer /tables/telemetry_events/62 ; SHA-256 7c495c790793600dedd7789fd9c157b53f3c052dcd4eb5de0aac321fcad9b852.

<a id="e1051"></a> **E1051** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-simple-a1/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 7c495c790793600dedd7789fd9c157b53f3c052dcd4eb5de0aac321fcad9b852.

<a id="e2950"></a> **E2950** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-simple-a1/evidence.json) ; pointer /tables/agents/3 ; SHA-256 7c495c790793600dedd7789fd9c157b53f3c052dcd4eb5de0aac321fcad9b852.

<a id="e1052"></a> **E1052** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-simple-a1/evidence.json) ; pointer /replays/2 ; SHA-256 7c495c790793600dedd7789fd9c157b53f3c052dcd4eb5de0aac321fcad9b852.

<a id="e1085"></a> **E1085** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-simple-a1/world-3-answer.json) ; pointer / ; SHA-256 de5ce00294d5920993da4f66b4c61ab34ab8399953c26ffea6b9bb70c6f67171.

<a id="e1087"></a> **E1087** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-simple-a1/world-3-solution.cjs) ; pointer / ; SHA-256 c0dca989d7ac9c93ac328651d156da88d5f4dc5d7708141f0dabf5ef565df5ee.

<a id="e1082"></a> **E1082** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-simple-a1/evidence.json) ; pointer /tables/telemetry_events/92 ; SHA-256 7c495c790793600dedd7789fd9c157b53f3c052dcd4eb5de0aac321fcad9b852.

<a id="e1089"></a> **E1089** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/scripts/missions.json) ; pointer /missions/29/mission ; SHA-256 5943ddd0760a9636f8dad6e7395adb2ce9afecf02603abcdc7d2c8019bbd163f.

<a id="e1091"></a> **E1091** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-moyen-a1/request.json) ; pointer / ; SHA-256 f8f3d4d26397205f80be3692f53e0b1aa451cd4356b4ee133a984d7ee62ec891.

<a id="e1092"></a> **E1092** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-moyen-a1/evidence.json) ; pointer / ; SHA-256 9c2b21ff40b57e57160bf2a4c6382b7d43480300ac45c203c7f0af5723496e79.

<a id="e1093"></a> **E1093** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-moyen-a1/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e1094"></a> **E1094** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-moyen-a1/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 9c2b21ff40b57e57160bf2a4c6382b7d43480300ac45c203c7f0af5723496e79.

<a id="e2951"></a> **E2951** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-moyen-a1/evidence.json) ; pointer /tables/agents/1 ; SHA-256 9c2b21ff40b57e57160bf2a4c6382b7d43480300ac45c203c7f0af5723496e79.

<a id="e1095"></a> **E1095** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-moyen-a1/evidence.json) ; pointer /replays/0 ; SHA-256 9c2b21ff40b57e57160bf2a4c6382b7d43480300ac45c203c7f0af5723496e79.

<a id="e1136"></a> **E1136** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-moyen-a1/world-1-answer.json) ; pointer / ; SHA-256 1672368af92b57d4c45e3dc06fec2570dc01254f1754adb7f19ef431866958be.

<a id="e1138"></a> **E1138** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-moyen-a1/world-1-solution.cjs) ; pointer / ; SHA-256 b8c9a64a3d4e487e93ceb83e26afa5c24438e25008779bdca8cbcd5b67649db1.

<a id="e1134"></a> **E1134** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-moyen-a1/evidence.json) ; pointer /tables/telemetry_events/42 ; SHA-256 9c2b21ff40b57e57160bf2a4c6382b7d43480300ac45c203c7f0af5723496e79.

<a id="e1140"></a> **E1140** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-moyen-a1/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 9c2b21ff40b57e57160bf2a4c6382b7d43480300ac45c203c7f0af5723496e79.

<a id="e2952"></a> **E2952** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-moyen-a1/evidence.json) ; pointer /tables/agents/2 ; SHA-256 9c2b21ff40b57e57160bf2a4c6382b7d43480300ac45c203c7f0af5723496e79.

<a id="e1141"></a> **E1141** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-moyen-a1/evidence.json) ; pointer /replays/1 ; SHA-256 9c2b21ff40b57e57160bf2a4c6382b7d43480300ac45c203c7f0af5723496e79.

<a id="e1191"></a> **E1191** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-moyen-a1/world-2-answer.json) ; pointer / ; SHA-256 16e4af14ab820e9da416fe1a56ac2b9418f9eb0317dc2fa1ee90c07c92884e5c.

<a id="e1193"></a> **E1193** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-moyen-a1/world-2-solution.cjs) ; pointer / ; SHA-256 43a14f1ac34c8cd5c94b6cf72d4db6d4c202cac58b38b3e8cb50081420a8d81c.

<a id="e1189"></a> **E1189** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-moyen-a1/evidence.json) ; pointer /tables/telemetry_events/90 ; SHA-256 9c2b21ff40b57e57160bf2a4c6382b7d43480300ac45c203c7f0af5723496e79.

<a id="e1195"></a> **E1195** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-moyen-a1/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 9c2b21ff40b57e57160bf2a4c6382b7d43480300ac45c203c7f0af5723496e79.

<a id="e2953"></a> **E2953** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-moyen-a1/evidence.json) ; pointer /tables/agents/3 ; SHA-256 9c2b21ff40b57e57160bf2a4c6382b7d43480300ac45c203c7f0af5723496e79.

<a id="e1196"></a> **E1196** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-moyen-a1/evidence.json) ; pointer /replays/2 ; SHA-256 9c2b21ff40b57e57160bf2a4c6382b7d43480300ac45c203c7f0af5723496e79.

<a id="e1248"></a> **E1248** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-moyen-a1/world-3-answer.json) ; pointer / ; SHA-256 ce8a56299def27b0762b7ab1a2f5bd5172b9c641857bb5f20e78a55e0ac52fe4.

<a id="e1250"></a> **E1250** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-moyen-a1/world-3-solution.cjs) ; pointer / ; SHA-256 b72035ac065c35205b81aea0701f5c38d2a12bae78f67b919fe72b4c29111590.

<a id="e1237"></a> **E1237** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-moyen-a1/evidence.json) ; pointer /tables/telemetry_events/131 ; SHA-256 9c2b21ff40b57e57160bf2a4c6382b7d43480300ac45c203c7f0af5723496e79.

<a id="e1252"></a> **E1252** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/scripts/missions.json) ; pointer /missions/30/mission ; SHA-256 5943ddd0760a9636f8dad6e7395adb2ce9afecf02603abcdc7d2c8019bbd163f.

<a id="e1254"></a> **E1254** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-difficile-a1/request.json) ; pointer / ; SHA-256 b2ac9e7df00b1bb411014f5fbc4c56796c3a32720966ee4bbfb0fec05104cf8e.

<a id="e1255"></a> **E1255** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-difficile-a1/evidence.json) ; pointer / ; SHA-256 5d899807199d1b47231cb91dfc91f6cc853690b86855138435dfb1c87d199e94.

<a id="e1256"></a> **E1256** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-difficile-a1/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e1257"></a> **E1257** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-difficile-a1/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 5d899807199d1b47231cb91dfc91f6cc853690b86855138435dfb1c87d199e94.

<a id="e2954"></a> **E2954** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-difficile-a1/evidence.json) ; pointer /tables/agents/1 ; SHA-256 5d899807199d1b47231cb91dfc91f6cc853690b86855138435dfb1c87d199e94.

<a id="e1258"></a> **E1258** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-difficile-a1/evidence.json) ; pointer /replays/0 ; SHA-256 5d899807199d1b47231cb91dfc91f6cc853690b86855138435dfb1c87d199e94.

<a id="e1302"></a> **E1302** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-difficile-a1/world-1-answer.json) ; pointer / ; SHA-256 53e9ab58ef2bc565449ae182f0211a508eebf2402f039ec664cff6f84f86bc84.

<a id="e1304"></a> **E1304** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-difficile-a1/world-1-solution.cjs) ; pointer / ; SHA-256 9aed17cbef579cb4c3171d0752a77924d48719870da73a86969f031181a739c1.

<a id="e1300"></a> **E1300** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-difficile-a1/evidence.json) ; pointer /tables/telemetry_events/44 ; SHA-256 5d899807199d1b47231cb91dfc91f6cc853690b86855138435dfb1c87d199e94.

<a id="e1306"></a> **E1306** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-difficile-a1/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 5d899807199d1b47231cb91dfc91f6cc853690b86855138435dfb1c87d199e94.

<a id="e2955"></a> **E2955** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-difficile-a1/evidence.json) ; pointer /tables/agents/2 ; SHA-256 5d899807199d1b47231cb91dfc91f6cc853690b86855138435dfb1c87d199e94.

<a id="e1307"></a> **E1307** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-difficile-a1/evidence.json) ; pointer /replays/1 ; SHA-256 5d899807199d1b47231cb91dfc91f6cc853690b86855138435dfb1c87d199e94.

<a id="e1355"></a> **E1355** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-difficile-a1/world-2-answer.json) ; pointer / ; SHA-256 a306ffd9c36679e6711377748dad2a8e49c704364f8d5a720d1ed689f0740d6b.

<a id="e1357"></a> **E1357** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-difficile-a1/world-2-solution.cjs) ; pointer / ; SHA-256 fc4e2a34672cd4d3391fba5d7c725276f7dc0a8be42be843d5efabd4d4dc07df.

<a id="e1353"></a> **E1353** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-difficile-a1/evidence.json) ; pointer /tables/telemetry_events/90 ; SHA-256 5d899807199d1b47231cb91dfc91f6cc853690b86855138435dfb1c87d199e94.

<a id="e1359"></a> **E1359** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-difficile-a1/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 5d899807199d1b47231cb91dfc91f6cc853690b86855138435dfb1c87d199e94.

<a id="e2956"></a> **E2956** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-difficile-a1/evidence.json) ; pointer /tables/agents/3 ; SHA-256 5d899807199d1b47231cb91dfc91f6cc853690b86855138435dfb1c87d199e94.

<a id="e1360"></a> **E1360** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-difficile-a1/evidence.json) ; pointer /replays/2 ; SHA-256 5d899807199d1b47231cb91dfc91f6cc853690b86855138435dfb1c87d199e94.

<a id="e1412"></a> **E1412** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-difficile-a1/world-3-answer.json) ; pointer / ; SHA-256 e905a4aa1b8bf8ccb02d9fc10e0bd22d2a33f52822407b1a2b7103fa25c90b8c.

<a id="e1414"></a> **E1414** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-difficile-a1/world-3-solution.cjs) ; pointer / ; SHA-256 a29ee2fb217566c8ad2c6f3beb0c58cba5c8dce62645ca5fe3afdf4e509b7d3d.

<a id="e1410"></a> **E1410** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-difficile-a1/evidence.json) ; pointer /tables/telemetry_events/140 ; SHA-256 5d899807199d1b47231cb91dfc91f6cc853690b86855138435dfb1c87d199e94.

<a id="e1416"></a> **E1416** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/scripts/missions.json) ; pointer /missions/31/mission ; SHA-256 5943ddd0760a9636f8dad6e7395adb2ce9afecf02603abcdc7d2c8019bbd163f.

<a id="e1418"></a> **E1418** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-tres-complexe-a1/request.json) ; pointer / ; SHA-256 a278c250fc7b86f6aa256e7ccb81c974c166fd5f027d58144158a9c5dc711b7c.

<a id="e1419"></a> **E1419** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-tres-complexe-a1/evidence.json) ; pointer / ; SHA-256 4c75b84f4ed5f9a36551941a749fff8ab7e3fd6898db90f564d0766f505aea2b.

<a id="e1420"></a> **E1420** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-tres-complexe-a1/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e1421"></a> **E1421** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-tres-complexe-a1/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 4c75b84f4ed5f9a36551941a749fff8ab7e3fd6898db90f564d0766f505aea2b.

<a id="e2957"></a> **E2957** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-tres-complexe-a1/evidence.json) ; pointer /tables/agents/1 ; SHA-256 4c75b84f4ed5f9a36551941a749fff8ab7e3fd6898db90f564d0766f505aea2b.

<a id="e1422"></a> **E1422** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-tres-complexe-a1/evidence.json) ; pointer /replays/0 ; SHA-256 4c75b84f4ed5f9a36551941a749fff8ab7e3fd6898db90f564d0766f505aea2b.

<a id="e1440"></a> **E1440** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-recursive-tres-complexe-a1_1_e17b4b73633c.log) ; pointer / ; ligne 4106 ; SHA-256 de4a44a7ef0eba90844e1c2ea213855b208968d1ca39d12f3365f56d89afdc73.

<a id="e1441"></a> **E1441** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-tres-complexe-a1/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 4c75b84f4ed5f9a36551941a749fff8ab7e3fd6898db90f564d0766f505aea2b.

<a id="e2958"></a> **E2958** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-tres-complexe-a1/evidence.json) ; pointer /tables/agents/2 ; SHA-256 4c75b84f4ed5f9a36551941a749fff8ab7e3fd6898db90f564d0766f505aea2b.

<a id="e1442"></a> **E1442** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-tres-complexe-a1/evidence.json) ; pointer /replays/1 ; SHA-256 4c75b84f4ed5f9a36551941a749fff8ab7e3fd6898db90f564d0766f505aea2b.

<a id="e1460"></a> **E1460** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-recursive-tres-complexe-a1_2_ba6227b04146.log) ; pointer / ; ligne 4146 ; SHA-256 163480f43a4dd77f71a57f1381a0ed9ea18d4641003bbdc5efb17a5fb4acd3e9.

<a id="e1461"></a> **E1461** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-tres-complexe-a1/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 4c75b84f4ed5f9a36551941a749fff8ab7e3fd6898db90f564d0766f505aea2b.

<a id="e2959"></a> **E2959** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-tres-complexe-a1/evidence.json) ; pointer /tables/agents/3 ; SHA-256 4c75b84f4ed5f9a36551941a749fff8ab7e3fd6898db90f564d0766f505aea2b.

<a id="e1462"></a> **E1462** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/recursive-tres-complexe-a1/evidence.json) ; pointer /replays/2 ; SHA-256 4c75b84f4ed5f9a36551941a749fff8ab7e3fd6898db90f564d0766f505aea2b.

<a id="e1480"></a> **E1480** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-recursive-tres-complexe-a1_3_f385e1b114a7.log) ; pointer / ; ligne 4099 ; SHA-256 289bf7fbba3f5e018d989a291fe66dc888628f0bf456c61fed34225d7502233c.

<a id="e1481"></a> **E1481** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/scripts/missions.json) ; pointer /missions/32/mission ; SHA-256 5943ddd0760a9636f8dad6e7395adb2ce9afecf02603abcdc7d2c8019bbd163f.

<a id="e1483"></a> **E1483** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-simple-a1/request.json) ; pointer / ; SHA-256 a02156c5071ebfde522f74af8d23049ee8d2656724d2d44886ad7fa8469ef3c7.

<a id="e1484"></a> **E1484** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-simple-a1/evidence.json) ; pointer / ; SHA-256 b98e90471e11ff1ab8100a7d37b1ffe60522523dfe3457c47d5edfb4e03e74f4.

<a id="e1485"></a> **E1485** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-simple-a1/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e1486"></a> **E1486** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-simple-a1/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 b98e90471e11ff1ab8100a7d37b1ffe60522523dfe3457c47d5edfb4e03e74f4.

<a id="e2960"></a> **E2960** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-simple-a1/evidence.json) ; pointer /tables/agents/1 ; SHA-256 b98e90471e11ff1ab8100a7d37b1ffe60522523dfe3457c47d5edfb4e03e74f4.

<a id="e1487"></a> **E1487** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-simple-a1/evidence.json) ; pointer /replays/0 ; SHA-256 b98e90471e11ff1ab8100a7d37b1ffe60522523dfe3457c47d5edfb4e03e74f4.

<a id="e1535"></a> **E1535** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-simple-a1/world-1-answer.json) ; pointer / ; SHA-256 7b373289bd8beab3e6d02e8fd4fa457585be9655a3d77208b61f8f43ed9d46b4.

<a id="e1537"></a> **E1537** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-simple-a1/world-1-solution.cjs) ; pointer / ; SHA-256 84ebdadf477b8cc9ee06557c37af17e6c9630c64f1599bd6bd3382356f591dde.

<a id="e1523"></a> **E1523** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-simple-a1/evidence.json) ; pointer /tables/telemetry_events/39 ; SHA-256 b98e90471e11ff1ab8100a7d37b1ffe60522523dfe3457c47d5edfb4e03e74f4.

<a id="e1534"></a> **E1534** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-adaptive-simple-a1_1_5a01e6349af1.log) ; pointer / ; ligne 2486 ; SHA-256 e9e193924fdb2a9582a47474f23c7239dd02ebae2114be34a0350bec5a6ba390.

<a id="e1539"></a> **E1539** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-simple-a1/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 b98e90471e11ff1ab8100a7d37b1ffe60522523dfe3457c47d5edfb4e03e74f4.

<a id="e2961"></a> **E2961** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-simple-a1/evidence.json) ; pointer /tables/agents/2 ; SHA-256 b98e90471e11ff1ab8100a7d37b1ffe60522523dfe3457c47d5edfb4e03e74f4.

<a id="e1540"></a> **E1540** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-simple-a1/evidence.json) ; pointer /replays/1 ; SHA-256 b98e90471e11ff1ab8100a7d37b1ffe60522523dfe3457c47d5edfb4e03e74f4.

<a id="e1578"></a> **E1578** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-simple-a1/world-2-answer.json) ; pointer / ; SHA-256 7e4ec737aa236efb8e38e83056dcc6ac1c4f135fc62a64532082ef43d1e8d6a4.

<a id="e1580"></a> **E1580** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-simple-a1/world-2-solution.cjs) ; pointer / ; SHA-256 51aeb178b89e100d51f76f176d5af731e25b833eb38dd6153024ddfbe02aba96.

<a id="e1576"></a> **E1576** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-simple-a1/evidence.json) ; pointer /tables/telemetry_events/84 ; SHA-256 b98e90471e11ff1ab8100a7d37b1ffe60522523dfe3457c47d5edfb4e03e74f4.

<a id="e1582"></a> **E1582** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-simple-a1/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 b98e90471e11ff1ab8100a7d37b1ffe60522523dfe3457c47d5edfb4e03e74f4.

<a id="e2962"></a> **E2962** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-simple-a1/evidence.json) ; pointer /tables/agents/3 ; SHA-256 b98e90471e11ff1ab8100a7d37b1ffe60522523dfe3457c47d5edfb4e03e74f4.

<a id="e1583"></a> **E1583** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-simple-a1/evidence.json) ; pointer /replays/2 ; SHA-256 b98e90471e11ff1ab8100a7d37b1ffe60522523dfe3457c47d5edfb4e03e74f4.

<a id="e1621"></a> **E1621** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-simple-a1/world-3-answer.json) ; pointer / ; SHA-256 93b6df33ba66bd6061982dd4035ecd25ebc464d5e4a436e8c19931e38bb11f57.

<a id="e1623"></a> **E1623** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-simple-a1/world-3-solution.cjs) ; pointer / ; SHA-256 6b82e8665603d390b6a23b74312d90a80ee4ea04bca6cfdf3be595fd8be9a42b.

<a id="e1619"></a> **E1619** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-simple-a1/evidence.json) ; pointer /tables/telemetry_events/120 ; SHA-256 b98e90471e11ff1ab8100a7d37b1ffe60522523dfe3457c47d5edfb4e03e74f4.

<a id="e1625"></a> **E1625** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/scripts/missions.json) ; pointer /missions/33/mission ; SHA-256 5943ddd0760a9636f8dad6e7395adb2ce9afecf02603abcdc7d2c8019bbd163f.

<a id="e1627"></a> **E1627** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-moyen-a1/request.json) ; pointer / ; SHA-256 748a1e20291663b0509f2dd2ae77edccedf201bd6ba495d2ff6cafbc9b88a5eb.

<a id="e1628"></a> **E1628** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-moyen-a1/evidence.json) ; pointer / ; SHA-256 39eb499509cfef37fd93e6f52c068da92261f819e2c94c38ee138f573183c42a.

<a id="e1629"></a> **E1629** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-moyen-a1/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e1630"></a> **E1630** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-moyen-a1/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 39eb499509cfef37fd93e6f52c068da92261f819e2c94c38ee138f573183c42a.

<a id="e2963"></a> **E2963** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-moyen-a1/evidence.json) ; pointer /tables/agents/1 ; SHA-256 39eb499509cfef37fd93e6f52c068da92261f819e2c94c38ee138f573183c42a.

<a id="e1631"></a> **E1631** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-moyen-a1/evidence.json) ; pointer /replays/0 ; SHA-256 39eb499509cfef37fd93e6f52c068da92261f819e2c94c38ee138f573183c42a.

<a id="e1637"></a> **E1637** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-adaptive-moyen-a1_1_ae50b0a8a4ae.log) ; pointer / ; ligne 10 ; SHA-256 e6e895a46475dc40bc5e7ec0d25a0b0cb6d256c96c694732bc6187596a215b3e.

<a id="e1639"></a> **E1639** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-moyen-a1/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 39eb499509cfef37fd93e6f52c068da92261f819e2c94c38ee138f573183c42a.

<a id="e2964"></a> **E2964** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-moyen-a1/evidence.json) ; pointer /tables/agents/2 ; SHA-256 39eb499509cfef37fd93e6f52c068da92261f819e2c94c38ee138f573183c42a.

<a id="e1640"></a> **E1640** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-moyen-a1/evidence.json) ; pointer /replays/1 ; SHA-256 39eb499509cfef37fd93e6f52c068da92261f819e2c94c38ee138f573183c42a.

<a id="e1647"></a> **E1647** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-moyen-a1/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 39eb499509cfef37fd93e6f52c068da92261f819e2c94c38ee138f573183c42a.

<a id="e2965"></a> **E2965** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-moyen-a1/evidence.json) ; pointer /tables/agents/3 ; SHA-256 39eb499509cfef37fd93e6f52c068da92261f819e2c94c38ee138f573183c42a.

<a id="e1648"></a> **E1648** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-moyen-a1/evidence.json) ; pointer /replays/2 ; SHA-256 39eb499509cfef37fd93e6f52c068da92261f819e2c94c38ee138f573183c42a.

<a id="e1655"></a> **E1655** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-moyen-a2/request.json) ; pointer / ; SHA-256 5e425a6f5fec7db2c0363a46312cf9d494d5dc4671c42363f41b6fdf1253e7ac.

<a id="e1656"></a> **E1656** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-moyen-a2/evidence.json) ; pointer / ; SHA-256 987a2be3a0822b0dc90430c86ae462eefc297479645affa10878fa2d8503865b.

<a id="e1657"></a> **E1657** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-moyen-a2/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e1658"></a> **E1658** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-moyen-a2/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 987a2be3a0822b0dc90430c86ae462eefc297479645affa10878fa2d8503865b.

<a id="e2966"></a> **E2966** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-moyen-a2/evidence.json) ; pointer /tables/agents/1 ; SHA-256 987a2be3a0822b0dc90430c86ae462eefc297479645affa10878fa2d8503865b.

<a id="e1659"></a> **E1659** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-moyen-a2/evidence.json) ; pointer /replays/0 ; SHA-256 987a2be3a0822b0dc90430c86ae462eefc297479645affa10878fa2d8503865b.

<a id="e1665"></a> **E1665** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-adaptive-moyen-a2_1_a1ae93c77347.log) ; pointer / ; ligne 21 ; SHA-256 aea616dfef66ec794bf3236e74dc1ff6f89026a6010f7ab40cfd40ae9fc93d82.

<a id="e1666"></a> **E1666** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-adaptive-moyen-a2_1_a1ae93c77347.log) ; pointer / ; ligne 22 ; SHA-256 aea616dfef66ec794bf3236e74dc1ff6f89026a6010f7ab40cfd40ae9fc93d82.

<a id="e1667"></a> **E1667** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-moyen-a2/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 987a2be3a0822b0dc90430c86ae462eefc297479645affa10878fa2d8503865b.

<a id="e2967"></a> **E2967** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-moyen-a2/evidence.json) ; pointer /tables/agents/2 ; SHA-256 987a2be3a0822b0dc90430c86ae462eefc297479645affa10878fa2d8503865b.

<a id="e1668"></a> **E1668** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-moyen-a2/evidence.json) ; pointer /replays/1 ; SHA-256 987a2be3a0822b0dc90430c86ae462eefc297479645affa10878fa2d8503865b.

<a id="e1674"></a> **E1674** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-adaptive-moyen-a2_2_445b73b6d9e2.log) ; pointer / ; ligne 20 ; SHA-256 920d69e25e52897e6ebf5cd9f15db7153ee7b6698dbf86a19e8c14178fa514d6.

<a id="e1675"></a> **E1675** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-moyen-a2/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 987a2be3a0822b0dc90430c86ae462eefc297479645affa10878fa2d8503865b.

<a id="e2968"></a> **E2968** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-moyen-a2/evidence.json) ; pointer /tables/agents/3 ; SHA-256 987a2be3a0822b0dc90430c86ae462eefc297479645affa10878fa2d8503865b.

<a id="e1676"></a> **E1676** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-moyen-a2/evidence.json) ; pointer /replays/2 ; SHA-256 987a2be3a0822b0dc90430c86ae462eefc297479645affa10878fa2d8503865b.

<a id="e1682"></a> **E1682** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-adaptive-moyen-a2_3_b65698e57116.log) ; pointer / ; ligne 11 ; SHA-256 301620f8a5799313c5247285561e4def477319a1e31b0d5a023afd1d540ec3fc.

<a id="e1683"></a> **E1683** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/scripts/missions.json) ; pointer /missions/34/mission ; SHA-256 5943ddd0760a9636f8dad6e7395adb2ce9afecf02603abcdc7d2c8019bbd163f.

<a id="e1685"></a> **E1685** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-difficile-a2/request.json) ; pointer / ; SHA-256 007c9a3874a36807fb34067923e7b82cc9f25a014750aff49e3ecc0d95cfdc63.

<a id="e1686"></a> **E1686** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-difficile-a2/evidence.json) ; pointer / ; SHA-256 977306f0cb984bb26378a1e781bb980256f89b9a6af74c33f715da47f002ba52.

<a id="e1687"></a> **E1687** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-difficile-a2/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e1688"></a> **E1688** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-difficile-a2/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 977306f0cb984bb26378a1e781bb980256f89b9a6af74c33f715da47f002ba52.

<a id="e2969"></a> **E2969** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-difficile-a2/evidence.json) ; pointer /tables/agents/1 ; SHA-256 977306f0cb984bb26378a1e781bb980256f89b9a6af74c33f715da47f002ba52.

<a id="e1689"></a> **E1689** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-difficile-a2/evidence.json) ; pointer /replays/0 ; SHA-256 977306f0cb984bb26378a1e781bb980256f89b9a6af74c33f715da47f002ba52.

<a id="e1716"></a> **E1716** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/capsules/qual-20261006-adaptive-difficile-a2/worker_qual-20261006-adaptive-difficile-a2_1_47d82d105c2d_run_1791283628246/answer.json) ; pointer / ; SHA-256 09e9fbc5a29eee89c0aac176f9331b51f39ec928db49408d3d126c7bd56b5c2a.

<a id="e1717"></a> **E1717** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/capsules/qual-20261006-adaptive-difficile-a2/worker_qual-20261006-adaptive-difficile-a2_1_47d82d105c2d_run_1791283628246/solution.cjs) ; pointer / ; SHA-256 b7ebb05888f386eba76bd3a0f6a60bedbb514ba54664bf49632e69ac3e9eb281.

<a id="e1713"></a> **E1713** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-difficile-a2/evidence.json) ; pointer /tables/telemetry_events/25 ; SHA-256 977306f0cb984bb26378a1e781bb980256f89b9a6af74c33f715da47f002ba52.

<a id="e1715"></a> **E1715** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-adaptive-difficile-a2_1_47d82d105c2d.log) ; pointer / ; ligne 4551 ; SHA-256 b63fa791f289bb71a8eb2bc7062762be2128e74318bf3ebe2269667f23f6bf6f.

<a id="e1718"></a> **E1718** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-difficile-a2/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 977306f0cb984bb26378a1e781bb980256f89b9a6af74c33f715da47f002ba52.

<a id="e2970"></a> **E2970** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-difficile-a2/evidence.json) ; pointer /tables/agents/2 ; SHA-256 977306f0cb984bb26378a1e781bb980256f89b9a6af74c33f715da47f002ba52.

<a id="e1719"></a> **E1719** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-difficile-a2/evidence.json) ; pointer /replays/1 ; SHA-256 977306f0cb984bb26378a1e781bb980256f89b9a6af74c33f715da47f002ba52.

<a id="e1743"></a> **E1743** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/capsules/qual-20261006-adaptive-difficile-a2/worker_qual-20261006-adaptive-difficile-a2_2_425cd03c3869_run_1791283628375/answer.json) ; pointer / ; SHA-256 410224259654d6ba075bde953eb45df2c052838d9b0df092704493f465414a6e.

<a id="e1744"></a> **E1744** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/capsules/qual-20261006-adaptive-difficile-a2/worker_qual-20261006-adaptive-difficile-a2_2_425cd03c3869_run_1791283628375/solution.cjs) ; pointer / ; SHA-256 3c277d165c271a63ebb978600eb181ad62329f1338f94ab77a10d452aacdbdbf.

<a id="e1732"></a> **E1732** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-difficile-a2/evidence.json) ; pointer /tables/telemetry_events/38 ; SHA-256 977306f0cb984bb26378a1e781bb980256f89b9a6af74c33f715da47f002ba52.

<a id="e1742"></a> **E1742** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-adaptive-difficile-a2_2_425cd03c3869.log) ; pointer / ; ligne 4601 ; SHA-256 e675d2493db5cc2a8e3683239d7556ef9ced68a8a9b2baa7523afcd8f31cdf09.

<a id="e1745"></a> **E1745** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-difficile-a2/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 977306f0cb984bb26378a1e781bb980256f89b9a6af74c33f715da47f002ba52.

<a id="e2971"></a> **E2971** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-difficile-a2/evidence.json) ; pointer /tables/agents/3 ; SHA-256 977306f0cb984bb26378a1e781bb980256f89b9a6af74c33f715da47f002ba52.

<a id="e1746"></a> **E1746** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-difficile-a2/evidence.json) ; pointer /replays/2 ; SHA-256 977306f0cb984bb26378a1e781bb980256f89b9a6af74c33f715da47f002ba52.

<a id="e1772"></a> **E1772** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/capsules/qual-20261006-adaptive-difficile-a2/worker_qual-20261006-adaptive-difficile-a2_3_687480aa0905_run_1791283628467/answer.json) ; pointer / ; SHA-256 37cdd8b9c28ada790d5d36a3b7f4b13ca1a8c2a553b6142e3053e9d70e4ed105.

<a id="e1773"></a> **E1773** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/capsules/qual-20261006-adaptive-difficile-a2/worker_qual-20261006-adaptive-difficile-a2_3_687480aa0905_run_1791283628467/solution.cjs) ; pointer / ; SHA-256 c08d7d3f63d73cb8ef17121169802d5deb71961362f5647ae8de189af5860975.

<a id="e1759"></a> **E1759** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-difficile-a2/evidence.json) ; pointer /tables/telemetry_events/59 ; SHA-256 977306f0cb984bb26378a1e781bb980256f89b9a6af74c33f715da47f002ba52.

<a id="e1771"></a> **E1771** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-adaptive-difficile-a2_3_687480aa0905.log) ; pointer / ; ligne 4541 ; SHA-256 0d9469a42c5eb3fa97e37065cd6f6dad9fa8e860022aff66d6f14691e73a5417.

<a id="e1774"></a> **E1774** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/scripts/missions.json) ; pointer /missions/35/mission ; SHA-256 5943ddd0760a9636f8dad6e7395adb2ce9afecf02603abcdc7d2c8019bbd163f.

<a id="e1776"></a> **E1776** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-tres-complexe-a2/request.json) ; pointer / ; SHA-256 dd71887e484beb88b81d16a22ed3dbc2b886caeab5a81d208dc6530e2aa023cf.

<a id="e1777"></a> **E1777** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-tres-complexe-a2/evidence.json) ; pointer / ; SHA-256 ad240e02065c2f52c0c1c40f1895d8b3da795c96bcd85b001c2d3fdda6f0aec8.

<a id="e1778"></a> **E1778** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-tres-complexe-a2/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e1779"></a> **E1779** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-tres-complexe-a2/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 ad240e02065c2f52c0c1c40f1895d8b3da795c96bcd85b001c2d3fdda6f0aec8.

<a id="e2972"></a> **E2972** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-tres-complexe-a2/evidence.json) ; pointer /tables/agents/1 ; SHA-256 ad240e02065c2f52c0c1c40f1895d8b3da795c96bcd85b001c2d3fdda6f0aec8.

<a id="e1780"></a> **E1780** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-tres-complexe-a2/evidence.json) ; pointer /replays/0 ; SHA-256 ad240e02065c2f52c0c1c40f1895d8b3da795c96bcd85b001c2d3fdda6f0aec8.

<a id="e1786"></a> **E1786** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-adaptive-tres-complexe-a2_1_0d05c542ef32.log) ; pointer / ; ligne 61 ; SHA-256 e230ed541c56a14c529a69ee3c43d2e6acb0a5cc41ae557dbe8aca9e05053bdb.

<a id="e1787"></a> **E1787** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-tres-complexe-a2/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 ad240e02065c2f52c0c1c40f1895d8b3da795c96bcd85b001c2d3fdda6f0aec8.

<a id="e2973"></a> **E2973** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-tres-complexe-a2/evidence.json) ; pointer /tables/agents/2 ; SHA-256 ad240e02065c2f52c0c1c40f1895d8b3da795c96bcd85b001c2d3fdda6f0aec8.

<a id="e1788"></a> **E1788** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-tres-complexe-a2/evidence.json) ; pointer /replays/1 ; SHA-256 ad240e02065c2f52c0c1c40f1895d8b3da795c96bcd85b001c2d3fdda6f0aec8.

<a id="e1806"></a> **E1806** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-adaptive-tres-complexe-a2_2_84a79a1ca074.log) ; pointer / ; ligne 4515 ; SHA-256 58a8608b70da1947010942cdd5a9466e2eb92604130d3c73e426ef26d90c0196.

<a id="e1807"></a> **E1807** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-tres-complexe-a2/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 ad240e02065c2f52c0c1c40f1895d8b3da795c96bcd85b001c2d3fdda6f0aec8.

<a id="e2974"></a> **E2974** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-tres-complexe-a2/evidence.json) ; pointer /tables/agents/3 ; SHA-256 ad240e02065c2f52c0c1c40f1895d8b3da795c96bcd85b001c2d3fdda6f0aec8.

<a id="e1808"></a> **E1808** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/adaptive-tres-complexe-a2/evidence.json) ; pointer /replays/2 ; SHA-256 ad240e02065c2f52c0c1c40f1895d8b3da795c96bcd85b001c2d3fdda6f0aec8.

<a id="e1824"></a> **E1824** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-adaptive-tres-complexe-a2_3_06bd3b594bcc.log) ; pointer / ; ligne 4465 ; SHA-256 21aa94beb9e6464cf965a2e0cef8313ea4a75237023708a26e84a0a4ab3e4778.

<a id="e1825"></a> **E1825** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/scripts/missions.json) ; pointer /missions/44/mission ; SHA-256 5943ddd0760a9636f8dad6e7395adb2ce9afecf02603abcdc7d2c8019bbd163f.

<a id="e1827"></a> **E1827** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a2/request.json) ; pointer / ; SHA-256 fc14dfac9976440b551c92b54255f08211a32f45425deff8a1c420b0ec179b56.

<a id="e1828"></a> **E1828** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a2/evidence.json) ; pointer / ; SHA-256 797744ccc5251bb1e2cfe4db47bf8f5afd8777b02c452d5be2792d70cc20519a.

<a id="e1829"></a> **E1829** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a2/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e1830"></a> **E1830** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a2/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 797744ccc5251bb1e2cfe4db47bf8f5afd8777b02c452d5be2792d70cc20519a.

<a id="e2975"></a> **E2975** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a2/evidence.json) ; pointer /tables/agents/1 ; SHA-256 797744ccc5251bb1e2cfe4db47bf8f5afd8777b02c452d5be2792d70cc20519a.

<a id="e1831"></a> **E1831** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a2/evidence.json) ; pointer /replays/0 ; SHA-256 797744ccc5251bb1e2cfe4db47bf8f5afd8777b02c452d5be2792d70cc20519a.

<a id="e1846"></a> **E1846** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a2/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 797744ccc5251bb1e2cfe4db47bf8f5afd8777b02c452d5be2792d70cc20519a.

<a id="e2976"></a> **E2976** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a2/evidence.json) ; pointer /tables/agents/2 ; SHA-256 797744ccc5251bb1e2cfe4db47bf8f5afd8777b02c452d5be2792d70cc20519a.

<a id="e1847"></a> **E1847** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a2/evidence.json) ; pointer /replays/1 ; SHA-256 797744ccc5251bb1e2cfe4db47bf8f5afd8777b02c452d5be2792d70cc20519a.

<a id="e1868"></a> **E1868** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a2/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 797744ccc5251bb1e2cfe4db47bf8f5afd8777b02c452d5be2792d70cc20519a.

<a id="e2977"></a> **E2977** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a2/evidence.json) ; pointer /tables/agents/3 ; SHA-256 797744ccc5251bb1e2cfe4db47bf8f5afd8777b02c452d5be2792d70cc20519a.

<a id="e1869"></a> **E1869** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a2/evidence.json) ; pointer /replays/2 ; SHA-256 797744ccc5251bb1e2cfe4db47bf8f5afd8777b02c452d5be2792d70cc20519a.

<a id="e1881"></a> **E1881** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a3/request.json) ; pointer / ; SHA-256 a59a552bd8fa826d6d20b5cfb41a14149a641302df77a920d1aecab34e8c8cf2.

<a id="e1882"></a> **E1882** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a3/evidence.json) ; pointer / ; SHA-256 e6d0dcc882df6ed77bd5a922feb09dfaa7c51eaae5a30a89aaf4c8616ea2e303.

<a id="e1883"></a> **E1883** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a3/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e1884"></a> **E1884** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a3/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 e6d0dcc882df6ed77bd5a922feb09dfaa7c51eaae5a30a89aaf4c8616ea2e303.

<a id="e2978"></a> **E2978** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a3/evidence.json) ; pointer /tables/agents/1 ; SHA-256 e6d0dcc882df6ed77bd5a922feb09dfaa7c51eaae5a30a89aaf4c8616ea2e303.

<a id="e1885"></a> **E1885** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a3/evidence.json) ; pointer /replays/0 ; SHA-256 e6d0dcc882df6ed77bd5a922feb09dfaa7c51eaae5a30a89aaf4c8616ea2e303.

<a id="e1913"></a> **E1913** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a3/evidence.json) ; pointer /tables/telemetry_events/32 ; SHA-256 e6d0dcc882df6ed77bd5a922feb09dfaa7c51eaae5a30a89aaf4c8616ea2e303.

<a id="e1924"></a> **E1924** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-simple-a3_1_42b4ddc85ab1.log) ; pointer / ; ligne 679 ; SHA-256 194fd9bad64f4179a550e2fe19f89020486b892c25857fb602035e7e86253938.

<a id="e1925"></a> **E1925** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a3/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 e6d0dcc882df6ed77bd5a922feb09dfaa7c51eaae5a30a89aaf4c8616ea2e303.

<a id="e2979"></a> **E2979** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a3/evidence.json) ; pointer /tables/agents/2 ; SHA-256 e6d0dcc882df6ed77bd5a922feb09dfaa7c51eaae5a30a89aaf4c8616ea2e303.

<a id="e1926"></a> **E1926** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a3/evidence.json) ; pointer /replays/1 ; SHA-256 e6d0dcc882df6ed77bd5a922feb09dfaa7c51eaae5a30a89aaf4c8616ea2e303.

<a id="e1942"></a> **E1942** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a3/evidence.json) ; pointer /tables/telemetry_events/57 ; SHA-256 e6d0dcc882df6ed77bd5a922feb09dfaa7c51eaae5a30a89aaf4c8616ea2e303.

<a id="e1953"></a> **E1953** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-simple-a3_2_a826950eed02.log) ; pointer / ; ligne 673 ; SHA-256 13529fb4d4ac959a24487d145c92d8c74ad59a0f1d780e544ebf52c271aa980d.

<a id="e1954"></a> **E1954** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a3/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 e6d0dcc882df6ed77bd5a922feb09dfaa7c51eaae5a30a89aaf4c8616ea2e303.

<a id="e2980"></a> **E2980** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a3/evidence.json) ; pointer /tables/agents/3 ; SHA-256 e6d0dcc882df6ed77bd5a922feb09dfaa7c51eaae5a30a89aaf4c8616ea2e303.

<a id="e1955"></a> **E1955** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a3/evidence.json) ; pointer /replays/2 ; SHA-256 e6d0dcc882df6ed77bd5a922feb09dfaa7c51eaae5a30a89aaf4c8616ea2e303.

<a id="e1979"></a> **E1979** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a3/evidence.json) ; pointer /tables/telemetry_events/90 ; SHA-256 e6d0dcc882df6ed77bd5a922feb09dfaa7c51eaae5a30a89aaf4c8616ea2e303.

<a id="e1981"></a> **E1981** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a4/request.json) ; pointer / ; SHA-256 a44428c157453949af046ccf40866d90f5715c698ea40ef77407ad04cd842bf3.

<a id="e1982"></a> **E1982** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a4/evidence.json) ; pointer / ; SHA-256 ff2eca562b6907ef81e03770bac07587d6f3be7405da4ad692630dd36dcd9591.

<a id="e1983"></a> **E1983** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a4/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e1984"></a> **E1984** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a4/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 ff2eca562b6907ef81e03770bac07587d6f3be7405da4ad692630dd36dcd9591.

<a id="e2981"></a> **E2981** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a4/evidence.json) ; pointer /tables/agents/1 ; SHA-256 ff2eca562b6907ef81e03770bac07587d6f3be7405da4ad692630dd36dcd9591.

<a id="e1985"></a> **E1985** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a4/evidence.json) ; pointer /replays/0 ; SHA-256 ff2eca562b6907ef81e03770bac07587d6f3be7405da4ad692630dd36dcd9591.

<a id="e2031"></a> **E2031** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a4/world-1-answer.json) ; pointer / ; SHA-256 6a5ab1e3f721cd9ebc6d3505e282b95074e04737de28d38eb2a20810a6a58e50.

<a id="e2029"></a> **E2029** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a4/evidence.json) ; pointer /tables/telemetry_events/48 ; SHA-256 ff2eca562b6907ef81e03770bac07587d6f3be7405da4ad692630dd36dcd9591.

<a id="e2033"></a> **E2033** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a4/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 ff2eca562b6907ef81e03770bac07587d6f3be7405da4ad692630dd36dcd9591.

<a id="e2982"></a> **E2982** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a4/evidence.json) ; pointer /tables/agents/2 ; SHA-256 ff2eca562b6907ef81e03770bac07587d6f3be7405da4ad692630dd36dcd9591.

<a id="e2034"></a> **E2034** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a4/evidence.json) ; pointer /replays/1 ; SHA-256 ff2eca562b6907ef81e03770bac07587d6f3be7405da4ad692630dd36dcd9591.

<a id="e2095"></a> **E2095** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a4/world-2-answer.json) ; pointer / ; SHA-256 da8f208e90dfd0c138b28a05cb034537af9d8c5309ff1f35680625bf95f9994a.

<a id="e2082"></a> **E2082** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a4/evidence.json) ; pointer /tables/telemetry_events/96 ; SHA-256 ff2eca562b6907ef81e03770bac07587d6f3be7405da4ad692630dd36dcd9591.

<a id="e2093"></a> **E2093** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-simple-a4_2_1c166f85842a.log) ; pointer / ; ligne 1594 ; SHA-256 49b1abec183059cf990b179182f011c9ebfa335877e54ffbb533f2127c9b476a.

<a id="e2094"></a> **E2094** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-simple-a4_2_1c166f85842a.log) ; pointer / ; ligne 1595 ; SHA-256 49b1abec183059cf990b179182f011c9ebfa335877e54ffbb533f2127c9b476a.

<a id="e2097"></a> **E2097** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a4/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 ff2eca562b6907ef81e03770bac07587d6f3be7405da4ad692630dd36dcd9591.

<a id="e2983"></a> **E2983** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a4/evidence.json) ; pointer /tables/agents/3 ; SHA-256 ff2eca562b6907ef81e03770bac07587d6f3be7405da4ad692630dd36dcd9591.

<a id="e2098"></a> **E2098** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a4/evidence.json) ; pointer /replays/2 ; SHA-256 ff2eca562b6907ef81e03770bac07587d6f3be7405da4ad692630dd36dcd9591.

<a id="e2164"></a> **E2164** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a4/world-3-answer.json) ; pointer / ; SHA-256 be3e85f19fc6837f3e93b6fccf45a3fad2fef6d5f90314d965684cd5ee45980c.

<a id="e2152"></a> **E2152** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a4/evidence.json) ; pointer /tables/telemetry_events/159 ; SHA-256 ff2eca562b6907ef81e03770bac07587d6f3be7405da4ad692630dd36dcd9591.

<a id="e2163"></a> **E2163** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-simple-a4_3_1850d60c5d07.log) ; pointer / ; ligne 1585 ; SHA-256 9832ef66e66e703090af80a34e605f227edf7108d1fe637683013f6b4062ea42.

<a id="e2166"></a> **E2166** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a5-local/request.json) ; pointer / ; SHA-256 0747295ce2da4b66c686b73a345b4fae68e8f856790a74bc6302a2a998d04595.

<a id="e2167"></a> **E2167** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a5-local/evidence.json) ; pointer / ; SHA-256 7c8b35785798eecdba3ea9ae0d99af10a3f7d0de9e36d98a66dd68eeae757878.

<a id="e2168"></a> **E2168** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a5-local/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e2169"></a> **E2169** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a5-local/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 7c8b35785798eecdba3ea9ae0d99af10a3f7d0de9e36d98a66dd68eeae757878.

<a id="e2984"></a> **E2984** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a5-local/evidence.json) ; pointer /tables/agents/1 ; SHA-256 7c8b35785798eecdba3ea9ae0d99af10a3f7d0de9e36d98a66dd68eeae757878.

<a id="e2170"></a> **E2170** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a5-local/evidence.json) ; pointer /replays/0 ; SHA-256 7c8b35785798eecdba3ea9ae0d99af10a3f7d0de9e36d98a66dd68eeae757878.

<a id="e2173"></a> **E2173** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-simple-a5-local_1_f61004319924.log) ; pointer / ; ligne 1 ; SHA-256 5d830ee1f64a1d61e3a40e36b5b9d7c1671927da21ce645354fc26180568bf99.

<a id="e2174"></a> **E2174** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a5-local/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 7c8b35785798eecdba3ea9ae0d99af10a3f7d0de9e36d98a66dd68eeae757878.

<a id="e2985"></a> **E2985** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a5-local/evidence.json) ; pointer /tables/agents/2 ; SHA-256 7c8b35785798eecdba3ea9ae0d99af10a3f7d0de9e36d98a66dd68eeae757878.

<a id="e2175"></a> **E2175** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a5-local/evidence.json) ; pointer /replays/1 ; SHA-256 7c8b35785798eecdba3ea9ae0d99af10a3f7d0de9e36d98a66dd68eeae757878.

<a id="e2178"></a> **E2178** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-simple-a5-local_2_305e6bf62477.log) ; pointer / ; ligne 1 ; SHA-256 ea8897658440321060a7ad79cfb091e8a1eb821696423860a7a9b2cc49d329ac.

<a id="e2179"></a> **E2179** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a5-local/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 7c8b35785798eecdba3ea9ae0d99af10a3f7d0de9e36d98a66dd68eeae757878.

<a id="e2986"></a> **E2986** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a5-local/evidence.json) ; pointer /tables/agents/3 ; SHA-256 7c8b35785798eecdba3ea9ae0d99af10a3f7d0de9e36d98a66dd68eeae757878.

<a id="e2180"></a> **E2180** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a5-local/evidence.json) ; pointer /replays/2 ; SHA-256 7c8b35785798eecdba3ea9ae0d99af10a3f7d0de9e36d98a66dd68eeae757878.

<a id="e2183"></a> **E2183** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-simple-a5-local_3_7d1ec7d742c3.log) ; pointer / ; ligne 1 ; SHA-256 f77d5e769b69442219040c033938ae145046caef3fc3b70ba6213dd57eeaa823.

<a id="e2184"></a> **E2184** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a6-codex/request.json) ; pointer / ; SHA-256 bce698129500e3f86c624691e46b3997be87a8d0172a85ccc01732ebc1192883.

<a id="e2185"></a> **E2185** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a6-codex/evidence.json) ; pointer / ; SHA-256 6507aea2bdffd7fdcb2e1f5f3a500cdb99744932a4d09483b13c3c0d41331482.

<a id="e2186"></a> **E2186** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a6-codex/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e2187"></a> **E2187** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a6-codex/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 6507aea2bdffd7fdcb2e1f5f3a500cdb99744932a4d09483b13c3c0d41331482.

<a id="e2987"></a> **E2987** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a6-codex/evidence.json) ; pointer /tables/agents/1 ; SHA-256 6507aea2bdffd7fdcb2e1f5f3a500cdb99744932a4d09483b13c3c0d41331482.

<a id="e2188"></a> **E2188** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a6-codex/evidence.json) ; pointer /replays/0 ; SHA-256 6507aea2bdffd7fdcb2e1f5f3a500cdb99744932a4d09483b13c3c0d41331482.

<a id="e2191"></a> **E2191** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-simple-a6-codex_1_2483fdab3f8c.log) ; pointer / ; ligne 1 ; SHA-256 e045392c7418b96a67e4a4c13788f927c6190b107d2b90d3a8cd152964b62d56.

<a id="e2192"></a> **E2192** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a6-codex/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 6507aea2bdffd7fdcb2e1f5f3a500cdb99744932a4d09483b13c3c0d41331482.

<a id="e2988"></a> **E2988** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a6-codex/evidence.json) ; pointer /tables/agents/2 ; SHA-256 6507aea2bdffd7fdcb2e1f5f3a500cdb99744932a4d09483b13c3c0d41331482.

<a id="e2193"></a> **E2193** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a6-codex/evidence.json) ; pointer /replays/1 ; SHA-256 6507aea2bdffd7fdcb2e1f5f3a500cdb99744932a4d09483b13c3c0d41331482.

<a id="e2196"></a> **E2196** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-simple-a6-codex_2_2e279819f040.log) ; pointer / ; ligne 1 ; SHA-256 9c5e8db55fad91b5357e040735891d9dabc6550f5ee79868f17062e9e8dbd103.

<a id="e2197"></a> **E2197** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a6-codex/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 6507aea2bdffd7fdcb2e1f5f3a500cdb99744932a4d09483b13c3c0d41331482.

<a id="e2989"></a> **E2989** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a6-codex/evidence.json) ; pointer /tables/agents/3 ; SHA-256 6507aea2bdffd7fdcb2e1f5f3a500cdb99744932a4d09483b13c3c0d41331482.

<a id="e2198"></a> **E2198** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a6-codex/evidence.json) ; pointer /replays/2 ; SHA-256 6507aea2bdffd7fdcb2e1f5f3a500cdb99744932a4d09483b13c3c0d41331482.

<a id="e2201"></a> **E2201** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-simple-a6-codex_3_768a30e19ef1.log) ; pointer / ; ligne 1 ; SHA-256 9550d8e1425a48d5c3284783e0f2193b97f3adf09d929d679919336890280ed5.

<a id="e2202"></a> **E2202** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a6-local/request.json) ; pointer / ; SHA-256 437e871890550b68e38330766b0d0bb0037b82bd6b1b580d158b5a4961c4010b.

<a id="e2204"></a> **E2204** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a6-local/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e2205"></a> **E2205** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a6-local/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 b371da4bf44dfff613afd9ec8047fb4b57f11ba96c3b8052233a8c482f758954.

<a id="e2990"></a> **E2990** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a6-local/evidence.json) ; pointer /tables/agents/1 ; SHA-256 b371da4bf44dfff613afd9ec8047fb4b57f11ba96c3b8052233a8c482f758954.

<a id="e2206"></a> **E2206** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a6-local/evidence.json) ; pointer /replays/0 ; SHA-256 b371da4bf44dfff613afd9ec8047fb4b57f11ba96c3b8052233a8c482f758954.

<a id="e2214"></a> **E2214** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a6-local/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 b371da4bf44dfff613afd9ec8047fb4b57f11ba96c3b8052233a8c482f758954.

<a id="e2991"></a> **E2991** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a6-local/evidence.json) ; pointer /tables/agents/2 ; SHA-256 b371da4bf44dfff613afd9ec8047fb4b57f11ba96c3b8052233a8c482f758954.

<a id="e2215"></a> **E2215** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a6-local/evidence.json) ; pointer /replays/1 ; SHA-256 b371da4bf44dfff613afd9ec8047fb4b57f11ba96c3b8052233a8c482f758954.

<a id="e2223"></a> **E2223** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a6-local/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 b371da4bf44dfff613afd9ec8047fb4b57f11ba96c3b8052233a8c482f758954.

<a id="e2992"></a> **E2992** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a6-local/evidence.json) ; pointer /tables/agents/3 ; SHA-256 b371da4bf44dfff613afd9ec8047fb4b57f11ba96c3b8052233a8c482f758954.

<a id="e2224"></a> **E2224** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-simple-a6-local/evidence.json) ; pointer /replays/2 ; SHA-256 b371da4bf44dfff613afd9ec8047fb4b57f11ba96c3b8052233a8c482f758954.

<a id="e2234"></a> **E2234** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a3/request.json) ; pointer / ; SHA-256 083f8729c8c3c399b7697a70c0acf862ec5660367f77493e9518b87b63c88cde.

<a id="e2235"></a> **E2235** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a3/evidence.json) ; pointer / ; SHA-256 3bc9eccddeb92165966600cdf05c5ade4404862bf9a276df86e4b55e656964c9.

<a id="e2236"></a> **E2236** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a3/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e2237"></a> **E2237** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a3/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 3bc9eccddeb92165966600cdf05c5ade4404862bf9a276df86e4b55e656964c9.

<a id="e2993"></a> **E2993** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a3/evidence.json) ; pointer /tables/agents/1 ; SHA-256 3bc9eccddeb92165966600cdf05c5ade4404862bf9a276df86e4b55e656964c9.

<a id="e2238"></a> **E2238** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a3/evidence.json) ; pointer /replays/0 ; SHA-256 3bc9eccddeb92165966600cdf05c5ade4404862bf9a276df86e4b55e656964c9.

<a id="e2277"></a> **E2277** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a3/evidence.json) ; pointer /tables/telemetry_events/42 ; SHA-256 3bc9eccddeb92165966600cdf05c5ade4404862bf9a276df86e4b55e656964c9.

<a id="e2279"></a> **E2279** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-moyen-a3_1_fe023e892b31.log) ; pointer / ; ligne 263 ; SHA-256 e585237c72350bb24cce63d8f3bf40eb77785860bff2a7648475140a9aecc78d.

<a id="e2282"></a> **E2282** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a3/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 3bc9eccddeb92165966600cdf05c5ade4404862bf9a276df86e4b55e656964c9.

<a id="e2994"></a> **E2994** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a3/evidence.json) ; pointer /tables/agents/2 ; SHA-256 3bc9eccddeb92165966600cdf05c5ade4404862bf9a276df86e4b55e656964c9.

<a id="e2283"></a> **E2283** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a3/evidence.json) ; pointer /replays/1 ; SHA-256 3bc9eccddeb92165966600cdf05c5ade4404862bf9a276df86e4b55e656964c9.

<a id="e2299"></a> **E2299** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a3/evidence.json) ; pointer /tables/telemetry_events/58 ; SHA-256 3bc9eccddeb92165966600cdf05c5ade4404862bf9a276df86e4b55e656964c9.

<a id="e2308"></a> **E2308** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-moyen-a3_2_3153a207fd5d.log) ; pointer / ; ligne 615 ; SHA-256 a87d3be2f21bf2c1d5a1f14d86dc1d6f11e1a798e14ecaac2a9072626997e12f.

<a id="e2309"></a> **E2309** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-moyen-a3_2_3153a207fd5d.log) ; pointer / ; ligne 616 ; SHA-256 a87d3be2f21bf2c1d5a1f14d86dc1d6f11e1a798e14ecaac2a9072626997e12f.

<a id="e2310"></a> **E2310** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a3/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 3bc9eccddeb92165966600cdf05c5ade4404862bf9a276df86e4b55e656964c9.

<a id="e2995"></a> **E2995** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a3/evidence.json) ; pointer /tables/agents/3 ; SHA-256 3bc9eccddeb92165966600cdf05c5ade4404862bf9a276df86e4b55e656964c9.

<a id="e2311"></a> **E2311** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a3/evidence.json) ; pointer /replays/2 ; SHA-256 3bc9eccddeb92165966600cdf05c5ade4404862bf9a276df86e4b55e656964c9.

<a id="e2327"></a> **E2327** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a3/evidence.json) ; pointer /tables/telemetry_events/81 ; SHA-256 3bc9eccddeb92165966600cdf05c5ade4404862bf9a276df86e4b55e656964c9.

<a id="e2329"></a> **E2329** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a5-local/request.json) ; pointer / ; SHA-256 7000e7db678f28eac034d043b6d5457454ddbae502e1c4db8ce67d3d90a3e9c6.

<a id="e2330"></a> **E2330** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a5-local/evidence.json) ; pointer / ; SHA-256 e140c4614582c4eb2c2918fb3fc93ef82131b3f601d0c1c114e9b8edb9132605.

<a id="e2331"></a> **E2331** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a5-local/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e2332"></a> **E2332** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a5-local/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 e140c4614582c4eb2c2918fb3fc93ef82131b3f601d0c1c114e9b8edb9132605.

<a id="e2996"></a> **E2996** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a5-local/evidence.json) ; pointer /tables/agents/1 ; SHA-256 e140c4614582c4eb2c2918fb3fc93ef82131b3f601d0c1c114e9b8edb9132605.

<a id="e2333"></a> **E2333** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a5-local/evidence.json) ; pointer /replays/0 ; SHA-256 e140c4614582c4eb2c2918fb3fc93ef82131b3f601d0c1c114e9b8edb9132605.

<a id="e2336"></a> **E2336** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-moyen-a5-local_1_a06e1405277d.log) ; pointer / ; ligne 1 ; SHA-256 47f859c994a0be8813bfae3b24c065618677c09aaabf7888e8aa3b218af4b144.

<a id="e2337"></a> **E2337** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a5-local/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 e140c4614582c4eb2c2918fb3fc93ef82131b3f601d0c1c114e9b8edb9132605.

<a id="e2997"></a> **E2997** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a5-local/evidence.json) ; pointer /tables/agents/2 ; SHA-256 e140c4614582c4eb2c2918fb3fc93ef82131b3f601d0c1c114e9b8edb9132605.

<a id="e2338"></a> **E2338** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a5-local/evidence.json) ; pointer /replays/1 ; SHA-256 e140c4614582c4eb2c2918fb3fc93ef82131b3f601d0c1c114e9b8edb9132605.

<a id="e2341"></a> **E2341** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-moyen-a5-local_2_42970779b499.log) ; pointer / ; ligne 1 ; SHA-256 1b828b9728e64de506fe52c84ea126f8579f82f8a311f9d27b730b4a8a492508.

<a id="e2342"></a> **E2342** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a5-local/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 e140c4614582c4eb2c2918fb3fc93ef82131b3f601d0c1c114e9b8edb9132605.

<a id="e2998"></a> **E2998** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a5-local/evidence.json) ; pointer /tables/agents/3 ; SHA-256 e140c4614582c4eb2c2918fb3fc93ef82131b3f601d0c1c114e9b8edb9132605.

<a id="e2343"></a> **E2343** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a5-local/evidence.json) ; pointer /replays/2 ; SHA-256 e140c4614582c4eb2c2918fb3fc93ef82131b3f601d0c1c114e9b8edb9132605.

<a id="e2346"></a> **E2346** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-moyen-a5-local_3_53f4b5c1c098.log) ; pointer / ; ligne 1 ; SHA-256 cffb34226dee8130b2fb58ead565acad9ee4d9f5c2e6e7c2191a8b657deb5744.

<a id="e2347"></a> **E2347** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-codex/request.json) ; pointer / ; SHA-256 72059952f9b9379e77e341136153d6d68eee9c1d948438ea6ae78a22a8e691a2.

<a id="e2348"></a> **E2348** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-codex/evidence.json) ; pointer / ; SHA-256 9d868bc3e4c2e05a4d80a3fa29b24c3d7c113a74fb56049a904311e6cb386a77.

<a id="e2349"></a> **E2349** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-codex/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e2350"></a> **E2350** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-codex/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 9d868bc3e4c2e05a4d80a3fa29b24c3d7c113a74fb56049a904311e6cb386a77.

<a id="e2999"></a> **E2999** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-codex/evidence.json) ; pointer /tables/agents/1 ; SHA-256 9d868bc3e4c2e05a4d80a3fa29b24c3d7c113a74fb56049a904311e6cb386a77.

<a id="e2351"></a> **E2351** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-codex/evidence.json) ; pointer /replays/0 ; SHA-256 9d868bc3e4c2e05a4d80a3fa29b24c3d7c113a74fb56049a904311e6cb386a77.

<a id="e2416"></a> **E2416** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-codex/world-1-solution.cjs) ; pointer / ; SHA-256 9a55c0886c5ff91d548f95530262e4406f64f59526f736bb79f35ee40077737f.

<a id="e2394"></a> **E2394** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-codex/evidence.json) ; pointer /tables/telemetry_events/45 ; SHA-256 9d868bc3e4c2e05a4d80a3fa29b24c3d7c113a74fb56049a904311e6cb386a77.

<a id="e2406"></a> **E2406** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-moyen-a6-codex_1_361228b80193.log) ; pointer / ; ligne 22 ; SHA-256 b3a19063994d2f7f0ff562a5999a94f3c9166ca52fe5f1a48ef05eb267f446c0.

<a id="e2407"></a> **E2407** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-moyen-a6-codex_1_361228b80193.log) ; pointer / ; ligne 43 ; SHA-256 b3a19063994d2f7f0ff562a5999a94f3c9166ca52fe5f1a48ef05eb267f446c0.

<a id="e2418"></a> **E2418** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-codex/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 9d868bc3e4c2e05a4d80a3fa29b24c3d7c113a74fb56049a904311e6cb386a77.

<a id="e3000"></a> **E3000** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-codex/evidence.json) ; pointer /tables/agents/2 ; SHA-256 9d868bc3e4c2e05a4d80a3fa29b24c3d7c113a74fb56049a904311e6cb386a77.

<a id="e2420"></a> **E2420** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-moyen-a6-codex_2_c7bd458d658d.log) ; pointer / ; ligne 1 ; SHA-256 7a11a571bcb87b308f6c0f2f55acf0f3e3b711b280a93723598c39e4669079da.

<a id="e2421"></a> **E2421** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-codex/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 9d868bc3e4c2e05a4d80a3fa29b24c3d7c113a74fb56049a904311e6cb386a77.

<a id="e3001"></a> **E3001** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-codex/evidence.json) ; pointer /tables/agents/3 ; SHA-256 9d868bc3e4c2e05a4d80a3fa29b24c3d7c113a74fb56049a904311e6cb386a77.

<a id="e2423"></a> **E2423** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-moyen-a6-codex_3_3c8fe6588fcb.log) ; pointer / ; ligne 1 ; SHA-256 d92dd74d52c9680dd35bd482953a045673dfc55f6870fa975ff642abbeb07af8.

<a id="e2424"></a> **E2424** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-local/request.json) ; pointer / ; SHA-256 ff14170cc7003f722ff6c69137dd5f76e6be1a102a25eccff2d6b1d0ca8a3487.

<a id="e2425"></a> **E2425** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-local/evidence.json) ; pointer / ; SHA-256 cf964df8f265499f1c798d296ced57a64c1de74f5b1edd88d73b134f468cb1a5.

<a id="e2426"></a> **E2426** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-local/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e2427"></a> **E2427** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-local/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 cf964df8f265499f1c798d296ced57a64c1de74f5b1edd88d73b134f468cb1a5.

<a id="e3002"></a> **E3002** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-local/evidence.json) ; pointer /tables/agents/1 ; SHA-256 cf964df8f265499f1c798d296ced57a64c1de74f5b1edd88d73b134f468cb1a5.

<a id="e2428"></a> **E2428** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-local/evidence.json) ; pointer /replays/0 ; SHA-256 cf964df8f265499f1c798d296ced57a64c1de74f5b1edd88d73b134f468cb1a5.

<a id="e2430"></a> **E2430** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-moyen-a6-local_1_bdd778e6bb2d.log) ; pointer / ; ligne 1 ; SHA-256 4b4866ef2cd9bcc41e7e6e54e68f812814cedc0f22f1627fb71398f2cecf1c73.

<a id="e2431"></a> **E2431** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-local/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 cf964df8f265499f1c798d296ced57a64c1de74f5b1edd88d73b134f468cb1a5.

<a id="e3003"></a> **E3003** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-local/evidence.json) ; pointer /tables/agents/2 ; SHA-256 cf964df8f265499f1c798d296ced57a64c1de74f5b1edd88d73b134f468cb1a5.

<a id="e2432"></a> **E2432** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-local/evidence.json) ; pointer /replays/1 ; SHA-256 cf964df8f265499f1c798d296ced57a64c1de74f5b1edd88d73b134f468cb1a5.

<a id="e2440"></a> **E2440** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-local/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 cf964df8f265499f1c798d296ced57a64c1de74f5b1edd88d73b134f468cb1a5.

<a id="e3004"></a> **E3004** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-local/evidence.json) ; pointer /tables/agents/3 ; SHA-256 cf964df8f265499f1c798d296ced57a64c1de74f5b1edd88d73b134f468cb1a5.

<a id="e2441"></a> **E2441** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-moyen-a6-local/evidence.json) ; pointer /replays/2 ; SHA-256 cf964df8f265499f1c798d296ced57a64c1de74f5b1edd88d73b134f468cb1a5.

<a id="e2449"></a> **E2449** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/scripts/missions.json) ; pointer /missions/46/mission ; SHA-256 5943ddd0760a9636f8dad6e7395adb2ce9afecf02603abcdc7d2c8019bbd163f.

<a id="e2451"></a> **E2451** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a5-local/request.json) ; pointer / ; SHA-256 a3e70bb4c38de4a6a26504c50e746150e84585ce9f52735085aad047f81c98a8.

<a id="e2452"></a> **E2452** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a5-local/evidence.json) ; pointer / ; SHA-256 276b67de6a7e70bed8e75aaf5027214e4e7a786611d68d62439116f6dffcc265.

<a id="e2453"></a> **E2453** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a5-local/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e2454"></a> **E2454** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a5-local/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 276b67de6a7e70bed8e75aaf5027214e4e7a786611d68d62439116f6dffcc265.

<a id="e3005"></a> **E3005** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a5-local/evidence.json) ; pointer /tables/agents/1 ; SHA-256 276b67de6a7e70bed8e75aaf5027214e4e7a786611d68d62439116f6dffcc265.

<a id="e2455"></a> **E2455** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a5-local/evidence.json) ; pointer /replays/0 ; SHA-256 276b67de6a7e70bed8e75aaf5027214e4e7a786611d68d62439116f6dffcc265.

<a id="e2458"></a> **E2458** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-difficile-a5-local_1_0b97f47865d7.log) ; pointer / ; ligne 1 ; SHA-256 899e6287b49d20789ccbae71f7f73491e36faf25a780759abae7b62cac81d394.

<a id="e2459"></a> **E2459** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a5-local/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 276b67de6a7e70bed8e75aaf5027214e4e7a786611d68d62439116f6dffcc265.

<a id="e3006"></a> **E3006** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a5-local/evidence.json) ; pointer /tables/agents/2 ; SHA-256 276b67de6a7e70bed8e75aaf5027214e4e7a786611d68d62439116f6dffcc265.

<a id="e2460"></a> **E2460** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a5-local/evidence.json) ; pointer /replays/1 ; SHA-256 276b67de6a7e70bed8e75aaf5027214e4e7a786611d68d62439116f6dffcc265.

<a id="e2463"></a> **E2463** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-difficile-a5-local_2_1d79e67ec3bc.log) ; pointer / ; ligne 1 ; SHA-256 5389f6ac1bfd270f02927ccdac3bc734802b31192c0c2c25e389d9efed2a1b5d.

<a id="e2464"></a> **E2464** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a5-local/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 276b67de6a7e70bed8e75aaf5027214e4e7a786611d68d62439116f6dffcc265.

<a id="e3007"></a> **E3007** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a5-local/evidence.json) ; pointer /tables/agents/3 ; SHA-256 276b67de6a7e70bed8e75aaf5027214e4e7a786611d68d62439116f6dffcc265.

<a id="e2465"></a> **E2465** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a5-local/evidence.json) ; pointer /replays/2 ; SHA-256 276b67de6a7e70bed8e75aaf5027214e4e7a786611d68d62439116f6dffcc265.

<a id="e2468"></a> **E2468** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-difficile-a5-local_3_b3526a3aea42.log) ; pointer / ; ligne 1 ; SHA-256 67226629f3a515d2075824f19bb46663c7ea8f62d2fe01aa6cb8942686c06971.

<a id="e2469"></a> **E2469** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a6-codex/request.json) ; pointer / ; SHA-256 5abe9206a8bd3fae46f008230927ba9ecd227edfcf45bb03bed47a495800766c.

<a id="e2470"></a> **E2470** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a6-codex/evidence.json) ; pointer / ; SHA-256 f96d79bc0a7241e92602e74bc8f4efbe6cb7a4a01416a6072429aab3a663fb7c.

<a id="e2471"></a> **E2471** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a6-codex/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e2472"></a> **E2472** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a6-codex/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 f96d79bc0a7241e92602e74bc8f4efbe6cb7a4a01416a6072429aab3a663fb7c.

<a id="e3008"></a> **E3008** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a6-codex/evidence.json) ; pointer /tables/agents/1 ; SHA-256 f96d79bc0a7241e92602e74bc8f4efbe6cb7a4a01416a6072429aab3a663fb7c.

<a id="e2473"></a> **E2473** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a6-codex/evidence.json) ; pointer /replays/0 ; SHA-256 f96d79bc0a7241e92602e74bc8f4efbe6cb7a4a01416a6072429aab3a663fb7c.

<a id="e2491"></a> **E2491** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-difficile-a6-codex_1_e72753913d87.log) ; pointer / ; ligne 38 ; SHA-256 3b03506c3520929d60f604d2b5fb8a1e3dfda0ea88921595b085da3ae0996870.

<a id="e2492"></a> **E2492** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-difficile-a6-codex_1_e72753913d87.log) ; pointer / ; ligne 79 ; SHA-256 3b03506c3520929d60f604d2b5fb8a1e3dfda0ea88921595b085da3ae0996870.

<a id="e2496"></a> **E2496** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a6-codex/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 f96d79bc0a7241e92602e74bc8f4efbe6cb7a4a01416a6072429aab3a663fb7c.

<a id="e3009"></a> **E3009** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a6-codex/evidence.json) ; pointer /tables/agents/2 ; SHA-256 f96d79bc0a7241e92602e74bc8f4efbe6cb7a4a01416a6072429aab3a663fb7c.

<a id="e2497"></a> **E2497** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a6-codex/evidence.json) ; pointer /replays/1 ; SHA-256 f96d79bc0a7241e92602e74bc8f4efbe6cb7a4a01416a6072429aab3a663fb7c.

<a id="e2515"></a> **E2515** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-difficile-a6-codex_2_9cfaa5d3ada1.log) ; pointer / ; ligne 36 ; SHA-256 513aa5f50897f3f7b426d80364cc69a7a028e3f12cc4ac9aa4c502804ae29d22.

<a id="e2516"></a> **E2516** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-difficile-a6-codex_2_9cfaa5d3ada1.log) ; pointer / ; ligne 76 ; SHA-256 513aa5f50897f3f7b426d80364cc69a7a028e3f12cc4ac9aa4c502804ae29d22.

<a id="e2520"></a> **E2520** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a6-codex/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 f96d79bc0a7241e92602e74bc8f4efbe6cb7a4a01416a6072429aab3a663fb7c.

<a id="e3010"></a> **E3010** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a6-codex/evidence.json) ; pointer /tables/agents/3 ; SHA-256 f96d79bc0a7241e92602e74bc8f4efbe6cb7a4a01416a6072429aab3a663fb7c.

<a id="e2521"></a> **E2521** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a6-codex/evidence.json) ; pointer /replays/2 ; SHA-256 f96d79bc0a7241e92602e74bc8f4efbe6cb7a4a01416a6072429aab3a663fb7c.

<a id="e2539"></a> **E2539** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-difficile-a6-codex_3_4690d098df3b.log) ; pointer / ; ligne 36 ; SHA-256 4e6b0a78febc52f0813ee36d1ca52ec02f00c5d2ff160699528f8ff72edbe865.

<a id="e2540"></a> **E2540** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-difficile-a6-codex_3_4690d098df3b.log) ; pointer / ; ligne 79 ; SHA-256 4e6b0a78febc52f0813ee36d1ca52ec02f00c5d2ff160699528f8ff72edbe865.

<a id="e2544"></a> **E2544** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a6-local/request.json) ; pointer / ; SHA-256 e5c12b6bdf4ed071ae29bea3e294b51bc6ac6d7f8f169fb6328c2416cf9a0f61.

<a id="e2545"></a> **E2545** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a6-local/evidence.json) ; pointer / ; SHA-256 91940afa23214f086ed670315b1a9a67d78e09e6926d9f7001a1a1fcab4f729d.

<a id="e2546"></a> **E2546** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a6-local/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e2547"></a> **E2547** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a6-local/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 91940afa23214f086ed670315b1a9a67d78e09e6926d9f7001a1a1fcab4f729d.

<a id="e3011"></a> **E3011** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a6-local/evidence.json) ; pointer /tables/agents/1 ; SHA-256 91940afa23214f086ed670315b1a9a67d78e09e6926d9f7001a1a1fcab4f729d.

<a id="e2548"></a> **E2548** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a6-local/evidence.json) ; pointer /replays/0 ; SHA-256 91940afa23214f086ed670315b1a9a67d78e09e6926d9f7001a1a1fcab4f729d.

<a id="e2556"></a> **E2556** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-difficile-a6-local_1_767baa0ccd99.log) ; pointer / ; ligne 7 ; SHA-256 bdab939ad799579946fa2a52515f2121b13dddce71df8e7a70a19093a654e84d.

<a id="e2557"></a> **E2557** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a6-local/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 91940afa23214f086ed670315b1a9a67d78e09e6926d9f7001a1a1fcab4f729d.

<a id="e3012"></a> **E3012** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a6-local/evidence.json) ; pointer /tables/agents/2 ; SHA-256 91940afa23214f086ed670315b1a9a67d78e09e6926d9f7001a1a1fcab4f729d.

<a id="e2558"></a> **E2558** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a6-local/evidence.json) ; pointer /replays/1 ; SHA-256 91940afa23214f086ed670315b1a9a67d78e09e6926d9f7001a1a1fcab4f729d.

<a id="e2566"></a> **E2566** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-difficile-a6-local_2_fd02649b2318.log) ; pointer / ; ligne 7 ; SHA-256 807aa616acb54497b286729fb601a276ae46830438c548c7821b61a54127e423.

<a id="e2567"></a> **E2567** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a6-local/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 91940afa23214f086ed670315b1a9a67d78e09e6926d9f7001a1a1fcab4f729d.

<a id="e3013"></a> **E3013** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a6-local/evidence.json) ; pointer /tables/agents/3 ; SHA-256 91940afa23214f086ed670315b1a9a67d78e09e6926d9f7001a1a1fcab4f729d.

<a id="e2568"></a> **E2568** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-difficile-a6-local/evidence.json) ; pointer /replays/2 ; SHA-256 91940afa23214f086ed670315b1a9a67d78e09e6926d9f7001a1a1fcab4f729d.

<a id="e2576"></a> **E2576** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-difficile-a6-local_3_44da8700b0bd.log) ; pointer / ; ligne 7 ; SHA-256 2fe66a04808a6685e89dbb32af9c728b87426ee227189ecff1d9b18779d01dc6.

<a id="e2577"></a> **E2577** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/scripts/missions.json) ; pointer /missions/47/mission ; SHA-256 5943ddd0760a9636f8dad6e7395adb2ce9afecf02603abcdc7d2c8019bbd163f.

<a id="e2579"></a> **E2579** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a5-local/request.json) ; pointer / ; SHA-256 2767598bafd1b8eacfc5ad575a39e970a360f38440ed32c28ebef2ea0cc74893.

<a id="e2580"></a> **E2580** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a5-local/evidence.json) ; pointer / ; SHA-256 3c604de87fa30ce99fcd64d1e5609eed12023fd84540844ab10b351f26cc2ab0.

<a id="e2581"></a> **E2581** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a5-local/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e2582"></a> **E2582** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a5-local/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 3c604de87fa30ce99fcd64d1e5609eed12023fd84540844ab10b351f26cc2ab0.

<a id="e3014"></a> **E3014** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a5-local/evidence.json) ; pointer /tables/agents/1 ; SHA-256 3c604de87fa30ce99fcd64d1e5609eed12023fd84540844ab10b351f26cc2ab0.

<a id="e2583"></a> **E2583** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a5-local/evidence.json) ; pointer /replays/0 ; SHA-256 3c604de87fa30ce99fcd64d1e5609eed12023fd84540844ab10b351f26cc2ab0.

<a id="e2586"></a> **E2586** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-tres-complexe-a5-local_1_f7a4ba8fcd33.log) ; pointer / ; ligne 1 ; SHA-256 0ef004b1bc585813415a4b9307c83e3f1cc5df8b449ca8aa03a9a9105541973a.

<a id="e2587"></a> **E2587** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a5-local/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 3c604de87fa30ce99fcd64d1e5609eed12023fd84540844ab10b351f26cc2ab0.

<a id="e3015"></a> **E3015** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a5-local/evidence.json) ; pointer /tables/agents/2 ; SHA-256 3c604de87fa30ce99fcd64d1e5609eed12023fd84540844ab10b351f26cc2ab0.

<a id="e2588"></a> **E2588** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a5-local/evidence.json) ; pointer /replays/1 ; SHA-256 3c604de87fa30ce99fcd64d1e5609eed12023fd84540844ab10b351f26cc2ab0.

<a id="e2591"></a> **E2591** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-tres-complexe-a5-local_2_96ba90ebc265.log) ; pointer / ; ligne 1 ; SHA-256 e54d21865176e1ce88c50487280b8f1d2565c1eb60c8673c3f98cc17c6c3231f.

<a id="e2592"></a> **E2592** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a5-local/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 3c604de87fa30ce99fcd64d1e5609eed12023fd84540844ab10b351f26cc2ab0.

<a id="e3016"></a> **E3016** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a5-local/evidence.json) ; pointer /tables/agents/3 ; SHA-256 3c604de87fa30ce99fcd64d1e5609eed12023fd84540844ab10b351f26cc2ab0.

<a id="e2593"></a> **E2593** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a5-local/evidence.json) ; pointer /replays/2 ; SHA-256 3c604de87fa30ce99fcd64d1e5609eed12023fd84540844ab10b351f26cc2ab0.

<a id="e2596"></a> **E2596** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-tres-complexe-a5-local_3_fec7cf309957.log) ; pointer / ; ligne 1 ; SHA-256 fb7e80b641c4ca28f3df34aec9ed2b9f5e5a423a0c1b04b6d8bba79178d2d43e.

<a id="e2597"></a> **E2597** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a6-local/request.json) ; pointer / ; SHA-256 88b10af84f3394a648b9860a36f249638399a930a378e5b3e565dc0c1a2c5f1c.

<a id="e2598"></a> **E2598** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a6-local/evidence.json) ; pointer / ; SHA-256 d0b735ad716484f5291bed8b3dbadb6889688c40460197fe2c3c41754627a6a6.

<a id="e2599"></a> **E2599** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a6-local/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e2600"></a> **E2600** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a6-local/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 d0b735ad716484f5291bed8b3dbadb6889688c40460197fe2c3c41754627a6a6.

<a id="e3017"></a> **E3017** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a6-local/evidence.json) ; pointer /tables/agents/1 ; SHA-256 d0b735ad716484f5291bed8b3dbadb6889688c40460197fe2c3c41754627a6a6.

<a id="e2601"></a> **E2601** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a6-local/evidence.json) ; pointer /replays/0 ; SHA-256 d0b735ad716484f5291bed8b3dbadb6889688c40460197fe2c3c41754627a6a6.

<a id="e2609"></a> **E2609** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-tres-complexe-a6-local_1_97d17f72f64b.log) ; pointer / ; ligne 7 ; SHA-256 2a325a48c924a7ac9018e62865a6294d0ff25739f6c395de36ae18eb6d56a270.

<a id="e2610"></a> **E2610** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a6-local/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 d0b735ad716484f5291bed8b3dbadb6889688c40460197fe2c3c41754627a6a6.

<a id="e3018"></a> **E3018** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a6-local/evidence.json) ; pointer /tables/agents/2 ; SHA-256 d0b735ad716484f5291bed8b3dbadb6889688c40460197fe2c3c41754627a6a6.

<a id="e2611"></a> **E2611** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a6-local/evidence.json) ; pointer /replays/1 ; SHA-256 d0b735ad716484f5291bed8b3dbadb6889688c40460197fe2c3c41754627a6a6.

<a id="e2619"></a> **E2619** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-tres-complexe-a6-local_2_68e2649ba6b3.log) ; pointer / ; ligne 7 ; SHA-256 c4b9dd0bbfd87bbd39bdd4acae2b2fc584b187aac316e3a58cc4ae7d2a8d10c9.

<a id="e2620"></a> **E2620** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a6-local/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 d0b735ad716484f5291bed8b3dbadb6889688c40460197fe2c3c41754627a6a6.

<a id="e3019"></a> **E3019** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a6-local/evidence.json) ; pointer /tables/agents/3 ; SHA-256 d0b735ad716484f5291bed8b3dbadb6889688c40460197fe2c3c41754627a6a6.

<a id="e2621"></a> **E2621** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a6-local/evidence.json) ; pointer /replays/2 ; SHA-256 d0b735ad716484f5291bed8b3dbadb6889688c40460197fe2c3c41754627a6a6.

<a id="e2629"></a> **E2629** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-tres-complexe-a6-local_3_0db08659c1d7.log) ; pointer / ; ligne 7 ; SHA-256 92de126917fa9926d8f83f68e8c714918f239690b72048aa77683d0ebc02298d.

<a id="e2630"></a> **E2630** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a8-codex/request.json) ; pointer / ; SHA-256 9a6aa36cd81d61b02ddd354e222a395a97a966c3cc4353a7f09d531d5b7ad923.

<a id="e2631"></a> **E2631** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a8-codex/evidence.json) ; pointer / ; SHA-256 22d7e83bfc4edcf38b0c5354b5122803d52bee11c5a19ed232fefac7bffbd616.

<a id="e2632"></a> **E2632** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a8-codex/dispatch-status.json) ; pointer / ; SHA-256 7449fd72551048d79305cb6d97e56f952ddfa0d6c2dd76b4a30d8b7e85a0d337.

<a id="e2633"></a> **E2633** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a8-codex/evidence.json) ; pointer /tables/trinity_worlds/0 ; SHA-256 22d7e83bfc4edcf38b0c5354b5122803d52bee11c5a19ed232fefac7bffbd616.

<a id="e3020"></a> **E3020** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a8-codex/evidence.json) ; pointer /tables/agents/1 ; SHA-256 22d7e83bfc4edcf38b0c5354b5122803d52bee11c5a19ed232fefac7bffbd616.

<a id="e2634"></a> **E2634** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a8-codex/evidence.json) ; pointer /replays/0 ; SHA-256 22d7e83bfc4edcf38b0c5354b5122803d52bee11c5a19ed232fefac7bffbd616.

<a id="e2718"></a> **E2718** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a8-codex/world-1-answer.json) ; pointer / ; SHA-256 72962fee8a1c4fdb52eed75409e681d7f997d91db26a8e1004203910cccc13b9.

<a id="e2720"></a> **E2720** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a8-codex/world-1-solution.cjs) ; pointer / ; SHA-256 8af51dce6f8e8ba398783938a66596701f1789e98f994d35360a1bc1a44e5b79.

<a id="e2684"></a> **E2684** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a8-codex/evidence.json) ; pointer /tables/telemetry_events/54 ; SHA-256 22d7e83bfc4edcf38b0c5354b5122803d52bee11c5a19ed232fefac7bffbd616.

<a id="e2695"></a> **E2695** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-tres-complexe-a8-codex_1_4d9192c2dead.log) ; pointer / ; ligne 51 ; SHA-256 94de76ca0361b2898c9df1feca01cac61bcb4dcb7e9a7d8bfadf79ed71e48592.

<a id="e2696"></a> **E2696** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-tres-complexe-a8-codex_1_4d9192c2dead.log) ; pointer / ; ligne 122 ; SHA-256 94de76ca0361b2898c9df1feca01cac61bcb4dcb7e9a7d8bfadf79ed71e48592.

<a id="e2722"></a> **E2722** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a8-codex/evidence.json) ; pointer /tables/trinity_worlds/1 ; SHA-256 22d7e83bfc4edcf38b0c5354b5122803d52bee11c5a19ed232fefac7bffbd616.

<a id="e3021"></a> **E3021** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a8-codex/evidence.json) ; pointer /tables/agents/2 ; SHA-256 22d7e83bfc4edcf38b0c5354b5122803d52bee11c5a19ed232fefac7bffbd616.

<a id="e2723"></a> **E2723** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a8-codex/evidence.json) ; pointer /replays/1 ; SHA-256 22d7e83bfc4edcf38b0c5354b5122803d52bee11c5a19ed232fefac7bffbd616.

<a id="e2806"></a> **E2806** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a8-codex/world-2-answer.json) ; pointer / ; SHA-256 82fd61b40156abb7fe09b8f96cf496e2bfa73ffb7f517a66ff7c9e26d62e0af9.

<a id="e2808"></a> **E2808** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a8-codex/world-2-solution.cjs) ; pointer / ; SHA-256 aea71c9384872c9a0e95312d1a166aea638805dd2c310f6d4177ff9b9764006a.

<a id="e2773"></a> **E2773** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a8-codex/evidence.json) ; pointer /tables/telemetry_events/113 ; SHA-256 22d7e83bfc4edcf38b0c5354b5122803d52bee11c5a19ed232fefac7bffbd616.

<a id="e2784"></a> **E2784** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-tres-complexe-a8-codex_2_2aacbd359632.log) ; pointer / ; ligne 51 ; SHA-256 af726f49a553b625ea4857c23b82aeb608dae14f4e65cd05b817932bf76f32a1.

<a id="e2785"></a> **E2785** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-tres-complexe-a8-codex_2_2aacbd359632.log) ; pointer / ; ligne 103 ; SHA-256 af726f49a553b625ea4857c23b82aeb608dae14f4e65cd05b817932bf76f32a1.

<a id="e2810"></a> **E2810** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a8-codex/evidence.json) ; pointer /tables/trinity_worlds/2 ; SHA-256 22d7e83bfc4edcf38b0c5354b5122803d52bee11c5a19ed232fefac7bffbd616.

<a id="e3022"></a> **E3022** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a8-codex/evidence.json) ; pointer /tables/agents/3 ; SHA-256 22d7e83bfc4edcf38b0c5354b5122803d52bee11c5a19ed232fefac7bffbd616.

<a id="e2811"></a> **E2811** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a8-codex/evidence.json) ; pointer /replays/2 ; SHA-256 22d7e83bfc4edcf38b0c5354b5122803d52bee11c5a19ed232fefac7bffbd616.

<a id="e2881"></a> **E2881** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a8-codex/world-3-answer.json) ; pointer / ; SHA-256 cd3de52d3a4cb2d39a4025073228a25e48bef0efb596e6364e979329aba9b16d.

<a id="e2883"></a> **E2883** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a8-codex/world-3-solution.cjs) ; pointer / ; SHA-256 1d1613bcd585bbf8ed4f1e974eea6f85bfc988acd21124b0d51d4362a0b5c9d6.

<a id="e2846"></a> **E2846** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/results/exploratory-tres-complexe-a8-codex/evidence.json) ; pointer /tables/telemetry_events/157 ; SHA-256 22d7e83bfc4edcf38b0c5354b5122803d52bee11c5a19ed232fefac7bffbd616.

<a id="e2860"></a> **E2860** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-tres-complexe-a8-codex_3_cdc447466658.log) ; pointer / ; ligne 51 ; SHA-256 224c1108269bfa82a6a34333f45a77a517994863f6d360bbdacde12978e311ac.

<a id="e2861"></a> **E2861** : [fichier](D:/GenOS-Trinity-qualification-20261006-01a1109a/jury-exploratory/runner-logs/worker_qual-20261006-exploratory-tres-complexe-a8-codex_3_cdc447466658.log) ; pointer / ; ligne 108 ; SHA-256 224c1108269bfa82a6a34333f45a77a517994863f6d360bbdacde12978e311ac.
