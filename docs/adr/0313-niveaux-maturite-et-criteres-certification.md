# ADR 0282 : Niveaux de maturité et critères de certification

## Statut
Accepté

## Date
2026-10-05

## Contexte
Le plan d'architecture GenOS V3 (Item 4) définit cinq niveaux de maturité pour chaque concept, allant du concept pur (Niveau 0) au déploiement opérationnel (Niveau 5). Ce cadre doit être formalisé pour guider le développement, l'évaluation et la communication sur l'état réel de chaque capacité.

## Décision
Nous adoptons les cinq niveaux de maturité suivants comme standard de gouvernance GenOS :

### Niveau 0 — Concept
- **Définition** : Spécification écrite avec limites explicites, vocabulaire contrôlé.
- **Preuve** : Document ADR, définitions opérationnelles, conditions d'échec.
- **Exemple** : « Conscience subjective » — ADR 0027, adaptateurs bornés seulement.

### Niveau 1 — Prototype simulé
- **Définition** : Implémentation fonctionnelle dans environnement contrôlé (tests unitaires, simulateur).
- **Preuve** : Code qui compile, tests passants, démonstration en bac à sable.
- **Exemple** : Organisme computationnel — `crates/genos-orchestrator/src/organism.rs` + tests.

### Niveau 2 — Test reproductible
- **Définition** : Résultats répétés avec métriques quantitatives, baselines de comparaison.
- **Preuve** : Suite de tests CI, métriques publiées, comparaison à références.
- **Exemple** : Immunité épistémique — `crates/genos-immune/` + `backend/tests/run_validation_suite.js`.

### Niveau 3 — Pilote borné
- **Définition** : Déploiement limité, permissions réduites, supervision humaine obligatoire.
- **Preuve** : Logs d'exécution réelle, traces d'audit, incidents documentés.
- **Exemple** : MCP avec lease `genos-development` — `mcp/index.js`, `integrations/codex/`.

### Niveau 4 — Système auditable
- **Définition** : Traces complètes, rollback automatique, tests adversariaux, revue indépendante.
- **Preuve** : Fossilisation (`genos-store`), reçus biologiques, benchmarks rivaux (ADR 0035, 0269).
- **Exemple** : Orchestration bornée — `kernel_governance.rs`, `kernel_morphogenesis_lease.rs`.

### Niveau 5 — Déploiement opérationnel
- **Définition** : Propriétés vérifiables en production, périmètre défini, SLA mesurés.
- **Preuve** : Monitoring continu, post-mortems, certifications tierces.
- **Exemple** : *Aucun concept n'a encore atteint ce niveau.*

## Règle critique : Plafond métaphysique
Aucun concept relevant de la métaphysique (conscience, qualia, intentionnalité réelle, réalité indépendante, causalité réelle, vérité déduite du succès, reproduction biologique littérale) **ne peut recevoir un niveau supérieur à « Indicateur comportemental documenté » (équivalent Niveau 0 avec tests comportementaux)**.

Cette règle est coercitive : tout ADR prétendant un niveau supérieur pour ces concepts est rejeté par le gate de qualité (`scripts/ci/check_code_quality.py`).

## Vocabulaire contrôlé obligatoire
| Terme interdit | Remplacement obligatoire |
|----------------|-------------------------|
| « Prouve que l'agent est conscient » | « Compatible avec un indicateur comportemental de… » |
| « L'agent comprend vraiment » | « L'agent produit des sorties cohérentes avec… » |
| « Intelligence générale » | « Intelligence collective générale (simulée) » |
| « Organisme biologique » | « Organisme computationnel » |
| « Contrôleur universel » | « Contrôleur multi-application sous contrat de capacités » |
| « Autofix historique » | « Réparation réversible bornée sous lease » |

## Conséquences
- Chaque PR doit indiquer le niveau de maturité visé pour les concepts modifiés.
- Le gate CI vérifie la cohérence niveau/code (pas de claim Niveau 3 sans logs d'audit).
- La matrice de statut (ADR 0283) est mise à jour à chaque release.

## Références
- Plan architecture GenOS V3, Item 4
- ADR 0027 (adaptateurs conscience), ADR 0134 (boucles réflexives = indicateurs)
- ADR 0035 (GMUB/GCAB), ADR 0269 (campagnes rivales)