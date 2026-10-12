# ADR 0448 — Lier le monde promu au candidat Trinity

- **Statut** : Accepté
- **Date** : 2026-10-12
- **Domaine** : Trinity, qualification nominale, provenance du candidat

## Contexte

La qualification nominale vérifiait que l'agent source du candidat appartenait
aux mondes initiaux et que la comparaison désignait le numéro retenu par la
décision. Elle acceptait pourtant une base où un autre monde portait le statut
`promoted`, ou où le candidat provenait d'un autre agent initial.

## Décision

La campagne exige exactement un monde au statut `promoted` dans l'expérience,
et ce monde doit appartenir aux mondes initiaux qualifiés. Son numéro
doit être celui de la décision et de la comparaison ; son `agent_id` doit être
le `verification.sourceAgentId` du candidat. Toute divergence produit
`promoted_world_mismatch` et refuse la qualification.

## Limites

Ce contrôle relie les enregistrements durables de la campagne. Les contrôles
d'intégration, la signature AgentGit, les journaux de comparaison et les gates
des variants restent nécessaires. Aucune mission nominale post-correctifs
n'est qualifiée par cette seule modification. La campagne actuelle ne qualifie
pas un gagnant issu d'un monde additionnel tant que sa preuve de rapport et de
snapshot n'est pas reliée au parcours initial.
