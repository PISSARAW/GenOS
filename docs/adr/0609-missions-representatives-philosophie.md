# ADR 0609 — Missions représentatives pour les contrats philosophiques

- Statut : Accepté
- Date : 2026-10-18
- Domaine : philosophie opérationnelle, expérimentation, composition, preuve
- Lié à : [ADR 0326](0326-audits-philosophiques-executables-et-preuves.md), [ADR 0607](0607-audits-specialises-capacites-philosophiques.md)

## Contexte

Les sondes unitaires couvrent les contrats séparément. Elles ne démontrent pas
qu'un ensemble de notions peut détecter puis corriger un état dans une même
mission, ni que contrôle et traitement reçoivent les mêmes entrées et budgets.

## Décision

Exécuter quatre missions locales représentatives : continuité d'identité,
attribution causale, effet biomimétique et obligations bornées. Chaque mission
compose trois contrats et exécute une paire contrôle/traitement sur le même
contre-exemple puis la même correction.

Le reçu mesure les exécutions d'audit, les octets d'observation, les corrections,
les obligations et l'attribution par contrat. Il est lié aux empreintes des
contrats et doit être rejoué intégralement. Un budget de douze exécutions et
64 Kio d'observations est appliqué à chaque mission.

Ces missions exécutent réellement le runtime local d'audit, mais aucune
topologie multi-agent. Elles conservent `actualTopologyExecution: false`,
`externalFactsVerified: false`, `independentValidation: false` et
`promotionEligible: false`.

## Conséquences

- La composition, les corrections et les coûts déterministes deviennent observables.
- Une modification d'un contrat ou d'un reçu invalide le replay.
- Les comparaisons inter-topologies et l'attestation indépendante restent requises.
