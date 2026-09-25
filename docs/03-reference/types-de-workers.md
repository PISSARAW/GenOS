# Types de workers GenOS

- **Statut** : Partiel — les 19 types ont des contrats backend et des validateurs d’artefacts typés ; le dispatch imbriqué du sous-orchestrateur reste désactivé.
- **Portée** : `genos-worker`, registre Node des phénotypes et vocabulaire des rôles de mission.
- **Dernière revue** : 2026-09-24

Ce document fixe le vocabulaire de référence à partir de l’ADR [0043](../adr/0043-runtime-worker-phenotypes.md) et du type Rust `WorkerKind`. Il sépare les types de worker des profils d’autorité Node, des rôles de mission et des exécuteurs. La présence dans ce catalogue ne signifie pas qu’un type est raccordé de bout en bout.

## Familles et types canoniques

Les identifiants canoniques sont les noms runtime en `snake_case` retournés par `WorkerKind::name()`. Les familles sont celles de `family_of()`.

| Famille | Identifiant | Garantie du preset Rust | Critère de complétude de bout en bout |
|---|---|---|---|
| Sensorielle | `scout_cell` | Lecture seule, une itération, dossier `scout_observation`. | Une action d’écriture/exécution est refusée et une observation sourcée passe. |
| Sensorielle | `resident_daemon` | Sondes sûres, signalement de découvertes, durée non plafonnée. | Les sondes autorisées passent, les actions de mission restent refusées et un signal conserve sa provenance. |
| Exécution | `bounded_worker` | Exécution bornée avec lease d’outils, sans spawn. | Une action du lease passe, une action hors lease et un spawn sont refusés. |
| Exécution | `adaptive_worker` | Changements locaux de stratégie plafonnés. | Une stratégie autorisée passe et le dépassement du plafond est refusé. |
| Exécution | `specialist` | Adaptation locale dans une niche déclarée. | Le contrat porte la niche et refuse toute capacité non accordée par celle-ci. |
| Exécution | `procedural_executor` | Procédure déterministe, lease solver, zéro budget de tokens. | Seul le solver loué est accessible et son reçu valide l’exécution. |
| Exécution | `symbiotic_worker` | Hôte procédural, capacités limitées par le contrat hôte. | L’intersection des capacités est appliquée ; une capacité excédentaire est refusée. |
| Épistémique | `verifier_worker` | Vérification indépendante, tests sûrs, rapport de vérification. | Un verdict Accept/Reject/Unresolved étayé passe ; un verdict sans preuve échoue. |
| Épistémique | `red_worker` | Revue adversariale issue du preset de vérification. | Un contre-exemple reproductible est accepté comme résultat ; la promotion directe est refusée. |
| Épistémique | `experimental_worker` | Hypothèse, protocole et mesures dans un dossier dédié. | Les trois champs sont validés et les mesures sont rattachées au protocole. |
| Épistémique | `formal_worker` | Exécution déterministe avec certificat attendu. | Le certificat identifie la proposition, le solveur et son résultat vérifiable. |
| Épistémique | `synthesis_worker` | Synthèse préservant les désaccords, sans écriture. | Les sources et divergences matérielles sont conservées et l’écriture est refusée. |
| Adaptation et réparation | `creative_worker` | Production de candidats sans promotion directe. | Le candidat inclut hypothèses et falsification ; toute promotion directe est refusée. |
| Adaptation et réparation | `medical_worker` | Diagnostic avec rapport clinique attendu. | Diagnostics et incertitude sont sourcés ; aucune action clinique autonome n’est possible. |
| Adaptation et réparation | `recovery_worker` | Restauration par lease dédié et trois itérations maximum. | Seule la restauration louée passe et l’état restauré est prouvé. |
| Adaptation et réparation | `forensic_worker` | Analyse causale post-incident avec dossier dédié. | La chaîne causale référence les éléments observés et distingue faits et hypothèses. |
| Organisationnelle | `liaison_worker` | Communication de pont entre groupes. | Le transfert conserve destinataires, références et provenance ; l’exécution est refusée. |
| Organisationnelle | `teaching_worker` | Procédure validée transmise dans un paquet de formation. | Prérequis, étapes et preuves sont validés ; une procédure non étayée échoue. |
| Organisationnelle | `sub_orchestrator` | Coordination locale bornée : 5 enfants, profondeur 1 dans le preset Rust. | Chaque enfant hérite d’un budget réduit et d’autorisations bornées ; toute limite dépassée est refusée. |

Ces critères sont des exigences de livraison, pas une déclaration de capacité déjà disponible. Un type n’est complet que si les critères positifs et négatifs sont vérifiés dans le runtime concerné.

### Critères communs

Pour chaque type, la vérification doit couvrir : résolution de l’identifiant canonique, persistance et reconstruction du contrat, autorisation/refus des outils, validation de l’artefact attendu, provenance et propagation des échecs. Les scénarios de refus couvrent au minimum un type inconnu, une permission excédentaire et un artefact incomplet. Le critère `sub_orchestrator` ajoute le plafond de budget, la profondeur et l’arrêt des descendants.

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
