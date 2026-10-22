# ADR 0726 — Security Specialist Physiology

- **Statut** : Accepté
- **Date** : 2026-10-22
- **Contexte** : Chantier 2 — Spécialisations physiologiques d'agents de sécurité collaborant sur les fondations A-Team, Trinity et Morphogenèse existantes.

## Contexte et problème

Les topologies A-Team, Trinity et Morphogenèse sont déjà câblées dans GenOS V3, mais l'investigation et la réponse aux incidents de sécurité nécessitent six spécialistes au périmètre strictement borné capables de travailler ensemble sans empiéter sur leurs responsabilités respectives ni s'auto-promouvoir :

1. **Network Analyst** (`network_analyst`) — Réseau, routage, ports et pfSense.
2. **Windows Analyst** (`windows_analyst`) — AD, GPO, ACL et journaux Windows.
3. **Threat Analyst** (`threat_analyst`) — Hypothèses d'incidents et qualification.
4. **Forensic Analyst** (`forensic_analyst`) — Chronologie, intégrité et corrélation.
5. **Remediation Planner** (`remediation_planner`) — Solutions, dépendances et conséquences.
6. **Independent Auditor** (`independent_auditor`) — Validation indépendante et contradictions.

## Décision

Nous introduisons le module `backend/src/services/securitySpecialistPhysiology/` (exposé via `securitySpecialistPhysiologyService.js`) sans réinventer A-Team, Trinity ni les 20 `WorkerKind` canoniques Rust/Node :

1. **Ancrage dans les `WorkerKind` existants** :
   - `network_analyst`, `windows_analyst` et `remediation_planner` sont projetés sur `specialist` (`dossier` + `specialtyAssessment`).
   - `forensic_analyst` est projeté sur `forensic_worker` (`causal_dossier`).
   - `threat_analyst` est projeté sur `red_worker` (`verification_report` avec `counterexamples`).
   - `independent_auditor` est projeté sur `verifier_worker` (`verification_report`).
2. **Permissions minimales et capacités réellement accessibles** :
   - Chaque spécialiste est instancié avec `write: false`, `promote: false`, `spawn: false`, `delegate: false`, `topology: false`.
   - Chaque capacité déclarée est vérifiée contre `capabilityAccessMatrix.accessFor` (`ACCESS_MCP_TOOL`) et `toolReadiness` afin qu'aucune capacité conceptuelle ou non routable ne soit déclarée.
3. **Contrats de sortie vérifiables et collaboration A-Team** :
   - `verifySpecialistOutput` valide à la fois l'artefact canonique (`validateWorkerArtifact`) et le schéma métier propre à chaque spécialiste, et rejette toute tentative d'auto-promotion (`promotionEligible: true`).
   - `buildSecuritySpecialistRoster` et `runCollaborativeSecurityReview` compilent le graphe de travail A-Team (`compileWorkGraph`), vérifient l'absence de chevauchement de propriété (`authorityMatrixService`), valident les 12 handoffs inter-spécialistes (`validateHandoff`) et préservent les contradictions détectées par l'`Independent Auditor`.

## Conséquences

- La parité stricte des 20 `WorkerKind` entre Rust (`crates/genos-worker`) et Node.js est préservée.
- Aucune action hors mandat ni outil hors bail minimal ne peut être exécuté par un spécialiste.
- Les contradictions soulevées lors de l'audit indépendant bloquent toute promotion silencieuse.
