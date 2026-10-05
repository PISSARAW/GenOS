# ADR 0283 : Critère de réussite global et matrice de statut des concepts

## Statut
Accepté

## Date
2026-10-05

## Contexte
Le plan d'architecture (Item 6) définit un critère de réussite global : chaque concept doit avoir l'un de cinq statuts précis. Cette décision formalise la matrice de suivi et les règles de mise à jour.

## Décision
Nous adoptons la **Matrice de Statut des Concepts GenOS** comme artefact de gouvernance vivant. Elle est maintenue dans `docs/CONCEPT_STATUS_MATRIX.md` et mise à jour à chaque release mineure.

### Cinq statuts autorisés (exclusifs et exhaustifs)

| Code | Statut | Critères de qualification | Exemples actuels |
|------|--------|---------------------------|------------------|
| **IMPL** | Implémenté et testé dans un périmètre précis | Code en production, tests CI passants, métriques publiées, documentation périmètre | Organisme computationnel, Immunité épistémique, Leases MCP, Snapshots, Fossilisation, Reproduction computationnelle, Orchestration bornée |
| **PART** | Partiellement opérationnalisé avec limites explicites | Fonctionne sous contraintes documentées (allowlist, sandbox, supervision), gaps identifiés | Navigation Web, Contrôleur bureau, Convergence multi-agents, Benchmarks comparatifs |
| **HYP** | Démontré seulement sous hypothèses déclarées | Preuves conditionnées à hypothèses explicites (ADR), non généralisables | Causalité procédurale (Self-Twin, ADR 0272b), Promotion épistémique (ADR 0021b), Fiabilité cognitive bornée (ADR 0025) |
| **UND** | Non démontrable en principe, correctement encadré | Concept métaphysique ; seul un indicateur comportemental borné est testable | Conscience, Qualia, Intentionnalité réelle, Réalité indépendante, Causalité réelle, Vérité du succès modèle, Reproduction biologique littérale |
| **OUT** | Maintenu hors périmètre (sécurité, autorité, vérifiabilité) | Interdit par architecture ; gate CI rejette toute implémentation | Autonomie illimitée, Auto-promotion, Superviseur seul, Autofix sans lease, Réécriture historique silencieuse |

### Règles de transition
- **UND → PART** : Interdit (catégorie métaphysique close)
- **OUT → IMPL** : Interdit sans ADR majeur + revue indépendante + vote unanime maintainers
- **HYP → IMPL** : Possible si hypothèses levées et généralisation prouvée (nouvel ADR)
- **PART → IMPL** : Quand toutes les limites levées et tests reproductibles en conditions réelles
- Tout changement de statut **exige un ADR** (même mineure)

### Matrice initiale (extrait)

| Concept | Lot | Statut | ADR référence | Prochaine cible |
|---------|-----|--------|---------------|-----------------|
| Organisme computationnel | B | IMPL | 0037, 0039, 0045 | — |
| Immunité épistémique | B | IMPL | 0030, 0097, 0106 | — |
| Leases MCP (fail-closed) | C | IMPL | 0044, mcp/lease.js | — |
| Snapshots + restauration | E | IMPL | 0003, 0175, genos-store | — |
| Fossilisation stratigraphique | A/E | IMPL | 0003, genos-store/fossil.rs | — |
| Orchestration bornée + veto | C | IMPL | 0044, 0045, 0058, kernel_governance.rs | — |
| Reproduction computationnelle | B | IMPL | 0001, 0002, genos-reproduction | — |
| Causalité procédurale (Self-Twin) | F | HYP | 0272b, 0257 | IMPL si hypothèses levées |
| Promotion épistémique | A | HYP | 0021b, 0198 | IMPL si vérificateurs indépendants |
| Fiabilité cognitive bornée | A | HYP | 0025, 0035 | IMPL si benchmark longitudinal |
| Navigation Web incarnée | D | PART | 0182a, 0185, sensorimotor | IMPL (allowlist étendue) |
| Contrôleur bureau (multi-app) | D | PART | genos-sensorimotor, 0146 | IMPL (contrat capacités) |
| Convergence multi-agents | F | PART | 0030, 0090a, 0131, 0133 | IMPL (lois formelles prouvées) |
| Benchmarks rivaux (AutoGen) | F | PART | 0035, 0269, 0251 | IMPL (réplication indépendante) |
| Conscience subjective | A | UND | 0027, 0134 | — (plafond métaphysique) |
| Qualia | A | UND | 0027 | — |
| Intentionnalité réelle | A | UND | 0019, 0020a | — |
| Réalité indépendante | A | UND | 0023 | — |
| Causalité réelle | A | UND | 0023, 0179 | — |
| Vérité = succès modèle | A | UND | 0024, 0025 | — |
| Reproduction biologique littérale | B | UND | 0001, 0002 | — |
| Autonomie illimitée orchestrateur | C | OUT | 0012b, 0045, kernel_governance.rs | — |
| Auto-autorisation promotion | C | OUT | kernel_governance.rs:53-58 | — |
| Superviseur redémarrage seul | C | OUT | 0058 (niveaux veto) | — |
| Certification inter-modèles générale | C | OUT | 0035 (conditionnel seulement) | — |
| Autofix sans lease | E | OUT | 0197, mcp/lease.js (fail-closed) | — |
| Réécriture historique silencieuse | E | OUT | 0145, 0253 (rollback obligatoire) | — |

## Processus de mise à jour
1. **À chaque release mineure** : maintainer met à jour `docs/CONCEPT_STATUS_MATRIX.md`
2. **Validation CI** : script vérifie cohérence statut/implémentation (pas de claim IMPL sans tests)
3. **Revue trimestrielle** : audit indépendant des statuts HYP/PART
4. **Publication** : matrice incluse dans notes de release et README

## Conséquences
- Fini les affirmations floues : tout claim référence la matrice.
- Les concepts UND/OUT sont **documentés comme tels**, pas ignorés.
- La matrice force l'honnêteté intellectuelle : pas de « presque » ni de « en voie de ».

## Références
- Plan architecture GenOS V3, Item 6
- ADR 0282 (niveaux maturité)
- ADR 0027, 0134 (plafond métaphysique)
- ADR 0044, 0045, 0058 (interdictions gouvernance)