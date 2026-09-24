# Types de workers GenOS

- **Statut** : Partiel — les 19 types ont des contrats backend et des validateurs d’artefacts typés ; le dispatch imbriqué du sous-orchestrateur reste désactivé.
- **Portée** : `genos-worker`, registre Node des phénotypes et vocabulaire des rôles de mission.
- **Dernière revue** : 2026-09-24

Ce document fixe le vocabulaire de référence à partir de l’ADR [0043](../adr/0043-runtime-worker-phenotypes.md) et du type Rust `WorkerKind`. Il sépare les types de worker des profils d’autorité Node, des rôles de mission et des exécuteurs. La présence dans ce catalogue ne signifie pas qu’un type est raccordé de bout en bout.

## Familles et types canoniques

Les identifiants canoniques sont les noms runtime en `snake_case` retournés par `WorkerKind::name()`. Les familles sont celles de `family_of()`.

| Famille | Identifiant | Responsabilité portée par le preset Rust |
|---|---|---|
| Sensorielle | `scout_cell` | Observation ponctuelle, lecture seule, dossier `scout_observation`, une itération. |
| Sensorielle | `resident_daemon` | Observation résidente, sondes sûres et signalement des découvertes. |
| Exécution | `bounded_worker` | Exécution bornée avec lease d’outils, sans spawn. |
| Exécution | `adaptive_worker` | Exécution avec changements locaux de stratégie plafonnés. |
| Exécution | `specialist` | Adaptation locale dans une niche déclarée. |
| Exécution | `procedural_executor` | Exécution déterministe, lease solver, budget de tokens nul. |
| Exécution | `symbiotic_worker` | Hôte procédural dont les capacités sont ajoutées au contrat. |
| Épistémique | `verifier_worker` | Vérification indépendante, outils de test sûrs, rapport de vérification. |
| Épistémique | `red_worker` | Revue adversariale fondée sur le preset de vérification. |
| Épistémique | `experimental_worker` | Mission expérimentale avec dossier de mesures. |
| Épistémique | `formal_worker` | Exécution déterministe avec certificat formel attendu. |
| Épistémique | `synthesis_worker` | Synthèse conservant les désaccords, sans autorité d’écriture. |
| Adaptation et réparation | `creative_worker` | Production de candidats créatifs, sans promotion directe. |
| Adaptation et réparation | `medical_worker` | Diagnostic avec rapport clinique attendu. |
| Adaptation et réparation | `recovery_worker` | Restauration via lease dédié et nombre d’itérations réduit. |
| Adaptation et réparation | `forensic_worker` | Analyse causale post-incident avec dossier dédié. |
| Organisationnelle | `liaison_worker` | Communication de pont entre groupes. |
| Organisationnelle | `teaching_worker` | Transmission d’une procédure validée dans un paquet de formation. |
| Organisationnelle | `sub_orchestrator` | Coordination locale avec spawn/délégation plafonnés. |

Source des contrats : [`presets.rs`](../../crates/genos-worker/src/presets.rs). La table décrit les garanties encodées par le preset ; elle ne prouve pas à elle seule leur application par les deux runtimes.

## Correspondance avec le registre Node

Le registre Node (`phenotypeRegistryService.js`) décrit surtout des profils d’autorité, cognition, mémoire et communication. Il ne constitue pas un second catalogue complet de `WorkerKind`.

| Phénotype Node | Correspondance de référence | Limite de la correspondance |
|---|---|---|
| `ScoutCell` | `scout_cell` | Correspondance de responsabilité observationnelle ; propagation au dispatch non démontrée. |
| `BoundedWorker` | `bounded_worker` | Correspondance du profil d’exécution bornée ; contrat Rust non appelé par le backend dans les usages recherchés. |
| `AdaptiveWorker` | `adaptive_worker` | Correspondance de l’adaptation locale ; les plafonds doivent rester alignés. |
| `Specialist` | `specialist` | Correspondance de niche ; vérifier la persistance et l’autorité divergentes avant raccordement. |
| `Verifier` | `verifier_worker` | Correspondance du rôle de vérification ; rapport ternaire et indépendance doivent être imposés par le runtime. |
| `ResidentDaemon` | `resident_daemon` | Correspondance de résidence et observation. |
| `SubOrchestrator` | `sub_orchestrator` | Coordination locale ; le contrat Node refuse spawn/délégation tant que le dispatch worker-enfant n’existe pas. |
| `Orchestrator` | Aucun : agent parent | Ce n’est pas un type de worker dans `WorkerKind`. |
| `Reconciler` | Aucun : extension Node | N’appartient pas aux 19 types canoniques. |

Le service `workerKindService.js` expose les 19 identifiants, leurs familles, profils d'autorité de base, règles de mission et artefacts attendus. Les types sans profil Node dédié sont projetés sur un profil d'autorité existant, sans prétendre que cela équivaut à un phénotype spécialisé Rust.

## Rôles et exécuteurs

- Les rôles de mission comme `implementation`, `independent_reviewer`, `analyst` ou `frontend_developer` décrivent une affectation. Ils ne sont pas des identifiants `WorkerKind`.
- `local`, `codex` et `caller_mcp` désignent un exécuteur ou un chemin d’exécution, pas un phénotype.
- Les topologies comme A-Team et Trinity décrivent l’organisation d’une mission ; elles peuvent affecter plusieurs workers sans créer de nouveaux types canoniques.

## État d’intégration

Le crate [`genos-worker`](../../crates/genos-worker/src/lib.rs) expose contrat, cycle, dossier, invariants, phénotypes et presets. Le backend reconstruit le contrat canonique depuis le type persisté, contrôle les actions MCP incompatibles avec l’autorité et valide le contrat à l’amorçage de mission. La barrière refuse un dossier typé sans `evidenceReport.workerArtifact` conforme au schéma du type et sans provenance. Ces contrôles appliquent côté Node les invariants pertinents au runtime backend ; le backend ne charge pas directement le crate Rust. Le dispatch imbriqué n’étant pas pris en charge, le contrat Node du `sub_orchestrator` refuse spawn et délégation au lieu d’annoncer un budget inutilisable.

L’ADR [0044](../adr/0044-matrice-autorite-gates-double-runtime.md) définit une matrice d’autorité Node pour les profils de base. L’ADR [0064](../adr/0064-registre-workerkind-node-et-dispatch.md) décrit le registre canonique Node et son raccordement au dispatch.
