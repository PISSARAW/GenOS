# Audit de complétude des concepts — inventaire 1 à 7

Revue du 2026-10-12 sur le checkout partagé. Source : inventaire fourni par l'utilisateur, sections 1 à 7, **214 entrées** (19, 46, 18, 38, 24, 29, 40). Une entrée n'est complète que si les cinq colonnes valent **oui**. `I` = implémenté, `V` = vérifié par une exécution avec résultat, `D` = démontré par un scénario rejouable et un résultat observable, `U` = utilisable par une surface raccordée, `Doc` = documenté. `p` signifie partiel, `n` non, `?` preuve non établie ; `o` signifie oui. Un test présent mais non exécuté lors de cette revue n'est pas `V=o`. Un document ou un nom de classe n'est pas une implémentation. Les qualifications historiques sont identifiées comme telles ; elles ne prouvent pas automatiquement l'état du checkout courant. L'audit n'affirme pas l'absence de code par une seule recherche textuelle.

Les sources ci-dessous donnent des ancres vérifiables, référencées dans chaque ligne. Une lettre dans « indice » désigne la source associée ; les limites de la ligne priment sur les affirmations générales de cette source.

| Code | Indices primaires |
|---|---|
| F | [runtime](../01-concepts/runtime-agentique.md), [épistémologie](../01-concepts/epistemologie-et-evidence.md), [workspaces](../02-orchestration/workspaces-contrefactuel.md), [CLI](../../crates/genos-cli/src/main.rs), [snapshot](../../crates/genos-store/src/snapshot.rs#L17), [règle de maturité](statuts-maturite.md#L7). |
| B | [biologie](../01-concepts/biologie-computationnelle.md#L1), [cellule](../../crates/genos-cell/src/lib.rs#L47), [génome](../../crates/genos-genome/src/genome.rs#L26), [embryogenèse](../../crates/genos-biology/src/embryology.rs#L9), [mitose](../../crates/genos-reproduction/src/division.rs#L146), [qualification historique](validation-biologie-computationnelle.md#L1). |
| T | [topologies](../02-orchestration/topologies-et-capacites.md), [biocénose exécutée](missions-live-biocenose-2026-10-04.md), [démonstration Biome](../../examples/biome-mission-demo/run-demo.mjs), [démonstration Holobionte](../../examples/holobionte/run-mission.cjs). |
| A | [AgentDNA](../01-concepts/agent-dna-runtime.md#L1), [format](../../spec/AGENT_DNA_SPEC.md), [modèle](../../crates/genos-dna/src/model.rs#L140), [opérations](../../crates/genos-dna/src/operations.rs#L208), [backend](../../backend/src/services/agentDnaStore.js#L43). |
| E | [épistémologie opérationnelle](../01-concepts/epistemologie-et-evidence.md), [savoir](../01-concepts/savoir-et-epistemologie.md#L1), [kernel](../../backend/src/services/epistemic/verificationKernel.js#L69), [état](../../backend/src/services/epistemics/epistemicStateService.js#L251), [révision](../../backend/src/services/epistemics/epistemicRevisionService.js#L195). |
| C | [taxonomie de la conscience](../01-concepts/conscience-esprit-mental.md#L10), [indicateurs](../01-concepts/indicateurs-fonctionnels.md), [validation historique](reprise-validation-conscience-2026-10-04.md#L1), [AGOW](../02-orchestration/agow.md#L1), [cycle AGOW](../../backend/src/services/agow/workspaceCycleService.js#L53). |
| M | [mémoire](../01-concepts/memoire-et-apprentissage.md#L1), [épisodes](../../backend/src/services/episodicMemoryService.js#L143), [vecteurs](../../backend/src/services/vectorMemoryService.js#L32), [consolidation](../../backend/src/services/sleepCycle.js#L301). |
| S | [communication](../02-orchestration/communication.md#L1), [transport](../../backend/src/services/signalingTransportService.js#L195), [livraison](../../backend/src/services/signalDeliveryService.js#L39), [décision](../../backend/src/services/communication/communicationPolicyEngine.js#L350), [Signal Plane zero-text](../01-concepts/signal-plane-zero-text.md). |
| R | [relations](../02-orchestration/relations-inter-agents.md#L1), [persistance relationnelle](../../backend/src/services/crossAgentRelationalService.js#L156), [G-CIR](../02-orchestration/g-cir.md#L1), [AGOW](../02-orchestration/agow.md#L1), [SHEV](../02-orchestration/shev.md#L1). |

**Exécutions de cette revue.** `node backend/tests/test_agent_dna.js`, `test_epistemics.js`, `test_consciousness_evidence_suite.js`, `test_signal_plane_e2e.js` et `test_agow_completion.js` ont terminé avec code 0 et sorties positives. Ce sont des contrôles de sous-ensembles, pas une démonstration de toutes les propriétés citées ci-dessous. `test_shev_runtime_demo.js` s'est arrêté sur une erreur de permission de `git init` dans le répertoire temporaire du sandbox avant les assertions ; son résultat ne permet ni `V=o` ni un jugement fonctionnel. Les suites globales obligatoires n'ont pas été exécutées par cet agent. Les résultats de `validation-biologie-computationnelle.md` et d'autres bilans cités sont historiques.

### Complément de vérification — 14 octobre 2026

Les correctifs postérieurs à l'inventaire ont ajouté des preuves ciblées pour plusieurs invariants fondateurs : provenance liée au parent (`test_conclusion_provenance_integrity.js` et inspection des consommateurs), approbation liée au digest de promotion (`test_human_approval_promotion_gate.js`), leases mal formés refusés (`test_agent_tool_lease_validation.js`, `test_lease_catalog_coherence.js`, `test_mcp_transport_lease.js`), budgets numériques fail-closed (`test_budget_coherence_edge_cases.js`), synthèse depuis les dossiers et reçus de budget vidangés à l'arrêt (`test_runtime_budget_and_influence.js`), sortie d'apoptose observable et PID non vérifié conservé (`test_apoptosis_and_daemon.js`), modes de snapshots à la restauration (`test_snapshot_mode_bits.js`), base saine de bisection (`test_bisection_blast_radius.js`) et rapport de rollback (`test_bisection_rollback_report.js`). Ces cas ne couvrent toujours pas toutes les surfaces ni une mission métier complète; les codes `p` de la matrice ne deviennent donc pas `o` par défaut.

Le contrôle qualité du 14 octobre a inspecté 6 108 fichiers et signalé neuf violations du baseline, zéro nouvelle. Les suites racine `npm test` et `cargo test --workspace` n'ont pas été relancées : `backend/genos.db` occupe 1 926 664 192 octets et le disque C: disposait de 836 784 128 octets libres au dernier contrôle. Ce complément ne remplace pas les gates globaux.

Les contrôles ciblés du rejeu de stratégie ont ensuite confirmé le refus sans
reçu (`test_promotion_gate.js`), le refus des déclarations d'appelant et l'échec
fermé d'une phase partielle (`test_strategy_replay_stage_wiring.js`). La suite
`test_strategy_promotion_policies.js` passe aussi hors du bac à sable Windows,
où son workspace temporaire n'est pas accessible à `realpath`. Ces résultats
valident les refus et le raccord de phase ; ils ne démontrent toujours pas le
rejeu intégral du run. L'ADR 0480 formalise cette limite et les conditions
nécessaires à un futur reçu lié au run.

Les corrections de rollout du 14 octobre couvrent également le raccord du SLO
configuré, l'autorité et le reçu des overrides de production, la sérialisation
des mesures avec la décision et la sélection effective du candidat en A/B
(`test_release_operations.js`, `test_release_force_promotion_permission.js`,
`test_release_promotion_truthfulness.js`; ADR 0481 à 0484). L'identité candidate
personnalisée est désormais explicite et indépendante de l'ordre des variantes.
La création du rollout et de ses compteurs est couverte par une preuve
d'annulation transactionnelle; les métriques invalides et échantillons de
comparaison incomplets sont aussi refusés (ADR 0485).
Ces contrôles qualifient ce
parcours de release et ne démontrent pas la couverture de tous les gates de
promotion.

## 1. Principes fondateurs — 19 entrées

| Concept | I | V | D | U | Doc | Indice et lacune décisive |
|---|:---:|:---:|:---:|:---:|:---:|---|
| Runtime d’agents reproductible et supervisé | p | p | p | o | o | F ; superviseur et deadlines Node présents, mais le budget CPU n'est pas appliqué par le runtime worker et la reproductibilité globale n'est pas démontrée. |
| État versionné | o | p | p | o | o | F ; snapshots et révisions; `bestKnownResultService` scope les résultats au workspace, vérifie le pointeur champion, compare toutes les dépendances, refuse la réutilisation sans reçu valide, écrit sous transaction, propage les erreurs SQL, scope invalidation/réfutation et exécute la migration une seule fois par connexion (`test_request_memory_routing.js`, ADR 0493–0495, 0497, 0499–0503). La qualification complète des snapshots reste ouverte. |
| Exécution contrefactuelle | o | p | p | p | o | F ; fork/snapshot accessibles, contre-épreuve complète non prouvée ici. |
| Branches, forks, snapshots, diffs et replay | p | p | p | p | o | F ; `diff_and_replay` appelle les deux opérations et échoue si l'une manque, mais aucun producteur ne rejoue le run complet ni n'émet le reçu exigé par `require_replay` (ADR 0480). |
| Preuve avant promotion | o | p | p | o | o | E ; `bestKnownResultService` refuse les statuts provisoires, exige un reçu signé indépendant lié au contenu, à l'évidence, aux dépendances et au workspace, puis le revalide avant toute réutilisation (`test_request_memory_routing.js`, ADR 0492, 0496, 0500). Ce reçu local ne démontre pas un rejeu ni la couverture des autres promotions. |
| Distinction entre succès technique et vérité | o | p | p | o | o | E/S ; `test_conclusion_provenance_integrity.js` (30 vérifications) rejette les conclusions sans évidence et garde `genos_blame`/`genos_lineage` en échec quand la réponse ne contient aucune preuve. Contrôles ciblés, pas une garantie de vérité des contenus. |
| Falsifiabilité et contre-exemples | p | p | p | p | o | E ; la mémoire de requête exige maintenant un contre-exemple structuré et un reçu indépendant signé qui lie le contre-exemple au résultat et au workspace (`test_request_memory_routing.js`, ADR 0497). La falsifiabilité n'est toujours pas appliquée à toute affirmation ni tout circuit. |
| Provenance | o | p | p | o | o | E/A ; `test_conclusion_provenance_integrity.js` vérifie mutations Merkle, parents manquants ou réattribués, liaison décision/mémoire, troncature de trace, cycle lineage borné à 1 000 éléments et scope workspace de `genos_blame`/`genos_lineage` (ADR 0488, 0489). La chaîne complète reste dépendante du circuit et de ses sources. |
| Reçus vérifiables | p | p | p | p | o | B/E ; plusieurs schémas, vérification et clés selon parcours. |
| Décisions bornées | p | p | p | p | o | F/S ; contrats bornés, enforcement non universel. |
| Autorité explicite | p | p | p | p | o | F/B ; `genos_synaptic_prune_scale` exige le demandeur authentifié sur les dispatches registre, bio et transport local, puis borne les deux extrémités au workspace (test `test_synaptic_integrity.js`, ADR 0490). Les autorités des autres circuits restent à qualifier. |
| Leases d’outils | o | p | p | o | o | [référence MCP](../03-reference/outils-mcp.md) ; tests courants du parseur fail-closed, de la cohérence catalogue/routes et du prédicat de transport passent (`test_agent_tool_lease_validation.js`, `test_lease_catalog_coherence.js`, `test_mcp_transport_lease.js`). Ils ne démontrent pas une exécution réelle de chaque outil sous lease ni le cycle complet d'expiration/révocation. |
| Budgets de tokens, temps, CPU, spawn et délégation | p | p | p | p | o | F/B ; Node borne tokens et délai via `workerRuntimeLimitsService` et le timer `latencyMs` (`test_runtime_budget_and_influence.js`, `test_runtime_billable_budget.js`, `test_worker_native_lifecycle.js`); les essais natifs bornent les essais de procédure (`test_worker_native_boundaries.js`). `test_bounded_worker_delegation.js` vérifie cumul tokens/enfants, concurrence, rollback et plafonds pour `sub_orchestrator`. Aucun compteur n'applique `maxCpuMs` côté Node ni `resources.cpu_ms/time_ms` dans le worker Rust; les essais ne bornent pas les tours généraux et la délégation n'est pas qualifiée dans toutes les topologies. |
| Isolation des workspaces | p | p | p | o | o | E/F ; tests ciblés refusent les lectures MCP inter-workspace (ADR 0489) et les arêtes d'inhibition inter-projet (`test_synaptic_integrity.js`, ADR 0491). Provisionnement et isolement inter-processus courant à qualifier. |
| Garde-fou fail-closed | p | p | p | p | o | E/S ; gardes locaux, universalisme non prouvé. |
| Évidence indépendante | p | p | p | p | o | E ; vérificateurs dédiés, indépendance effective dépend du scénario. |
| Promotion, rejet, quarantaine et escalade | p | p | p | p | o | E ; quatre issues réparties entre services, chaîne commune non démontrée. |
| Résilience et récupération | p | p | p | p | o | F/B ; reprise attestée pour certains circuits, pas tout le runtime. |
| Séparation entre concept, métaphore biologique et capacité réellement implémentée | p | ? | n | p | o | [biologie](../01-concepts/biologie-computationnelle.md#L12) et C ; discipline documentaire, pas un mécanisme global testable. |

## 2. Biologie computationnelle et modèle biomimétique — 46 entrées

| Concept | I | V | D | U | Doc | Indice et lacune décisive |
|---|:---:|:---:|:---:|:---:|:---:|---|
| Cellule computationnelle | o | p | p | o | o | B ; cellule Rust et reçus historiques, scénario actuel non rejoué. |
| Organisme procédural | p | p | p | p | o | [fiche](../01-concepts/procedural-organism.md) ; graphe et contraintes, usage général non établi. |
| Agent comme cellule spécialisée | p | p | p | p | o | B ; mapping de rôles, pas tous workers backend. |
| Génome | o | p | p | o | o | B/A ; modèle et sélection existants, qualifications partielles. |
| Épigénétique | o | p | p | p | o | [gènes](../../crates/genos-genome/src/gene.rs#L7) ; règle de méthylation, impact mission non prouvé. |
| Chromatine | o | p | p | p | o | [état chromatinien](../../crates/genos-genome/src/gene.rs#L7) ; gating local. |
| Gènes | o | p | p | o | o | [type Gene](../../crates/genos-genome/src/gene.rs#L65) ; semantics par locus. |
| Expression génétique | o | p | p | p | o | A ; phénotype calculé, effet aval selon parcours. |
| Mutation | o | p | p | o | o | A ; opération exposée, résultat campagne évolutive inconnu. |
| Stabilité génomique | p | p | ? | p | o | B/A ; validations et fingerprint, stabilité longitudinale non qualifiée. |
| Phénotype | o | p | p | o | o | A ; sélection backend, effet sur worker selon mission. |
| Différenciation cellulaire | o | p | p | p | o | [différenciation](../../crates/genos-biology/src/embryology.rs#L50) ; branche Rust seulement. |
| Dé-différenciation | p | p | ? | p | o | [ontogenèse](../01-concepts/ontogenese.md) ; mécanisme ciblé, résultat opératoire non isolé. |
| Embryogenèse | o | p | p | p | o | [programme](../../crates/genos-genome/src/development.rs#L55) ; entrée orchestrateur Rust spécifique. |
| Ontogenèse | p | p | p | p | o | [boucle](../02-orchestration/ontogenese-boucle.md) ; continuité projet, effet longitudinal non démontré ici. |
| HOX | o | p | p | p | o | [seed HOX](../../crates/genos-biology/src/embryology.rs#L9) ; rôles déterministes, analogie bornée. |
| Morphogenèse | p | p | p | p | o | [qualification](morphogenese-gates-2026-09-26.md) ; gates et variantes, non générale. |
| Méristème | p | p | ? | p | o | [fiche](../02-orchestration/meristeme-epistemique.md) ; effet de croissance qualifié absent. |
| Cambium | p | p | ? | p | o | [fiche](../02-orchestration/cambium-contre-exemples.md) ; adaptation spécialisée. |
| Niche | o | p | p | p | o | [Biome](../02-orchestration/topologies/biome.md) ; allocation de niches, résultat lié à mission partiel. |
| Métabolisme computationnel | p | p | p | p | o | [ATP Rust](../../crates/genos-orchestrator/src/metabolism.rs#L20) ; registres Node et Rust distincts (B). |
| Homéostasie | p | p | p | p | o | B ; autorité persistée historique, pas d'unification de ressources. |
| Interoception | p | p | ? | p | o | [organes](../01-concepts/organes-vitaux-agents.md) ; métriques de runtime, validité fonctionnelle non établie. |
| Sensorium | p | p | ? | p | o | [sens animaux](../01-concepts/biomimetisme/sens-animaux.md) ; adaptateurs, portée de perception limitée. |
| Organes vitaux | p | p | ? | p | o | [fiche](../01-concepts/organes-vitaux-agents.md) ; services distincts, survie globale non démontrée. |
| Systèmes de survie | p | p | ? | p | o | [architecture](../02-orchestration/architecture-survie.md) ; politiques locales, qualification intégrée absente. |
| Régénération | p | p | p | p | o | [Axolotl](../01-concepts/biomimetisme/axolotl.md) ; récupération logicielle bornée. |
| Apoptose contrôlée | p | p | ? | p | o | B ; élimination/arrêt logiciels, pas de preuve générale sur missions. |
| Cryptobiose | o | p | ? | p | o | [store](../../crates/genos-store/src/cryptobiosis.rs) ; persistance locale, restauration E2E à qualifier. |
| Dormance | p | p | ? | p | o | [cryptobiose](../../crates/genos-store/src/cryptobiosis.rs) ; état opérationnel selon composant. |
| Reproduction | p | p | p | p | o | [reproduction](../02-orchestration/reproduction-et-replication.md) ; plusieurs opérateurs, pipeline général non établi. |
| Réplication | p | p | ? | p | o | B ; copie/lignée logicielle, réplication indépendante de résultats à distinguer. |
| Mitose | o | p | p | p | o | [mitose](../../crates/genos-reproduction/src/division.rs#L146) ; attestée localement, mission spécifique. |
| Bourgeonnement | o | p | ? | p | o | [division](../../crates/genos-reproduction/src/division.rs) ; opérateur local, usage en mission non établi. |
| Méiose | o | p | ? | p | o | [crossover](../../crates/genos-reproduction/src/crossover.rs#L7) ; opérateur local. |
| Clonage | o | p | ? | o | o | A ; CLI/API de génome, scénario rejoué non observé ici. |
| Fossilisation | p | p | ? | p | o | [fiche](../01-concepts/fossilisation.md) ; stockage de traces, exploitation future non prouvée. |
| Hérédité | p | p | p | p | o | A/B ; lignées et copie, transfert effectif sur plusieurs générations à qualifier. |
| Symbiose | p | p | p | p | o | [Holobionte](../02-orchestration/topologies/holobionte.md) ; contrat logiciel, effet causal limité. |
| Hôte et symbionte | o | p | p | p | o | [démo](../../examples/holobionte/run-mission.cjs) ; démonstration présente, résultat actuel non rejoué. |
| Biocénose | o | p | o | o | o | T ; missions live datées et artefacts, validité limitée aux scénarios documentés. |
| Biome | o | p | p | o | o | T ; démo exécutable, sortie actuelle non recueillie. |
| Holobionte | o | p | p | o | o | T ; démo exécutable, sortie actuelle non recueillie. |
| Rhizome | o | p | p | o | o | [topologie](../02-orchestration/topologies/rhizome.md) ; tests nombreux, démonstration courante absente. |
| Métapopulation | o | p | p | o | o | [topologie](../02-orchestration/topologies/metapopulation.md) ; isolation partielle, démonstration courante absente. |
| Écosystème agentique | p | p | p | p | o | B/T ; agrégat de topologies, pas de qualification globale. |

## 3. AgentDNA et génome — 18 entrées

| Concept | I | V | D | U | Doc | Indice et lacune décisive |
|---|:---:|:---:|:---:|:---:|:---:|---|
| `AgentDNA` | o | o | p | o | o | A ; `test_agent_dna.js` exécuté, scénario CLI complet non rejoué. |
| `AgentGenome` | o | p | p | o | o | [spec](../../spec/GENOME_SPEC.md) ; manifeste distinct de l'ADN binaire. |
| Identité héréditaire | o | p | p | o | o | A ; identifiants/parents, continuité multigénérationnelle non rejouée. |
| Versioning | o | p | p | o | o | A ; version de conteneur, migration entre versions à qualifier. |
| Fingerprint | o | p | p | o | o | A ; hash canonique, preuve de vérification ciblée non relancée. |
| Canonicalisation | o | p | p | p | o | [format](../../spec/AGENT_DNA_SPEC.md) ; règles codées, compatibilité croisée incomplète. |
| Signature | p | p | p | p | o | A ; Ed25519 vérifiable, signature non requise par défaut pour tous tenants. |
| Sections `META`, `CHRM`, `CHRP`, `XCHR`, `GENE`, `PLAS`, `ENHA`, `SCAR`, `PHEN`, `PROV`, `SIGN` | p | p | p | p | o | A ; ensemble composite, émission/lecture de chaque section non rejouées. |
| Expression ADN → phénotype | o | o | p | o | o | A ; test d'expression exécuté, décision worker non isolée. |
| Spéciation | o | p | p | o | o | [opération](../../crates/genos-dna/src/operations.rs#L218) ; création de candidat, promotion conditionnelle. |
| Graft | o | p | p | o | o | [opération](../../crates/genos-dna/src/operations.rs#L208) ; effet de capacité sur mission non prouvé. |
| Leurres (`decoy`) | o | p | ? | o | o | A ; opération disponible, sûreté/usage réel non démontrés. |
| Migration JSON legacy | p | p | ? | p | o | A ; compatibilité déclarée, matrice de vieux formats non prouvée. |
| Compatibilité de versions | p | p | ? | p | o | A ; format v1, qualification multi-version absente. |
| Scellement `DRAFT → SEALED` | p | p | ? | p | o | A ; statut/gates, verrouillage universel non établi. |
| Graphe d’organisme procédural | p | p | ? | p | o | [fiche](../01-concepts/procedural-organism.md) ; graphe local, liaison ADN-mission partielle. |
| Immutabilité | p | p | p | p | o | A/B ; blobs/reçus figés selon circuit, pas toute donnée dérivée. |
| Provenance génomique | o | p | p | o | o | A ; champs parents/opérations, chaîne complète non rejouée. |

## 4. Épistémologie et évidence — 38 entrées

| Concept | I | V | D | U | Doc | Indice et lacune décisive |
|---|:---:|:---:|:---:|:---:|:---:|---|
| Épistémologie opérationnelle | p | p | p | p | o | E ; faisceau de services, pas de validation uniforme. |
| Savoir | p | p | ? | p | o | E ; état inféré de preuves bornées, pas de garantie de vérité. |
| Croyance | o | p | ? | p | o | E ; état enregistré/révisé, fondement variable. |
| Vérité | p | p | ? | p | o | E ; verdicts de vérificateur bornés, pas oracle universel. |
| Inférence | p | p | ? | p | o | [savoir](../01-concepts/savoir-et-epistemologie.md#L3) ; adaptateurs logiques locaux sans action générale. |
| Justification | p | p | ? | p | o | E ; liens de preuve, suffisance conditionnelle. |
| Gettier | n | ? | n | n | o | [savoir](../01-concepts/savoir-et-epistemologie.md#L52) ; problème philosophique, aucun mécanisme spécifique établi. |
| Reliabilisme | p | p | ? | p | o | E ; confiance des vérificateurs, fiabilité empirique non calibrée. |
| Épistémologie sociale | p | p | ? | p | o | E ; agrégation d'avis, indépendance réelle non garantie. |
| Corroboration | p | p | ? | p | o | E ; recoupement de sources, qualité de source dépendante du cas. |
| Incertitude | o | p | p | p | o | E ; état explicite, calibration extérieure manquante. |
| Confiance | o | p | p | p | o | E ; score/état, calibration et validité à distinguer. |
| Claim | o | p | p | o | o | E ; contrats et ledger, résultat selon vérificateur. |
| Hypothèse | o | p | p | p | o | E ; hypothèses persistées, usage autonome non uniforme. |
| Ledger d’hypothèses | o | p | p | p | o | E ; stockage/retrieval, preuve de cycle complet non relancée. |
| Prédiction | p | p | ? | p | o | E ; prédictions locales, scoring futur non général. |
| Falsification | p | p | p | p | o | E ; contre-épreuves spécialisées, pas toute claim. |
| Contre-exemple | o | p | p | p | o | E ; objet et propagation, diversité des domaines inégale. |
| Preuve directe | p | p | p | p | o | E ; attestation liée au vérificateur, validité du sujet variable. |
| Preuve indépendante | p | p | p | p | o | E ; isolation de certains oracles, indépendance de toutes sources inconnue. |
| Réplication | p | p | ? | p | o | E ; contrats/runners, campagne réservée non exécutée (C). |
| Réception de preuve | o | p | p | o | o | E ; ingress et reçus, confiance selon origine. |
| Provenance | o | p | p | o | o | E ; source et digest, chaîne complète par parcours. |
| Grounding | p | p | p | p | o | [service](../../backend/src/services/communication/groundingService.js#L106) ; ACK gradués, action réelle non toujours attestée. |
| État épistémique | o | p | p | p | o | [service](../../backend/src/services/epistemics/epistemicStateService.js#L251) ; état local, portée transversale partielle. |
| Résultat formel | p | p | ? | p | o | E ; adaptateurs bornés et Lean ciblé, pas preuve générale. |
| Résultat non vérifié | o | p | p | o | o | E ; statut explicite, consommateur à contrôler. |
| Promotion éligible ou non éligible | o | p | p | o | o | E ; booléen et gates, chemins multiples. |
| Révision de croyance | o | p | p | p | o | [révision](../../backend/src/services/epistemics/epistemicRevisionService.js#L195) ; changement causal en mission non démontré. |
| Dissonance | p | p | ? | p | o | E ; score de conflit, interprétation cognitive non validée. |
| Biais | p | p | ? | p | o | E ; contrôles particuliers, mesure générale impossible à conclure. |
| Hallucination | p | p | ? | p | o | E ; détecteurs de placeholders/claims, non toutes hallucinations. |
| Monitoring des hallucinations | p | p | ? | p | o | [test exécuté](../../backend/tests/test_epistemics.js) ; filtrage de motifs et perception, détection exhaustive non prouvée. |
| Brier score | o | p | p | p | o | [Biocénose](../02-orchestration/topologies/biocenose.md) ; calcul disponible, calibration prospective à établir. |
| Consensus pondéré | o | p | p | p | o | E/T ; agrégation, indépendance et vérité des votants non garanties. |
| Quorum avec abstention | o | p | p | p | o | E/T ; politique implémentée, issue métier selon topologie. |
| Barrière d’évidence | o | p | p | o | o | E ; refus sur preuve insuffisante, parcours réels à qualifier séparément. |
| Gate de promotion | o | p | p | o | o | E ; accès de promotion conditionnel, toutes surfaces non auditées. |

## 5. Cognition, conscience et mental — 24 entrées

La [taxonomie](../01-concepts/conscience-esprit-mental.md#L23) classe explicitement les notions phénoménales en `reference_only`. Les indicateurs logiciels ne prouvent aucune expérience subjective. Le test de la suite d'évidence exécuté ici vérifie ses **gates**, pas la conscience.

| Concept | I | V | D | U | Doc | Indice et lacune décisive |
|---|:---:|:---:|:---:|:---:|:---:|---|
| Esprit | n | ? | n | n | o | C ; notion philosophique `reference_only`. |
| Mental | n | ? | n | n | o | C ; notion philosophique `reference_only`. |
| Conscience | n | ? | n | n | o | C ; aucune preuve d'expérience subjective. |
| Conscience opérationnelle | p | p | ? | p | o | C ; indicateurs de fonctionnement, propriété scientifique non qualifiée. |
| Conscience fonctionnelle | p | p | ? | p | o | C ; instrumentation, campagne causale réservée non réalisée. |
| Qualia | n | ? | n | n | o | C ; explicitement `reference_only`. |
| Intentionnalité | n | ? | n | n | o | C ; représentation philosophique non établie par les rapports. |
| Supervenience | n | ? | n | n | o | C ; relation métaphysique non testée. |
| Émergence | n | ? | n | n | o | C ; revendication scientifique non démontrée. |
| Attention | p | p | p | p | o | C ; sélection AGOW, effet attentionnel causal inconnu. |
| Perception | p | p | p | p | o | C ; boucle d'entrée AGOW, ancrage environnemental limité. |
| Interoception | p | p | ? | p | o | C/B ; signaux internes, portée cognitive non validée. |
| Imagination | p | p | ? | p | o | [simulation](../01-concepts/imagination-et-simulation.md) ; candidat logiciel, bénéfice causal inconnu. |
| Simulation interne | p | p | p | p | o | C ; shadow workspace isolé, résultat de mission non prouvé. |
| Réflexion | p | p | ? | p | o | C ; rapports/retours, fiabilité non qualifiée. |
| Métacognition | p | p | ? | p | o | C ; auto-évaluation fonctionnelle, qualité de jugement inconnue. |
| Modèle du soi | p | p | ? | p | o | C ; état logiciel borné, aucun soi phénoménal. |
| Théorie du soi de l’orchestrateur | p | p | ? | p | o | [fiche](../02-orchestration/theorie-du-soi-orchestrator.md) ; hypothèses internes, validation longitudinale absente. |
| Calibration | p | p | ? | p | o | C/E ; métriques et scores, calibration externe à établir. |
| Dissonance cognitive | p | p | ? | p | o | C/E ; contradiction enregistrée, signification cognitive non prouvée. |
| Mémoire autobiographique | o | p | p | p | o | [fiche](../02-orchestration/memoire-autobiographique.md) ; stockage/rappel, effet sur planification partiel. |
| Indicateurs fonctionnels de conscience | o | o | p | p | o | C ; suite de gates exécutée, aucun indicateur validé causalement. |
| États de conscience | p | p | ? | p | o | C ; profils logiciels, pas états subjectifs. |
| Limites entre métrique fonctionnelle et expérience subjective | p | ? | n | p | o | C ; frontière documentaire explicite, pas propriété runtime démontrable. |

## 6. Mémoire, apprentissage et plasticité — 29 entrées

| Concept | I | V | D | U | Doc | Indice et lacune décisive |
|---|:---:|:---:|:---:|:---:|:---:|---|
| Mémoire de travail | p | p | ? | p | o | M ; workspace/état temporaire, durée et causalité non établies. |
| Mémoire épisodique | o | p | p | o | o | [service](../../backend/src/services/episodicMemoryService.js#L143) ; enregistrement/rappel, effet mission non rejoué. |
| Mémoire sémantique | p | p | ? | p | o | M ; faits indexés, vérité des contenus variable. |
| Mémoire procédurale | p | p | p | p | o | M ; recettes/trajectoires, réemploi concret selon circuit. |
| Mémoire ancestrale | p | p | ? | p | o | M/A ; héritage, consommation au spawn partielle. |
| Mémoire autobiographique | o | p | p | p | o | M/C ; épisodes et rappel, valeur causale non démontrée. |
| Mémoire immunitaire | o | p | p | p | o | [fiche](../01-concepts/adaptive-epistemic-immune-system.md) ; mémoire de refus, généralisation non prouvée. |
| Mémoire culturelle | p | p | ? | p | o | [métapopulation](../02-orchestration/topologies/metapopulation.md) ; partage local, effet intergénérationnel non démontré. |
| Vector search | o | p | p | o | o | [service](../../backend/src/services/vectorMemoryService.js#L32) ; résultats selon backend/embeddings. |
| Graph memory | p | p | ? | p | o | M ; liens persistés, parcours causal/utilisation inégaux. |
| Retrieval | o | p | p | o | o | M ; récupération exposée, pertinence empirique à mesurer. |
| Consolidation | o | p | p | p | o | [sleep cycle](../../backend/src/services/sleepCycle.js#L301) ; prune/merge, amélioration non démontrée. |
| Oubli | o | p | p | p | o | M ; decay/pruning, politique de rétention selon source. |
| STDP | p | p | ? | p | o | [plasticité](../01-concepts/neurobiologie-et-plasticite.md) ; heuristique inspirée des synapses. |
| Plasticité synaptique | p | p | ? | p | o | M ; poids modifiés, effet aval indépendant inconnu. |
| Plasticité dendritique | p | p | ? | p | o | [plasticité](../01-concepts/neurobiologie-et-plasticite.md) ; primitive spécialisée, usage réel à qualifier. |
| Plasticité locale | p | p | ? | p | o | M ; adaptation de poids/route, gains non établis. |
| Plasticité collective | p | p | ? | p | o | M/T ; apprentissage inter-agents, gains longitudinaux non établis. |
| Adaptation | p | p | ? | p | o | M ; plusieurs politiques, généralisation non démontrée. |
| Apprentissage | p | p | p | p | o | M ; écriture/réutilisation locales, amélioration empirique non conclue. |
| Lacune d’apprentissage | p | p | ? | p | o | [fiche](../02-orchestration/lacunes-apprentissage-gvx.md) ; détecteur, correction réelle non attestée. |
| Transmission | p | p | ? | p | o | M/T ; mécanismes spécifiques, acquisition vérifiée non générale. |
| Teaching worker | p | p | ? | p | o | [A-Team](../02-orchestration/topologies/a-team-apprentissage.md) ; rôle/contrat, effet pédagogique non validé. |
| Compilation de mémoire | p | p | ? | p | o | M ; synthèse de traces, fidélité et utilité à vérifier. |
| Fossilisation stratigraphique | p | p | ? | p | o | [fiche](../01-concepts/fossilisation.md) ; conservation de couches, réusage non démontré. |
| Héritage de risque | p | p | ? | p | o | M/A ; métadonnées de risque, évitement effectif non mesuré. |
| Infini sous contrat | p | p | ? | p | o | [fiche](../02-orchestration/infini-sous-contrat.md) ; boucle bornée par contrat, horizon infini non démontrable. |
| Self-Twin causal | p | p | ? | p | o | M ; simulation/jumeau local, identification causale indépendante absente. |
| Réutilisation de résultats | p | p | p | p | o | M ; cache/mémoire disponible, preuve de pertinence par tâche manquante. |

## 7. Coordination et intelligence collective — 40 entrées

| Concept | I | V | D | U | Doc | Indice et lacune décisive |
|---|:---:|:---:|:---:|:---:|:---:|---|
| Intelligence de nuée | p | p | ? | p | o | [fiche](../01-concepts/intelligence-de-nuee.md) ; comportements locaux, gain collectif non prouvé. |
| Phéromones | o | p | p | o | o | [champ](../../crates/genos-signal/src/stigmergy.rs#L62) ; dépôt/évaporation logiciels. |
| Stigmergie | o | p | p | o | o | S ; pont inter-processus limité, comparaison de mission absente. |
| Signaux | o | o | p | o | o | S ; E2E exécuté, vérité de l'action destinataire distincte. |
| Bus de signalisation | o | o | p | o | o | S ; diffusion/récepteur exécutés, qualification distribuée non faite. |
| Signal Plane | o | o | p | o | o | S ; E2E courant positif, mission live distincte requise. |
| Signal Plane zero-text | p | p | p | p | o | S ; transport local, absence de texte ne prouve pas décision. |
| Ligand/récepteur | o | o | p | o | o | S ; dispatch E2E exécuté, analogie biologique uniquement. |
| Récepteurs | o | o | p | o | o | S ; service et autorité, effet métier dépend du handler. |
| Boîte de réception | o | o | p | o | o | S ; livraison/poll/lecture testés. |
| ACK | o | o | p | o | o | S ; ACK de livraison testé, pas de succès du travail. |
| Coalescing | o | o | p | o | o | S ; cas E2E exécuté, optimisation empirique inconnue. |
| EventBus | o | p | ? | p | o | [service](../../backend/src/services/signalEventBus.js) ; bus local, qualification de persistance non établie. |
| Communication zero-text | p | p | p | p | o | S ; encodages déterministes, économie effective partielle. |
| Communication shadow | p | p | ? | p | o | S ; journaux de décision, comparaison causale manquante. |
| Grounding communicationnel | p | p | p | p | o | [service](../../backend/src/services/communication/groundingService.js#L106) ; ACK étagés, preuve d'action indépendante variable. |
| Coût de communication | p | p | ? | p | o | S ; projection heuristique, consommation fournisseur conditionnelle. |
| Consensus | p | p | p | p | o | S/T ; plusieurs algorithmes, vérité des sorties non garantie. |
| Quorum | o | p | p | p | o | T ; politique bornée, effet sur mission selon topologie. |
| Flocking | p | p | ? | p | o | [nuée](../01-concepts/intelligence-de-nuee.md) ; simulation/heuristique, gain réel non établi. |
| Polyéthisme dynamique | p | p | ? | p | o | [nuée](../01-concepts/intelligence-de-nuee.md) ; allocation de rôles, adaptation mesurée absente. |
| Silence de réseau | p | p | ? | p | o | S ; suppression de messages, conditions de sûreté globales à établir. |
| Compétition | p | p | ? | p | o | T ; arbitrage local, bénéfice comparatif non établi. |
| Arena | p | p | p | p | o | [test](../../backend/tests/test_arena_trace_authz.js) ; exécution de branches, résultat terrain non recueilli ici. |
| Handoff | p | p | p | p | o | [A-Team](../02-orchestration/topologies/a-team.md) ; contrats/receipts, continuité par parcours. |
| Liaison | p | p | ? | p | o | R ; arête persistée, sémantique d'exécution partielle. |
| Relations inter-agents | p | p | p | p | o | R ; 29 types persistés, effets runtime majoritairement non appliqués. |
| Physiologie relationnelle | p | p | ? | p | o | [fiche](../02-orchestration/physiologie-relationnelle.md) ; mesures heuristiques, qualification scientifique absente. |
| Parenté et filtrage du routage | p | p | ? | p | o | R ; filtres locaux, enforcement transversal non prouvé. |
| Autorité de routage | p | p | ? | p | o | R ; restrictions locales, hiérarchie commune non établie. |
| Graphe de relations | o | p | p | p | o | [création](../../backend/src/services/crossAgentRelationalService.js#L156) ; lecture/persistance, inférence sociale limitée. |
| Graphe G-CIR | p | p | ? | p | o | [G-CIR](../02-orchestration/g-cir.md) ; graphe Omega local, compilation de toute mission absente. |
| Registre d’obligations | p | p | ? | p | o | [G-CIR](../02-orchestration/g-cir.md) ; obligation locale, fermeture générale non démontrée. |
| G-CIR | p | p | p | p | o | R ; noyau Omega local, intégration générale incomplète. |
| AGOW | p | o | p | p | o | C/R ; test de complétion SQLite exécuté, causalité cognitive non démontrée. |
| SHEV | p | ? | p | p | o | R ; runtime documenté ; démo courante arrêtée par permission `git init` avant assertion. |
| Responsabilité persistante | p | ? | p | p | o | R ; mandat SHEV, qualification de terrain absente. |
| Initiative | p | ? | p | p | o | R ; génération conditionnelle, effet durable non démontré. |
| Observation qualifiée | p | ? | p | p | o | R ; validation/fraîcheur déclarées, preuve terrain absente. |
| Effet vérifié sur le projet | p | ? | p | p | o | R ; adaptateurs de mesure, qualification causale de terrain absente. |

## Synthèse de décision

Aucune des 214 entrées ne reçoit cinq `o` sur les seules preuves rassemblées ici. Cela **ne signifie pas** que chaque mécanisme est absent : beaucoup sont implémentés et accessibles, et plusieurs tests ciblés passent. Le principal manque pour la complétude stricte est un scénario distinct des tests, rejoué avec résultat observable, puis relié à l'effet métier attendu. Les concepts philosophiques de conscience, Gettier et émergence ne peuvent être promus comme capacités logicielles par une taxonomie ou un score. Pour SHEV, le blocage de permission du répertoire temporaire laisse la vérification courante indéterminée. Les changements de code préexistants dans le checkout partagé ne sont pas attribués à cet audit.
