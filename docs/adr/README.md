# Décisions d'architecture (ADR)

Un **ADR** (*Architecture Decision Record*) capture une décision structurante : son
contexte, les options considérées, la décision retenue et ses conséquences. La règle
de gouvernance de GenOS impose un ADR pour toute modification d'architecture
(voir [.genos.md](../../.genos.md), règle 5).

## Index

| N° | Titre | Statut | Date | Domaine |
| --- | --- | --- | --- | --- |
| [0001](0001-agent-dna-binary-format.md) | AgentDNA : format héréditaire binaire | Proposé | 2026-09-13 | Génome, reproduction, runtime, persistance |
| [0002](0002-agentdna-innovation-loop.md) | Boucle d'innovation AgentDNA | Proposé | 2026-09-14 | Génome, apprentissage, orchestration, preuve |
| [0003](0003-fossilization-stratigraphic-archive.md) | Fossilisation stratigraphique | Proposé | 2026-09-14 | Persistance, mémoire, orchestration, preuve |
| [0004](0004-instinct-innate-circuits.md) | Instinct : circuits innés et PAF | Proposé | 2026-09-14 | Biomimétique, génome, neurobiologie, sûreté |
| [0005](0005-reorganisation-arborescence-documentaire.md) | Réorganisation de l'arborescence documentaire | Accepté | 2026-09-14 | Documentation, provenance, distribution |
| [0012](0012-volition-autonome-et-preservation.md) | Volition autonome et préservation | Accepté | 2026-09-15 | Orchestration, survie, autonomie |
| [0013](0013-survival-model-control-plane.md) | Modèle de survie dans le control plane | Accepté | 2026-09-16 | Orchestration, budgets, sûreté, biomimétisme |
| [0014](0014-theorie-du-soi-operationnelle.md) | Théorie du soi opérationnelle de l'orchestrator | Accepté | 2026-09-16 | Orchestration, apprentissage, persistance, sûreté |
| [0015](0015-convergence-organisme-cognitif-composite.md) | Convergence d'un organisme cognitif composite | Accepté | 2026-09-16 | Orchestration, contrôle, preuve, sûreté |
| [0016](0016-effets-runtime-philosophiques-controles.md) | Effets runtime philosophiques contrôlés | Accepté | 2026-09-17 | Philosophie, runtime, sûreté |
| [0017](0017-philosophie-politique-et-gouvernance.md) | Philosophie politique et gouvernance contrôlée | Accepté | 2026-09-17 | Philosophie, gouvernance, preuve, sûreté |
| [0018](0018-gouvernance-registre-philosophique.md) | Gouvernance du registre philosophique | Accepté | 2026-09-17 | Philosophie, registre, relations, preuve |
| [0019](0019-socle-epistemique-du-savoir.md) | Socle épistémique du savoir | Accepté | 2026-09-17 | Philosophie, épistémologie, preuves, inférence |
| [0021](0021-promotion-epistemique-des-decisions.md) | Promotion épistémique des décisions | Accepté | 2026-09-17 | Épistémologie, contrats, gates, mémoire |

## Cycle de vie d'un ADR

- **Proposé** — rédigé, en revue.
- **Accepté** — décision appliquée.
- **Remplacé** — obsolète, remplacé par un ADR plus récent (référence croisée obligatoire).
- **Rejeté** — option écartée, conservée pour la traçabilité.

## Ajouter un ADR

1. Créer `docs/adr/NNNN-slug.md` (numérotation à 4 chiffres, jamais réutilisée).
2. Reprendre l'en-tête : `Statut`, `Date`, `Domaine`, `Décideurs`, `Lié à`.
3. Structurer : `Contexte`, `Décision`, `Conséquences` (Positives / Négatives), `Alternatives`.
4. Mettre à jour ce tableau et la section ADR de [../README.md](../README.md).

## Voir aussi

- [../CONVENTIONS.md](../CONVENTIONS.md) — conventions de rédaction et de nommage.
- [../GENOME_EPIGENETIQUE.md](../01-concepts/genome-et-epigenetique.md), [../INSTINCT.md](../01-concepts/instinct.md), [../FOSSILISATION.md](../01-concepts/fossilisation.md), [../AGENT_DNA_RUNTIME.md](../01-concepts/agent-dna-runtime.md) — documents concernés par les ADR ci-dessus.
